/**
 * emailHunter.ts — Contact enrichment layers 2, 3, 4
 *
 * Layer 2: Hunter.io  — domain-level email search (HUNTER_API_KEY)
 * Layer 3: Apollo.io  — people search by title   (TODO: needs APOLLO_API_KEY)
 * Layer 4: SMTP probe — direct MX verification   (implemented in smtpVerify.ts)
 */

// ─── Layer 2: Hunter.io ───────────────────────────────────────────────────────

export interface HunterEmail {
  email:       string;
  type:        "generic" | "personal";
  confidence:  number;
  firstName:   string | null;
  lastName:    string | null;
  position:    string | null;
}

export interface HunterResult {
  emails:      HunterEmail[];
  format:      string | null;
  organization: string | null;
}

export async function huntDomain(domain: string): Promise<HunterResult> {
  const key = process.env.HUNTER_API_KEY;
  if (!key) return { emails: [], format: null, organization: null };

  try {
    const url = `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${key}&limit=10`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return { emails: [], format: null, organization: null };

    const json = await res.json() as {
      data?: {
        emails?: Array<{
          value: string;
          type: string;
          confidence: number;
          first_name?: string | null;
          last_name?: string | null;
          position?: string | null;
        }>;
        pattern?: string;
        organization?: string;
      };
    };

    const data = json.data;
    if (!data) return { emails: [], format: null, organization: null };

    const emails: HunterEmail[] = (data.emails ?? []).map(e => ({
      email:      e.value,
      type:       e.type === "personal" ? "personal" : "generic",
      confidence: e.confidence ?? 0,
      firstName:  e.first_name ?? null,
      lastName:   e.last_name ?? null,
      position:   e.position ?? null,
    }));

    // Convert Hunter's pattern (e.g. "{first}.{last}@domain.com") to our format
    let format: string | null = null;
    if (data.pattern) {
      const p = data.pattern.replace(/@.*/, "").toLowerCase();
      if (p === "{first}.{last}")           format = `first.last@${domain}`;
      else if (p === "{f}.{last}")          format = `first_initial.last@${domain}`;
      else if (p === "{first}{last}")       format = `firstlast@${domain}`;
      else if (p === "{first}-{last}")      format = `first-last@${domain}`;
    }

    return { emails, format, organization: data.organization ?? null };
  } catch {
    return { emails: [], format: null, organization: null };
  }
}

// ─── Layer 3: Apollo.io ───────────────────────────────────────────────────────
// TODO: implement when APOLLO_API_KEY is available.
// Free tier: 600 people-search credits/month
// POST https://api.apollo.io/v1/people/search
// Targets: "Commercial Director", "Fleet Manager", "Sale Purchase Manager"

export interface ApolloContact {
  name:  string;
  title: string;
  email: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchApolloContacts(_companyName: string): Promise<ApolloContact[]> {
  const key = process.env.APOLLO_API_KEY;
  if (!key) return [];
  // TODO: implement Apollo people search
  return [];
}

// ─── Layer 4: SMTP verify ─────────────────────────────────────────────────────
export { verifyEmail, verifyEmails, type SmtpVerifyResult, type SmtpVerifyStatus } from "./smtpVerify";
