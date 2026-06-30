"use strict";

/**
 * vesselPhotoFinder.js
 *
 * Wikimedia Commons'tan gemi başına en fazla 3 lisanslı fotoğraf bulur.
 * vessel_photos tablosuna yazar (is_primary = ilk/en güvenilir foto).
 * vessels.photo_* sütunları geriye dönük uyumluluk için güncellenir.
 *
 * Lisans filtresi: CC0, CC-BY*, CC-BY-SA*, Public Domain — NC/ND reddedilir.
 * Güven filtresi : high (IMO dosyada) | medium (tam isim word-boundary + bağlam)
 *
 * Usage:
 *   node scraper/vesselPhotoFinder.js --test           # 8 gemide test (DB'ye yazmaz)
 *   node scraper/vesselPhotoFinder.js --imo 9811000    # tek gemi
 *   node scraper/vesselPhotoFinder.js                  # batch 50 (top scrap_score)
 */

const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

// ─── Env ──────────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?([^"'\r\n]*?)["']?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE  = "https://commons.wikimedia.org/w/api.php";
const UA        = "ShipScout/1.0 (https://shipscout.io contact@shipscout.io)";
const TIMEOUT   = 12_000;
const MAX_PHOTOS = 3;     // gemi başına max fotoğraf
const RESULTS_PER_QUERY = 10; // her Wikimedia sorgusunda kaç sonuç

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function apiFetch(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA }, signal: ctrl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── License filter ───────────────────────────────────────────────────────────

const FORBIDDEN_RE = /\b(nc|nd|non.?commercial|no.?deriv|all.?rights.?reserved)\b/i;
const ALLOWED_RE   = /^(cc[ -]?0|cc[ -]?by(?![ -]?(nc|nd))|public[ -]?domain|pd\b|government[ -]?work|no[ -]?known[ -]?copyright|unrestricted)/i;

function isCommercialOk(license) {
  if (!license) return false;
  const l = license.trim();
  if (FORBIDDEN_RE.test(l)) return false;
  return ALLOWED_RE.test(l);
}

// ─── HTML strip ───────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

// ─── Match confidence ─────────────────────────────────────────────────────────

// Kısa/yaygın isimler — sadece IMO doğrulamasıyla kabul edilir.
const AMBIGUOUS_NAMES = new Set([
  "star","ocean","sea","sun","moon","wind","storm","wave","bay","cape",
  "atlas","titan","corona","solana","sitka","oster","hermes","columbia",
  "apollo","diana","venus","mars","saturn","neptune","mercury","jupiter",
  "phoenix","eagle","hawk","falcon","condor","pelican","delaware","holland",
  "natoma","hector","elbe","expedition","koral",
]);

/**
 * "high"   → IMO numarası dosya adı/açıklamasında bulundu
 * "medium" → Tam gemi adı (≥5 karakter) word-boundary ile eşleşti,
 *            ambiguous listede değil, gemi bağlamı var
 * "none"   → kabul edilmez
 */
function matchConfidence(vesselName, imo, fileTitle, imageDescription) {
  const imoStr = String(imo);
  const title  = (fileTitle        || "").toLowerCase();
  const desc   = (imageDescription || "").toLowerCase();

  // IMO doğrulama → high
  if (
    title.includes(`imo ${imoStr}`) || desc.includes(`imo ${imoStr}`) ||
    title.includes(`imo_${imoStr}`) || desc.includes(`imo_${imoStr}`) ||
    new RegExp(`\\b${imoStr}\\b`).test(title) ||
    new RegExp(`\\b${imoStr}\\b`).test(desc)
  ) return "high";

  const normName = vesselName.toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  if (normName.length < 5) return "none";
  if (!normName.includes(" ") && AMBIGUOUS_NAMES.has(normName)) return "none";

  const normTitle = title.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
  const wbRe = new RegExp(
    `(?<![a-z0-9])${normName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`
  );
  if (!wbRe.test(normTitle)) return "none";

  // Kısa tek kelime + gemi bağlamı yok → şüpheli
  const hasCtx = /\b(ship|vessel|tanker|bulk|container|cargo|ferry|tug|dredger|freighter|mv |ms )\b/.test(
    title + " " + desc
  );
  if (normName.length <= 7 && !normName.includes(" ") && !hasCtx) return "none";

  return "medium";
}

// ─── Wikimedia Commons — up to MAX_PHOTOS per vessel ─────────────────────────

/**
 * Gemi başına en fazla MAX_PHOTOS fotoğraf döndürür.
 * Tüm fotoğraflar aynı doğrulama filtresinden geçer.
 * high confidence fotoğraflar önce sıralanır.
 *
 * @returns {Array} photos — boş olabilir
 */
