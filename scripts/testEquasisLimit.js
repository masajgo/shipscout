"use strict";
/**
 * testEquasisLimit.js
 *
 * Equasis rate-limit tester:
 *   - Her batch'te BATCH_SIZE sorgu yapar (5-8s delay)
 *   - BATCH_INTERVAL_MIN dakika arayla batch çalıştırır
 *   - Block gelince 60 dakika bekler ve yeniden dener
 *   - Sonucu equasis_limit_test.json'a yazar: "hourly" veya "daily"
 *
 * node scripts/testEquasisLimit.js
 */

const path    = require("path");
const fs      = require("fs");
const { chromium } = require("playwright");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const { login } = require("../scraper/equasisOwner");

const EMAIL    = process.env.EQUASIS_EMAIL;
const PASSWORD = process.env.EQUASIS_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error("EQUASIS_EMAIL / EQUASIS_PASSWORD not set in .env.local");
  process.exit(1);
}

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE         = 50;     // queries per batch
const BATCH_INTERVAL_MIN = 10;     // minutes between batches
const DELAY_MIN_MS       = 5000;
const DELAY_MAX_MS       = 8000;
const RETRY_WAIT_MIN     = 60;     // wait after block before retry

const DATA_DIR    = path.join(__dirname, "../scraper/data");
const USAGE_FILE  = path.join(DATA_DIR, "equasis_usage.json");
const RESULT_FILE = path.join(__dirname, "../equasis_limit_test.json");

const EQUASIS_HOME   = "https://www.equasis.org/EquasisWeb/public/HomePage?fs=HomePage";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms)  { return new Promise(r => setTimeout(r, ms)); }
function rndDelay() { return sleep(DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS)); }
function now()      { return new Date().toTimeString().slice(0, 5); }    // "HH:MM"
function tsLabel()  { return `[${now()}]`; }
function log(msg)   { process.stdout.write(`${tsLabel()} ${msg}\n`); }

function loadUsage() {
  const today = new Date().toISOString().slice(0, 10);
  if (!fs.existsSync(USAGE_FILE)) return { date: today, count: 0 };
  try {
    const u = JSON.parse(fs.readFileSync(USAGE_FILE, "utf8"));
    return u.date !== today ? { date: today, count: 0 } : u;
  } catch { return { date: today, count: 0 }; }
}

function saveUsage(u) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USAGE_FILE, JSON.stringify(u, null, 2));
}

function detectBlock(html) {
  const lower = html.toLowerCase();
  return (
    /rate.?limit|daily.?limit|access.?limit|query.?limit|too many request|maximum number of|quota.?exceed|you have been blocked|your access/i.test(html) ||
    /captcha/i.test(html) ||
    (lower.includes("j_password") && lower.includes("j_email") && !lower.includes("logout"))
  );
}

// Large pool of real IMOs to cycle through
const IMO_POOL = [
  9038828,9038749,9248904,9065572,9074705,9200811,9038880,8912522,9108128,9015101,
  9083940,9040089,9205201,9136199,9027099,9056870,9034171,9142538,9067180,9108752,
  9080950,9102887,9321483,9461978,9416771,9388604,9310756,9280971,9279405,9322799,
  9388616,9310768,9398776,9453408,9388628,9338814,9384229,9347560,9421966,9411491,
  9416783,9294300,9285454,9294312,9321495,9295094,9388630,9421978,9285466,9338826,
  9421980,9421992,9289760,9289772,9338838,9384231,9321502,9421954,9347572,9388654,
  9294324,9338840,9416795,9285478,9347584,9338852,9421916,9295109,9285480,9338864,
  9388666,9388678,9416802,9294336,9279417,9279429,9310781,9310793,9388692,9388718,
  9388720,9338876,9279431,9279443,9310800,9310812,9338888,9338905,9338917,9338929,
  9338931,9338943,9338955,9338967,9338979,9338981,9338993,9339001,9339013,9339025,
];

// ─── Single search hit (search page only, no detail navigation) ───────────────

async function doSearchHit(page, imo) {
  await page.goto(EQUASIS_HOME, { waitUntil: "domcontentloaded", timeout: 20000 });

  const searchInput = page.locator('input[placeholder*="IMO"]').first();
  await searchInput.waitFor({ state: "visible", timeout: 10000 });
  await searchInput.fill(String(imo));

  await Promise.all([
    page.waitForLoadState("domcontentloaded"),
    searchInput.press("Enter"),
  ]);
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

  const html = await page.content();
  return { html, blocked: detectBlock(html) };
}

// ─── Run one batch ─────────────────────────────────────────────────────────────

