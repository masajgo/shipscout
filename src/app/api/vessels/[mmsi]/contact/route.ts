import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { enrichCompanyContact, type ContactResult } from "@/lib/contactEnricher";
import fs from "fs";
import path from "path";

export const runtime     = "nodejs";
export const maxDuration = 30;

// ─── File-backed cache (scraper/data/owners.json) ─────────────────────────────
// Shared with the Node scraper so manual scraper runs and live API hits both
// build/use the same artifact.

const OWNERS_CACHE_FILE = path.join(process.cwd(), "scraper", "data", "owners.json");

type OwnerCacheEntry = ContactResult & {
  cachedAt: string;
  // legacy fields that may exist from the equasis side
  managerName?: string;
};

function readOwnersCache(): Record<string, OwnerCacheEntry> {
  try {
    if (!fs.existsSync(OWNERS_CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(OWNERS_CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeOwnersCache(cache: Record<string, OwnerCacheEntry>) {
  try {
    fs.mkdirSync(path.dirname(OWNERS_CACHE_FILE), { recursive: true });
    fs.writeFileSync(OWNERS_CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // non-fatal — on Vercel /var/task is read-only; we still have in-memory cache
  }
}

// ─── In-memory cache (per server instance) ────────────────────────────────────

const memCache = new Map<string, { result: ContactResult; expiresAt: number }>();
const MEM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function memGet(key: string): ContactResult | null {
  const hit = memCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) { memCache.delete(key); return null; }
  return hit.result;
}

function memSet(key: string, result: ContactResult) {
  memCache.set(key, { result, expiresAt: Date.now() + MEM_TTL_MS });
}

// ─── Route ────────────────────────────────────────────────────────────────────

// GET /api/vessels/:mmsi/contact
// Pipeline: manager_name (from DB, written by Equasis scraper) → cache → contactEnricher
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ mmsi: string }> },
) {
  const { mmsi } = await params;

  if (!/^\d{7,9}$/.test(mmsi)) {
    return NextResponse.json({ error: "invalid mmsi" }, { status: 400 });
  }

  // 1. Read imo + manager_name from DB (manager_name populated by Equasis scraper)
  let imo:         string | null = null;
  let managerName: string | null = null;

  try {
    const { rows } = await pool.query(
      "SELECT imo::text, manager_name FROM vessels WHERE mmsi = $1::bigint",
      [mmsi],
    );
    imo         = rows[0]?.imo          ?? null;
    managerName = rows[0]?.manager_name ?? null;
  } catch {
    return NextResponse.json({ error: "db error" }, { status: 503 });
  }

  if (!imo) {
    return NextResponse.json({ error: "vessel not found" }, { status: 404 });
  }

  if (!managerName) {
    return NextResponse.json(
      { error: "manager_name not yet available — run Equasis scraper first", imo },
      { status: 404 },
    );
  }

  const cacheKey = managerName.toLowerCase().trim();

  // 2a. Memory cache (instant)
  const memHit = memGet(cacheKey);
  if (memHit) {
    return NextResponse.json(
      { imo, ownerName: managerName, contact: memHit, cached: "mem" },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
    );
  }

  // 2b. File cache (cross-process, populated by enrichWithCache & this route)
  const fileCache = readOwnersCache();
  if (fileCache[cacheKey]) {
    const { cachedAt, ...rest } = fileCache[cacheKey];
    void cachedAt;
    memSet(cacheKey, rest as ContactResult);
    return NextResponse.json(
      { imo, ownerName: managerName, contact: rest, cached: "file" },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
    );
  }

  // 3. Live enrichment
  const contact = await enrichCompanyContact(managerName);
  memSet(cacheKey, contact);

  // Persist back to file cache for next process
  fileCache[cacheKey] = { ...contact, cachedAt: new Date().toISOString() };
  writeOwnersCache(fileCache);

  return NextResponse.json(
    { imo, ownerName: managerName, contact, cached: "miss" },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600" } },
  );
}