async function findWikimediaPhotos(vesselName, imo) {
  const imoStr = String(imo);
  const queries = [
    `"IMO ${imoStr}"`,
    `"IMO_${imoStr}"`,
    `${vesselName} ship`,
  ];

  const collected = [];
  const seenUrls  = new Set();

  for (const q of queries) {
    if (collected.length >= MAX_PHOTOS) break;

    const url =
      `${API_BASE}?action=query` +
      `&generator=search` +
      `&gsrsearch=${encodeURIComponent(q)}` +
      `&gsrnamespace=6` +
      `&gsrlimit=${RESULTS_PER_QUERY}` +
      `&prop=imageinfo` +
      `&iiprop=url%7Cextmetadata%7Csize` +
      `&iiurlwidth=800` +
      `&format=json&origin=*`;

    const data = await apiFetch(url);
    await sleep(700);

    const pages = data?.query?.pages;
    if (!pages) continue;

    for (const page of Object.values(pages)) {
      if (collected.length >= MAX_PHOTOS) break;

      const fileTitle = (page.title || "").replace(/^File:/, "");
      const ii        = page.imageinfo?.[0];
      if (!ii) continue;

      const imgUrl   = ii.url      || "";
      const thumbUrl = ii.thumburl || imgUrl;
      if (!/\.(jpe?g|png|webp)$/i.test(imgUrl)) continue;
      if (seenUrls.has(imgUrl)) continue;

      const meta       = ii.extmetadata || {};
      const license    = meta.LicenseShortName?.value || meta.License?.value || "";
      const licenseUrl = meta.LicenseUrl?.value || "";
      const artistRaw  = meta.Artist?.value || meta.Credit?.value || "Unknown";
      const artist     = stripHtml(artistRaw);
      const desc       = stripHtml(meta.ImageDescription?.value || "");

      if (!isCommercialOk(license)) continue;

      const conf = matchConfidence(vesselName, imo, page.title + " " + fileTitle, desc);
      if (conf === "none") continue;

      seenUrls.add(imgUrl);
      collected.push({
        url:         imgUrl,
        thumb:       thumbUrl,
        artist,
        license,
        licenseUrl:  licenseUrl || "https://creativecommons.org/licenses/",
        source:      "wikimedia",
        pageUrl:     `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || "")}`,
        attribution: `© ${artist} / ${license}`,
        confidence:  conf,
      });
    }
  }

  // high confidence önce
  collected.sort((a, b) =>
    (a.confidence === "high" ? 0 : 1) - (b.confidence === "high" ? 0 : 1)
  );

  return collected;
}

// ─── DB migration ─────────────────────────────────────────────────────────────

async function runMigration() {
  // vessel_photos tablosu zaten migrate_vessel_photos.sql ile kuruldu.
  // Burada sadece vessels'daki eski kolonların varlığını garantile.
  await pool.query(`
    ALTER TABLE vessels
      ADD COLUMN IF NOT EXISTS photo_checked_at  timestamptz,
      ADD COLUMN IF NOT EXISTS photo_thumb        text,
      ADD COLUMN IF NOT EXISTS photo_artist       text,
      ADD COLUMN IF NOT EXISTS photo_license      text,
      ADD COLUMN IF NOT EXISTS photo_license_url  text,
      ADD COLUMN IF NOT EXISTS photo_source       text,
      ADD COLUMN IF NOT EXISTS photo_match_confidence text,
      ADD COLUMN IF NOT EXISTS photo_fetched_at   timestamptz;
  `);
}

// ─── DB writes ────────────────────────────────────────────────────────────────

/**
 * Fotoğrafları vessel_photos tablosuna yazar.
 * İlk foto = is_primary (en yüksek confidence).
 * vessels.photo_* backward-compat için güncellenir.
 */