async function runBatch(page, batchNum, startImoIdx) {
  const usage    = loadUsage();
  let hourCount  = 0;
  let blocked    = false;
  let blockedAt  = null;

  for (let i = 0; i < BATCH_SIZE; i++) {
    const imo = IMO_POOL[(startImoIdx + i) % IMO_POOL.length];
    await rndDelay();

    try {
      const { html, blocked: isBlocked } = await doSearchHit(page, imo);
      if (isBlocked) {
        blocked   = true;
        blockedAt = { count: usage.count + hourCount, time: now(), imo };
        log(`⛔ BLOCKED at IMO ${imo}! Total queries today: ${blockedAt.count}`);
        break;
      }
      hourCount++;
      usage.count++;
      saveUsage(usage);
    } catch (err) {
      if (err.message.includes("EQUASIS_SESSION_EXPIRED") || err.message.includes("Login")) {
        log(`  Session expired — re-login…`);
        await login(page);
        i--; // retry same IMO
        continue;
      }
      if (err.message.includes("EQUASIS_BLOCK") || err.message.includes("429") || err.message.includes("403")) {
        blocked   = true;
        blockedAt = { count: usage.count, time: now(), imo };
        log(`⛔ BLOCKED (error) at IMO ${imo}! Total queries today: ${blockedAt.count}`);
        break;
      }
      log(`  ⚠ Error for IMO ${imo}: ${err.message.slice(0, 60)}`);
    }
  }

  return { hourCount, blocked, blockedAt };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`=== Equasis Rate Limit Test ===`);
  log(`Batch size: ${BATCH_SIZE} | Interval: ${BATCH_INTERVAL_MIN}min | Delay: ${DELAY_MIN_MS/1000}-${DELAY_MAX_MS/1000}s`);

  const initialUsage = loadUsage();
  log(`Today's usage so far: ${initialUsage.count} queries`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const result = {
    started_at:         now(),
    initial_count:      initialUsage.count,
    blocked_at_count:   null,
    blocked_at_time:    null,
    resumed_after_1h:   null,
    resumed_count:      null,
    conclusion:         null,
    batches:            [],
  };

  let batchNum   = 0;
  let imoIdx     = 0;
  let totalBlocked = false;

  try {
    await login(page);
    log("Login OK ✓\n");

    while (true) {
      batchNum++;
      const bStart = Date.now();
      log(`── Batch #${batchNum} start (${BATCH_SIZE} queries) ──`);

      const { hourCount, blocked, blockedAt } = await runBatch(page, batchNum, imoIdx);
      imoIdx += BATCH_SIZE;

      const usage = loadUsage();
      const status = blocked ? "BLOCKED" : "OK";
      const batchEntry = {
        batch:       batchNum,
        time:        now(),
        batch_count: hourCount,
        total_today: usage.count,
        status,
      };
      result.batches.push(batchEntry);

      log(`── Batch #${batchNum} done. This batch: ${hourCount} queries, Today total: ${usage.count}. Status: ${status}\n`);

      // Save intermediate result
      fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));

      if (blocked) {
        result.blocked_at_count = blockedAt.count;
        result.blocked_at_time  = blockedAt.time;
        totalBlocked = true;

        log(`\n🕐 Waiting ${RETRY_WAIT_MIN} minutes before retry to determine hourly vs daily limit…`);
        log(`   (Block occurred at ${blockedAt.time}, total queries: ${blockedAt.count})`);
        log(`   Sleeping until ${new Date(Date.now() + RETRY_WAIT_MIN * 60 * 1000).toTimeString().slice(0,5)}…\n`);

        await sleep(RETRY_WAIT_MIN * 60 * 1000);

        // Retry after 1 hour
        log(`Retrying after ${RETRY_WAIT_MIN} min wait…`);
        try {
          await login(page);
          const retryImo = IMO_POOL[0];
          const { html, blocked: stillBlocked } = await doSearchHit(page, retryImo);

          if (stillBlocked) {
            result.resumed_after_1h = false;
            result.conclusion       = "daily";
            log(`❌ Still BLOCKED after ${RETRY_WAIT_MIN}min → DAILY LIMIT`);
          } else {
            result.resumed_after_1h = true;
            result.resumed_count    = loadUsage().count;
            result.conclusion       = "hourly";
            log(`✅ Working again after ${RETRY_WAIT_MIN}min → HOURLY LIMIT`);
          }
        } catch (retryErr) {
          result.resumed_after_1h = false;
          result.conclusion       = "daily";
          log(`❌ Retry login failed: ${retryErr.message} → assuming DAILY LIMIT`);
        }

        break; // Done testing
      }

      // No block — wait before next batch
      if (batchNum >= 20) {
        log(`Reached 20 batches (${batchNum * BATCH_SIZE} queries) without block. Test complete — no limit hit.`);
        result.conclusion = "none_hit";
        break;
      }

      const elapsed = Date.now() - bStart;
      const waitMs  = Math.max(0, BATCH_INTERVAL_MIN * 60 * 1000 - elapsed);
      log(`Next batch in ${Math.round(waitMs / 60000)} min…\n`);
      await sleep(waitMs);
    }

  } finally {
    await browser.close().catch(() => {});
  }

  // Final save
  fs.writeFileSync(RESULT_FILE, JSON.stringify(result, null, 2));

  log(`\n=== RESULT ===`);
  log(`Blocked at: ${result.blocked_at_count ?? "never"} queries (${result.blocked_at_time ?? "—"})`);
  log(`Resumed after 1h: ${result.resumed_after_1h ?? "—"}`);
  log(`Conclusion: ${result.conclusion ?? "—"}`);
  log(`Full result → equasis_limit_test.json`);
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
