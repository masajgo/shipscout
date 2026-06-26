import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime     = "nodejs";
export const maxDuration = 30;

// ─── helpers ───────────────────────────────────────────────────────────────────

function pushParam(params: unknown[], val: unknown): string {
  params.push(val);
  return `$${params.length}`;
}

// ─── GET /api/vessels/search ───────────────────────────────────────────────────
//
// Query params:
//   hasContact   boolean (default true)
//   emailStatus  comma-sep: verified,catch-all,unchecked
//   scrapRisk    comma-sep: critical,high,medium
//   ageMin, ageMax
//   type         comma-sep vessel types
//   flag         partial match
//   dwtMin, dwtMax
//   ldtMin, ldtMax
//   specialSurvey6mo  boolean
//   hasDetention      boolean
//   page         (1-based, default 1)
//   limit        (default 50, max 200)
//   csv          boolean — stream CSV instead of JSON

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;

  const hasContact      = p.get("hasContact") !== "false";
  const emailStatus     = p.get("emailStatus")?.split(",").filter(Boolean) ?? [];
  const scrapRisk       = p.get("scrapRisk")?.split(",").filter(Boolean) ?? [];
  const ageMin          = p.get("ageMin")   ? parseInt(p.get("ageMin")!)   : null;
  const ageMax          = p.get("ageMax")   ? parseInt(p.get("ageMax")!)   : null;
  const typeFilter      = p.get("type")?.split(",").filter(Boolean) ?? [];
  const flagFilter      = p.get("flag")?.trim() ?? "";
  const dwtMin          = p.get("dwtMin")   ? parseInt(p.get("dwtMin")!)   : null;
  const dwtMax          = p.get("dwtMax")   ? parseInt(p.get("dwtMax")!)   : null;
  const ldtMin          = p.get("ldtMin")   ? parseInt(p.get("ldtMin")!)   : null;
  const ldtMax          = p.get("ldtMax")   ? parseInt(p.get("ldtMax")!)   : null;
  const specialSurvey6mo = p.get("specialSurvey6mo") === "true";
  const hasDetention    = p.get("hasDetention") === "true";
  const page            = Math.max(1, parseInt(p.get("page") ?? "1"));
  const limit           = Math.min(200, Math.max(1, parseInt(p.get("limit") ?? "50")));
  const csv             = p.get("csv") === "true";

  const params: unknown[] = [];
  const where: string[]   = [];

  // ── contact filter ──────────────────────────────────────────────────────────
  if (hasContact) {
    where.push(`(
      o.best_email IS NOT NULL OR o.email IS NOT NULL
      OR (o.emails IS NOT NULL AND array_length(o.emails,1) > 0)
      OR (o.phones IS NOT NULL AND array_length(o.phones,1) > 0)
    )`);
  }

  // ── email status ────────────────────────────────────────────────────────────
  if (emailStatus.length) {
    const statusChecks = emailStatus.map(s => {
      if (s === "unchecked") {
        return `(o.best_email IS NULL
          OR o.email_validations IS NULL
          OR o.email_validations->>(COALESCE(o.best_email, o.email)) IS NULL
          OR o.email_validations->(COALESCE(o.best_email, o.email))->>'status' = ${pushParam(params, "unchecked")})`;
      }
      return `o.email_validations->(COALESCE(o.best_email, o.email))->>'status' = ${pushParam(params, s)}`;
    });
    where.push(`(${statusChecks.join(" OR ")})`);
  }

  // ── scrap risk ──────────────────────────────────────────────────────────────
  if (scrapRisk.length) {
    const riskMap: Record<string, string> = {
      critical: "scrap_score >= 70",
      high:     "scrap_score >= 50 AND scrap_score < 70",
      medium:   "scrap_score >= 25 AND scrap_score < 50",
    };
    const riskClauses = scrapRisk.map(r => riskMap[r]).filter(Boolean);
    if (riskClauses.length) where.push(`(${riskClauses.map(c => `v.${c}`).join(" OR ")})`);
  }

  // ── age ─────────────────────────────────────────────────────────────────────
  if (ageMin !== null) where.push(`v.age >= ${pushParam(params, ageMin)}`);
  if (ageMax !== null) where.push(`v.age <= ${pushParam(params, ageMax)}`);

  // ── vessel type ─────────────────────────────────────────────────────────────
  if (typeFilter.length) {
    const ph = pushParam(params, typeFilter);
    where.push(`v.type_specific = ANY(${ph}::text[])`);
  }

  // ── flag ────────────────────────────────────────────────────────────────────
  if (flagFilter) {
    where.push(`v.flag ILIKE ${pushParam(params, `%${flagFilter}%`)}`);
  }

  // ── DWT ─────────────────────────────────────────────────────────────────────
  if (dwtMin !== null) where.push(`v.deadweight >= ${pushParam(params, dwtMin)}`);
  if (dwtMax !== null) where.push(`v.deadweight <= ${pushParam(params, dwtMax)}`);

  // ── LDT ─────────────────────────────────────────────────────────────────────
  if (ldtMin !== null) where.push(`v.ldt >= ${pushParam(params, ldtMin)}`);
  if (ldtMax !== null) where.push(`v.ldt <= ${pushParam(params, ldtMax)}`);

  // ── special survey ──────────────────────────────────────────────────────────
  if (specialSurvey6mo) {
    where.push(`v.special_survey_date BETWEEN NOW() AND NOW() + INTERVAL '6 months'`);
  }

  // ── detention ───────────────────────────────────────────────────────────────
  if (hasDetention) {
    where.push(`v.detention_count > 0`);
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const SELECT = `
    v.imo, v.mmsi, v.name, v.type_specific AS type, v.flag, v.built_year,
    v.age, v.deadweight, v.ldt, v.ldt_estimated, v.scrap_score, v.scrap_category,
    v.detention_count, v.deficiency_count, v.special_survey_date,
    v.manager_name AS vessel_manager,
    o.best_email, o.email AS owner_email, o.emails, o.phones,
    o.email_validations, o.website, o.linkedin_company_url,
    o.owner_name, o.manager_name AS contact_manager
  `;

  const FROM = `FROM vessels v LEFT JOIN owners o ON v.imo = o.imo`;

  // ── count ───────────────────────────────────────────────────────────────────
  let total = 0;
  try {
    const countRes = await pool.query(
      `SELECT COUNT(*) ${FROM} ${whereClause}`,
      params,
    );
    total = parseInt(countRes.rows[0].count);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }

  // ── CSV export ───────────────────────────────────────────────────────────────
  if (csv) {
    try {
      const { rows } = await pool.query(
        `SELECT ${SELECT} ${FROM} ${whereClause} ORDER BY v.scrap_score DESC NULLS LAST LIMIT 5000`,
        params,
      );

      const headers = ["IMO","Name","Type","Flag","Age","DWT","LDT","ScrapScore","BestEmail","Phone","Website","Manager","DetentionCount"];
      const lines   = [
        headers.join(","),
        ...rows.map(r => [
          r.imo, `"${(r.name||"").replace(/"/g,'""')}"`,
          `"${(r.type||"").replace(/"/g,'""')}"`,
          `"${(r.flag||"").replace(/"/g,'""')}"`,
          r.age ?? "",
          r.deadweight ?? "",
          r.ldt ?? "",
          r.scrap_score ?? "",
          r.best_email || r.owner_email || (r.emails?.[0] ?? ""),
          r.phones?.[0] ?? "",
          r.website ?? "",
          `"${(r.contact_manager || r.vessel_manager || "").replace(/"/g,'""')}"`,
          r.detention_count ?? 0,
        ].join(",")),
      ];

      return new NextResponse(lines.join("\n"), {
        headers: {
          "Content-Type":        "text/csv",
          "Content-Disposition": `attachment; filename="shipscout-vessels-${Date.now()}.csv"`,
        },
      });
    } catch (e: unknown) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  }

  // ── paginated results ────────────────────────────────────────────────────────
  const offset = (page - 1) * limit;

  try {
    const { rows } = await pool.query(
      `SELECT ${SELECT} ${FROM} ${whereClause}
       ORDER BY v.scrap_score DESC NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      results: rows.map(r => {
        const emailKey = r.best_email || r.owner_email || r.emails?.[0] || null;
        const emailStatus = emailKey
          ? (r.email_validations?.[emailKey] as Record<string, string> | undefined)?.status ?? "unchecked"
          : null;
        return {
          imo:            r.imo,
          mmsi:           r.mmsi,
          name:           r.name,
          type:           r.type,
          flag:           r.flag,
          age:            r.age,
          builtYear:      r.built_year,
          deadweight:     r.deadweight,
          ldt:            r.ldt,
          ldtEstimated:   r.ldt_estimated,
          scrapScore:     r.scrap_score,
          scrapCategory:  r.scrap_category,
          detentionCount: r.detention_count,
          deficiencyCount:r.deficiency_count,
          specialSurveyDate: r.special_survey_date,
          manager:        r.contact_manager || r.vessel_manager,
          ownerName:      r.owner_name,
          bestEmail:      emailKey,
          emailStatus,
          phone:          r.phones?.[0] ?? null,
          website:        r.website,
          linkedinUrl:    r.linkedin_company_url,
        };
      }),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