async function savePhotos(imo, photos) {
  // vessels → taranan olarak işaretle
  await pool.query(
    "UPDATE vessels SET photo_checked_at = NOW() WHERE imo = $1::bigint",
    [imo]
  );

  if (!photos.length) return;

  // Önce bu gemi için eski primary işaretini kaldır
  await pool.query(
    "UPDATE vessel_photos SET is_primary = false WHERE imo = $1",
    [String(imo)]
  );

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const isPrimary = i === 0;

    await pool.query(
      `INSERT INTO vessel_photos
         (imo, photo_url, photo_thumb, artist, license, license_url,
          match_confidence, source, page_url, attribution, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (imo, photo_url) DO UPDATE SET
         is_primary       = EXCLUDED.is_primary,
         artist           = EXCLUDED.artist,
         license          = EXCLUDED.license,
         match_confidence = EXCLUDED.match_confidence`,
      [
        String(imo), p.url, p.thumb, p.artist, p.license,
        p.licenseUrl, p.confidence, p.source, p.pageUrl, p.attribution, isPrimary,
      ]
    );
  }

  // Primary fotoyu vessels'a da yaz (backward compat — API/VesselPanel okur)
  const primary = photos[0];
  await pool.query(
    `UPDATE vessels SET
       photo_url              = $2,
       photo_thumb            = $3,
       photo_artist           = $4,
       photo_license          = $5,
       photo_license_url      = $6,
       photo_source           = $7,
       photo_match_confidence = $8,
       photo_fetched_at       = NOW(),
       licensed_photo         = $9::jsonb
     WHERE imo = $1::bigint`,
    [
      imo,
      primary.url,
      primary.thumb,
      primary.artist,
      primary.license,
      primary.licenseUrl,
      primary.source,
      primary.confidence,
      JSON.stringify({
        url:         primary.url,
        thumb:       primary.thumb,
        license:     primary.license,
        licenseUrl:  primary.licenseUrl,
        author:      primary.artist,
        source:      primary.source,
        pageUrl:     primary.pageUrl,
        attribution: primary.attribution,
        cachedAt:    new Date().toISOString(),
      }),
    ]
  );
}

// ─── Single vessel enrichment ─────────────────────────────────────────────────

async function enrichVessel(vesselName, imo, { verbose = true, save = true } = {}) {
  if (verbose) process.stdout.write(`  "${vesselName}" (IMO ${imo}) … `);

  const photos = await findWikimediaPhotos(vesselName, String(imo));

  if (!photos.length) {
    if (verbose) console.log("foto bulunamadı");
    if (save) await pool.query(
      "UPDATE vessels SET photo_checked_at = NOW() WHERE imo = $1::bigint", [imo]
    );
    return [];
  }

  if (verbose) {
    console.log(`✓ ${photos.length} foto`);
    photos.forEach((p, i) => {
      const marker = i === 0 ? "★ " : "  ";
      console.log(`    ${marker}[${p.confidence}] ${p.license} — ${p.artist.slice(0, 40)}`);
      console.log(`       ${p.thumb.slice(0, 80)}`);
    });
  }

  if (save) await savePhotos(imo, photos);

  return photos;
}

// ─── Test mode ────────────────────────────────────────────────────────────────

async function runTests() {
  const TEST_VESSELS = [
    { name: "MSC OSCAR",   imo: "9703291" },
    { name: "EVER GIVEN",  imo: "9811000" },
    { name: "EMMA MAERSK", imo: "9321483" },
    { name: "TARMO",       imo: "5352886" },
    { name: "CARNIVAL SPLENDOR", imo: "9333163" },
  ];

  console.log("\n=== vesselPhotoFinder — Test (DB'ye yazmaz) ===\n");

  let totalFound = 0;
  for (const v of TEST_VESSELS) {
    const photos = await enrichVessel(v.name, v.imo, { verbose: true, save: false });
    totalFound += photos.length;
    console.log();
    await sleep(500);
  }

  console.log(`Toplam: ${totalFound} foto, ${TEST_VESSELS.length} gemide`);
}

// ─── Batch mode ───────────────────────────────────────────────────────────────

async function batchEnrich({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT v.imo, v.name FROM vessels v
     WHERE v.name IS NOT NULL
       AND v.photo_checked_at IS NULL
     ORDER BY v.scrap_score DESC NULLS LAST
     LIMIT $1`,
    [limit]
  );

  console.log(`\n${rows.length} gemi taranacak…\n`);
  let found = 0, notFound = 0;

  for (const { imo, name } of rows) {
    const photos = await enrichVessel(name, imo);
    if (photos.length) found += photos.length;
    else notFound++;
    await sleep(800);
  }

  console.log(`\nTamamlandı: ${found} foto kaydedildi, ${notFound} gemide bulunamadı`);
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);

  if (args.includes("--test")) {
    await runTests();
    await pool.end();
    return;
  }

  await runMigration();
  console.log("Migration OK");

  const imoIdx = args.indexOf("--imo");
  if (imoIdx !== -1) {
    const imo = args[imoIdx + 1];
    if (!imo) { console.error("--imo değeri eksik"); process.exit(1); }

    const { rows } = await pool.query(
      "SELECT name FROM vessels WHERE imo = $1::bigint LIMIT 1", [imo]
    );
    const name = rows[0]?.name;
    if (!name) { console.error(`IMO ${imo} DB'de bulunamadı`); process.exit(1); }

    const photos = await enrichVessel(name, imo);
    console.log(`\n${photos.length} foto kaydedildi.`);
    await pool.end();
    return;
  }

  await batchEnrich({ limit: 50 });
  await pool.end();
})().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
