import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime     = "nodejs";
export const maxDuration = 15;

// POST /api/emails/validate
// Body: { email: string; imo: string; category?: "guessed" | "dept" | "generic" }
//
// Lazy validation rules:
//   - dept/generic → return existing status (no ZeroBounce call)
//   - guessed      → ZeroBounce if not already validated, protected MX → skip
//   - budget 100/month → hard stop, return unchecked
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email    = body?.email?.trim().toLowerCase();
  const imo      = body?.imo;
  const category = body?.category ?? "guessed"; // "guessed" | "dept" | "generic"

  if (!email || !imo) {
    return NextResponse.json({ error: "email and imo required" }, { status: 400 });
  }

  // 1. Load existing validation from owners table
  let existingValidations: Record<string, unknown> = {};
  try {
    const { rows } = await pool.query(
      "SELECT email_validations FROM owners WHERE imo = $1::bigint",
      [imo],
    );
    existingValidations = (rows[0]?.email_validations as Record<string, unknown>) ?? {};
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }

  // 2. Return cached result for dept/generic — never call ZeroBounce
  if (category !== "guessed") {
    const cached = existingValidations[email] as Record<string, unknown> | undefined;
    return NextResponse.json({
      email,
      status:    cached?.status    ?? "unchecked",
      isRole:    cached?.isRole    ?? false,
      protected: cached?.protected ?? false,
      source:    cached?.source    ?? "local",
      fromCache: true,
    });
  }

  // 3. Guessed email — lazy ZeroBounce via validateOnOutreach
  // Dynamic import keeps the heavy scraper code out of the Next.js bundle
  let result: Record<string, unknown>;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateOnOutreach, zbBudget } = require("../../../../../scraper/contactEnrichment");

    const budget = zbBudget();
    if (!budget.ok) {
      return NextResponse.json({
        email, status: "unchecked", isRole: false, protected: false,
        source: "local", fromCache: false,
        warning: `ZeroBounce aylık limit doldu (${budget.count}/100)`,
      });
    }

    const zbKey = process.env.ZEROBOUNCE_API_KEY ?? null;
    result = await validateOnOutreach(email, zbKey, existingValidations);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // 4. Persist result back to owners table
  if (result.status && result.status !== "unchecked") {
    try {
      await pool.query(
        `UPDATE owners
         SET email_validations = jsonb_set(
           COALESCE(email_validations, '{}'),
           $2::text[],
           $3::jsonb
         )
         WHERE imo = $1::bigint`,
        [
          imo,
          `{${email}}`,
          JSON.stringify({ ...result, checkedAt: new Date().toISOString() }),
        ],
      );
    } catch { /* non-fatal — result still returned */ }
  }

  return NextResponse.json({ email, ...result });
}
