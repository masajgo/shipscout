/**
 * smtpVerify.ts — Layer 4 email verification via direct SMTP probe
 *
 * Connects to the recipient domain's MX server and issues a RCPT TO
 * command without sending any mail. This catches invalid addresses that
 * ZeroBounce might miss, and works without API credits.
 *
 * Constraints:
 *  - Node.js runtime only (uses net module — not compatible with edge)
 *  - Max 1 concurrent connection per domain (domain concurrency lock)
 *  - 10 s total timeout per probe
 *  - Graceful on blocked ports: returns "unchecked" rather than throwing
 *  - Never calls VesselFinder / MarineTraffic
 */

// Node.js runtime only — guard against accidental edge import
if (typeof process === "undefined" || !process.versions?.node) {
  throw new Error("smtpVerify: Node.js runtime required");
}

import net  from "net";
import dns  from "dns/promises";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SmtpVerifyStatus =
  | "verified"   // 250 from RCPT TO — address accepted
  | "invalid"    // 550 / 551 / 553 — address rejected
  | "catch-all"  // server accepted a random probe address too
  | "greylisted" // 451 / 421 / 450 — try again later
  | "blocked"    // port 25 unreachable from this network
  | "unchecked"; // any other error (timeout, TLS required, etc.)

export interface SmtpVerifyResult {
  status:    SmtpVerifyStatus;
  detail:    string;          // raw server response line
  mxHost:    string | null;
  checkedAt: string;
}

// ─── Domain concurrency lock (max 1 SMTP session per domain at a time) ────────

const domainLocks = new Map<string, Promise<unknown>>();

function withDomainLock<T>(domain: string, fn: () => Promise<T>): Promise<T> {
  const prior = domainLocks.get(domain) ?? Promise.resolve();
  const next = prior.then(fn);
  // Clean up after completion (success or failure)
  next.finally(() => { if (domainLocks.get(domain) === next) domainLocks.delete(domain); });
  domainLocks.set(domain, next);
  return next;
}

// ─── MX lookup ────────────────────────────────────────────────────────────────

async function getMxHost(domain: string): Promise<string | null> {
  try {
    const records = await dns.resolveMx(domain);
    if (!records.length) return null;
    records.sort((a, b) => a.priority - b.priority);
    return records[0].exchange;
  } catch {
    return null;
  }
}

// ─── SMTP probe ───────────────────────────────────────────────────────────────

const TIMEOUT_MS = 10_000;
const HELO_DOMAIN = "shipscout.io";
const PROBE_FROM  = "verify@shipscout.io";

