/**
 * emailHunter.ts — Contact enrichment layers 2, 3, 4
 *
 * Layer 2: Hunter.io  — domain-level email search (TODO: needs API key / paid plan)
 * Layer 3: Apollo.io  — people search by title   (TODO: needs Apollo account)
 * Layer 4: SMTP probe — direct MX verification   (implemented in smtpVerify.ts)
 */

// ─── Layer 2: Hunter.io ───────────────────────────────────────────────────────
// TODO: implement when HUNTER_API_KEY paid plan is active.
// Expected: GET https://api.hunter.io/v2/domain-search?domain=<domain>&api_key=<key>
// Returns: emails[], emailFormat string

export interface HunterResult {
  emails: string[];
  format: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function huntDomain(_domain: string): Promise<HunterResult> {
  // TODO: Hunter.io integration
  // const key = process.env.HUNTER_API_KEY;
  // if (!key) return { emails: [], format: null };
  // const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${domain}&api_key=${key}`);
  // ...
  return { emails: [], format: null };
}

// ─── Layer 3: Apollo.io ───────────────────────────────────────────────────────
// TODO: implement when Apollo account is available.
// Expected: POST https://api.apollo.io/v1/people/search with title filters
// Targets: "Commercial Director", "Fleet Manager", "Sale Purchase Manager"

export interface ApolloContact {
  name:  string;
  title: string;
  email: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function searchApolloContacts(_companyName: string): Promise<ApolloContact[]> {
  // TODO: Apollo.io integration
  // const key = process.env.APOLLO_API_KEY;
  // if (!key) return [];
  // ...
  return [];
}

// ─── Layer 4: SMTP verify ─────────────────────────────────────────────────────
// Re-export from smtpVerify.ts for unified import
export { verifyEmail, verifyEmails, type SmtpVerifyResult, type SmtpVerifyStatus } from "./smtpVerify";
