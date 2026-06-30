import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/search?q=<term>&limit=20
//
// Resolution order:
//   1. Pure digits, 9 chars  → MMSI exact match (PK lookup, O(1))
//   2. Pure digits, 7 chars  → IMO exact match  (indexed)
//   3. Pure digits, other    → try both MMSI and IMO
//   4. Text                  → ts_vector full-text (GIN index)
//                              if 0 results → ILIKE prefix fallback

const MAX_LIMIT = 50;

const SELECT = `
  SELECT
    mmsi::text,
    imo::text,
    name,
    type,
    speed,
    course,
    nav_status,
    ST_Y(geom::geometry)              AS lat,
    ST_X(geom::geometry)              AS lon,
    built_year,
    COALESCE(scrap_score, 0)          AS scrap_score,
    COALESCE(scrap_category, 'low')   AS scrap_category,
    updated_at
  FROM vessels
`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q     = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "20", 10), MAX_LIMIT);

  if (!q) {
    return NextResponse.json({ results: [], query: q });
  }

  try {
    const results = await resolve(q, limit);
    return NextResponse.json(
      { results, query: q, count: results.length },
      { headers: { "Cache-Control": "public, s-maxage=10, stale-while-revalidate=30" } },
    );
  } catch (err: any) {
    return NextResponse.json({ error: "database error", detail: err.message }, { status: 503 });
  }
}

async function resolve(q: string, limit: number) {
  const digits = /^\d+$/.test(q);

  // ── Numeric path ──────────────────────────────────────────────────────────
  if (digits) {
    if (q.length === 9) {
      // MMSI: 9 digits — primary key hit
      const { rows } = await pool.query(
        `${SELECT} WHERE mmsi = $1::bigint LIMIT 1`,
        [q],
      );
      if (rows.length) return rows;
    }

    if (q.length === 7) {
      // IMO: 7 digits — indexed
      const { rows } = await pool.query(
        `${SELECT} WHERE imo = $1::bigint LIMIT $2`,
        [q, limit],
      );
      if (rows.length) return rows;
    }

    // Ambiguous number — try MMSI first (exact), then IMO prefix
    const { rows } = await pool.query(
      `${SELECT}
       WHERE mmsi = $1::bigint OR imo = $1::bigint
       LIMIT $2`,
      [q, limit],
    );
    return rows;
  }

  // ── Text path ─────────────────────────────────────────────────────────────

  // 1. Full-text search (GIN index on to_tsvector('simple', name))
  const { rows: ftRows } = await pool.query(
    `${SELECT}
     WHERE to_tsvector('simple', COALESCE(name, ''))
           @@ plainto_tsquery('simple', $1)
     ORDER BY updated_at DESC
     LIMIT $2`,
    [q, limit],
  );
  if (ftRows.length) return ftRows;

  // 2. Prefix ILIKE fallback — still uses the GIN index for short prefixes
  //    via pg_trgm if installed, otherwise seq scan on small tables
  const { rows: likeRows } = await pool.query(
    `${SELECT}
     WHERE name ILIKE $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [`${q}%`, limit],
  );
  if (likeRows.length) return likeRows;

  // 3. Substring ILIKE — most expensive, last resort
  const { rows: subRows } = await pool.query(
    `${SELECT}
     WHERE name ILIKE $1
     ORDER BY updated_at DESC
     LIMIT $2`,
    [`%${q}%`, limit],
  );
  return subRows;
}