function smtpProbe(mxHost: string, email: string): Promise<SmtpVerifyResult> {
  const domain  = email.split("@")[1];
  const checkedAt = new Date().toISOString();

  return new Promise((resolve) => {
    let settled = false;
    let response = "";

    function done(result: SmtpVerifyResult) {
      if (settled) return;
      settled = true;
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(result);
    }

    const timer = setTimeout(() => {
      done({ status: "unchecked", detail: "timeout", mxHost, checkedAt });
    }, TIMEOUT_MS);

    const sock = net.createConnection({ host: mxHost, port: 25 });
    sock.setEncoding("utf8");
    sock.setTimeout(TIMEOUT_MS);

    sock.on("timeout", () => {
      clearTimeout(timer);
      done({ status: "unchecked", detail: "socket timeout", mxHost, checkedAt });
    });

    sock.on("error", (err) => {
      clearTimeout(timer);
      const isBlocked = err.message.includes("ECONNREFUSED") ||
                        err.message.includes("EHOSTUNREACH") ||
                        err.message.includes("ETIMEDOUT");
      done({ status: isBlocked ? "blocked" : "unchecked", detail: err.message, mxHost, checkedAt });
    });

    // Probe a random address on the same domain to detect catch-all servers
    const randomLocal = `probe-${Math.random().toString(36).slice(2, 10)}`;
    const randomProbe  = `${randomLocal}@${domain}`;
    let catchAllProbed = false;
    let targetAccepted = false;

    type Phase =
      | "greeting" | "ehlo" | "mail_from" | "rcpt_target"
      | "rcpt_probe" | "quit";
    let phase: Phase = "greeting";

    function send(cmd: string) {
      sock.write(cmd + "\r\n");
    }

    function transition(line: string) {
      const code = parseInt(line.slice(0, 3), 10);

      if (phase === "greeting") {
        if (code === 220) { phase = "ehlo"; send(`EHLO ${HELO_DOMAIN}`); return; }
        done({ status: "unchecked", detail: line, mxHost, checkedAt });

      } else if (phase === "ehlo") {
        // Multiline EHLO — wait for final line (no hyphen after code)
        if (line[3] === "-") return; // continuation
        if (code === 250) { phase = "mail_from"; send(`MAIL FROM:<${PROBE_FROM}>`); return; }
        done({ status: "unchecked", detail: line, mxHost, checkedAt });

      } else if (phase === "mail_from") {
        if (code === 250) { phase = "rcpt_target"; send(`RCPT TO:<${email}>`); return; }
        done({ status: "unchecked", detail: line, mxHost, checkedAt });

      } else if (phase === "rcpt_target") {
        targetAccepted = code === 250;
        if (!targetAccepted && (code === 550 || code === 551 || code === 553)) {
          // Definitively rejected — no need for catch-all probe
          phase = "quit"; send("QUIT");
          done({ status: "invalid", detail: line, mxHost, checkedAt });
          return;
        }
        if (!targetAccepted && (code === 451 || code === 421 || code === 450)) {
          phase = "quit"; send("QUIT");
          done({ status: "greylisted", detail: line, mxHost, checkedAt });
          return;
        }
        // code 250 or other — probe for catch-all
        phase = "rcpt_probe"; send(`RCPT TO:<${randomProbe}>`);

      } else if (phase === "rcpt_probe") {
        catchAllProbed = true;
        const probeAccepted = code === 250;
        phase = "quit"; send("QUIT");

        clearTimeout(timer);
        if (!targetAccepted) {
          done({ status: "unchecked", detail: line, mxHost, checkedAt });
        } else if (probeAccepted) {
          done({ status: "catch-all", detail: "catch-all server", mxHost, checkedAt });
        } else {
          done({ status: "verified", detail: line, mxHost, checkedAt });
        }

      } else if (phase === "quit") {
        // ignore
      }
    }

    sock.on("data", (chunk: string) => {
      response += chunk;
      const lines = response.split("\r\n");
      // Keep incomplete last line in buffer
      response = lines.pop() ?? "";
      for (const line of lines) {
        if (!line) continue;
        try { transition(line); } catch { /* ignore parse errors */ }
      }
    });

    sock.on("close", () => {
      clearTimeout(timer);
      if (!settled) {
        done({ status: "unchecked", detail: "connection closed unexpectedly", mxHost, checkedAt });
      }
    });
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Verify a single email address via SMTP probe.
 * Serialized per-domain to avoid hammering mail servers.
 */
export async function verifyEmail(email: string): Promise<SmtpVerifyResult> {
  const checkedAt = new Date().toISOString();
  const domain = email.split("@")[1];
  if (!domain) return { status: "unchecked", detail: "no domain", mxHost: null, checkedAt };

  return withDomainLock(domain, async () => {
    const mxHost = await getMxHost(domain);
    if (!mxHost) return { status: "unchecked", detail: "no MX record", mxHost: null, checkedAt };
    return smtpProbe(mxHost, email);
  });
}

/**
 * Verify a list of emails, one per domain at a time.
 * Domains with multiple addresses are probed sequentially.
 */
export async function verifyEmails(
  emails: string[],
): Promise<Map<string, SmtpVerifyResult>> {
  const results = new Map<string, SmtpVerifyResult>();
  await Promise.all(emails.map(async (email) => {
    results.set(email, await verifyEmail(email));
  }));
  return results;
}
