"use strict";

/**
 * photoScanAll.js
 *
 * Tüm filoda Wikimedia Commons fotoğraf taraması — resume destekli.
 * ~53K gemi, batch=50, ~700ms/gemi → ~15-20 saat.
 *
 * Kullanım:
 *   node scripts/photoScanAll.js                                         # normal
 *   nohup caffeinate -i node scripts/photoScanAll.js > logs/photoscan.log 2>&1 &
 *
 * Resume:
 *   Yarıda kalırsa tekrar çalıştır — photo_checked_at işaretli gemileri atlar.
 *   İlerleme: logs/photo_scan_progress.json
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

// ─── Config ───────────────────────────────────────────────────────────────────

const BATCH_SIZE       = 50;
const DELAY_VESSEL_MS  = 750;   // Wikimedia ~1req/sn (3 sorgu/gemi = ~2.5 sn/gemi)
const DELAY_BATCH_MS   = 2_000; // Batch'ler arası ek bekleme
const LOG_FILE         = path.join(__dirname, "../logs/photoscan.log");
const CHECKPOINT_FILE  = path.join(__dirname, "../logs/photo_scan_progress.json");
const API_BASE         = "https://commons.wikimedia.org/w/api.php";
const UA               = "ShipScout/1.0 (https://shipscout.io contact@shipscout.io)";
const TIMEOUT_MS       = 12_000;

// ─── DB ───────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Logging ──────────────────────────────────────────────────────────────────

// stdout is redirected to LOG_FILE via nohup — no dual-write needed
function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE))
      return JSON.parse(fs.readFileSync(CHECKPOINT_FILE, "utf8"));
  } catch {}
  return { scanned: 0, found: 0, skipped: 0, startedAt: new Date().toISOString() };
}

function saveCheckpoint(cp) {
  try {
    fs.mkdirSync(path.dirname(CHECKPOINT_FILE), { recursive: true });
    fs.writeFileSync(CHECKPOINT_FILE, JSON.stringify({ ...cp, updatedAt: new Date().toISOString() }, null, 2));
  } catch (e) {
    log(`Checkpoint yazılamadı: ${e.message}`);
  }
}

// ─── Migration ────────────────────────────────────────────────────────────────

async function runMigration() {
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

// ─── Priority batch query ─────────────────────────────────────────────────────

async function getNextBatch() {
  const { rows } = await pool.query(`
    SELECT v.imo, v.name, v.scrap_score,
           (o.email IS NOT NULL OR o.best_email IS NOT NULL) AS has_contact
    FROM   vessels v
    LEFT JOIN owners o ON v.imo = o.imo
    WHERE  v.name IS NOT NULL
      AND  v.imo IS NOT NULL
      AND  v.photo_checked_at IS NULL
    ORDER BY
      CASE
        WHEN v.scrap_score >= 25                                  THEN 0
        WHEN o.email IS NOT NULL OR o.best_email IS NOT NULL      THEN 1
        ELSE 2
      END,
      v.scrap_score DESC NULLS LAST
    LIMIT $1
  `, [BATCH_SIZE]);
  return rows;
}

async function getTotalRemaining() {
  const { rows } = await pool.query(`
    SELECT COUNT(*) AS n FROM vessels
    WHERE name IS NOT NULL AND imo IS NOT NULL AND photo_checked_at IS NULL
  `);
  return parseInt(rows[0].n);
}

// ─── DB writes ────────────────────────────────────────────────────────────────

async function markChecked(imo) {
  await pool.query(
    "UPDATE vessels SET photo_checked_at = NOW() WHERE imo = $1::bigint",
    [imo]
  );
}

/**
 * Fotoğrafları vessel_photos tablosuna yazar.
 * İlk foto = is_primary. vessels.photo_* backward-compat için güncellenir.
 */
async function savePhotos(imo, photos) {
  await pool.query(
    "UPDATE vessels SET photo_checked_at = NOW() WHERE imo = $1::bigint",
    [imo]
  );

  if (!photos.length) return;

  await pool.query(
    "UPDATE vessel_photos SET is_primary = false WHERE imo = $1",
    [String(imo)]
  );

  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
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
        p.licenseUrl, p.confidence, p.source, p.pageUrl, p.attribution, i === 0,
      ]
    );
  }

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
      imo, primary.url, primary.thumb, primary.artist, primary.license,
      primary.licenseUrl, primary.source, primary.confidence,
      JSON.stringify({
        url: primary.url, thumb: primary.thumb, license: primary.license,
        licenseUrl: primary.licenseUrl, author: primary.artist,
        source: primary.source, pageUrl: primary.pageUrl,
        attribution: primary.attribution, cachedAt: new Date().toISOString(),
      }),
    ]
  );
}

// ─── Wikimedia Commons ────────────────────────────────────────────────────────

async function apiFetch(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
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

const FORBIDDEN_RE = /\b(nc|nd|non.?commercial|no.?deriv|all.?rights.?reserved)\b/i;
const ALLOWED_RE   = /^(cc[ -]?0|cc[ -]?by(?![ -]?(nc|nd))|public[ -]?domain|pd\b|government[ -]?work|no[ -]?known[ -]?copyright|unrestricted)/i;

function isCommercialOk(license) {
  if (!license) return false;
  const l = license.trim();
  if (FORBIDDEN_RE.test(l)) return false;
  return ALLOWED_RE.test(l);
}

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ").trim().slice(0, 200);
}

// Ambiguous single-word names that often false-positive on Wikimedia
// (people, places, generic terms that appear in unrelated file titles)
const AMBIGUOUS_NAMES = new Set([
  "star","ocean","sea","sun","moon","wind","storm","wave","bay","cape",
  "atlas","titan","atlas","corona","solana","sitka","oster","hermes",
  "apollo","diana","venus","mars","saturn","neptune","mercury","jupiter",
  "phoenix","eagle","hawk","falcon","condor","albatros","pelican",
]);

/**
 * "high"   → IMO numarası dosya adında/açıklamada geçiyor
 * "medium" → Tam gemi adı (≥5 karakter) word-boundary ile dosya adında eşleşiyor,
 *            ambiguous listede değil, şüpheli bağlam yok
 * "none"   → Kabul edilmiyor
 */
function matchConfidence(vesselName, imo, fileTitle, imageDescription) {
  const imoStr = String(imo);
  const title  = (fileTitle        || "").toLowerCase();
  const desc   = (imageDescription || "").toLowerCase();

  // IMO doğrulama → high (en güvenilir)
  if (
    title.includes(`imo ${imoStr}`) || desc.includes(`imo ${imoStr}`) ||
    title.includes(`imo_${imoStr}`) || desc.includes(`imo_${imoStr}`) ||
    new RegExp(`\\b${imoStr}\\b`).test(title) ||
    new RegExp(`\\b${imoStr}\\b`).test(desc)
  ) return "high";

  const normName = vesselName.toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  // Çok kısa isimler → sadece IMO ile kabul
  if (normName.length < 5) return "none";

  // Ambiguous tek kelime isimleri → atla
  if (!normName.includes(" ") && AMBIGUOUS_NAMES.has(normName)) return "none";

  // Word-boundary eşleşmesi (includes() yerine regex — SOLANA/Javier Solana gibi yanlışları önler)
  const normTitle = title.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");
  const wordBoundaryRe = new RegExp(`(?<![a-z0-9])${normName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`);

  if (!wordBoundaryRe.test(normTitle)) return "none";

  // "ship" bağlamı yoksa ve kısa isimse (5-7 karakter) şüpheli → red
  const hasShipContext = /\b(ship|vessel|tanker|bulk|container|cargo|ferry|tug|dredger|freighter)\b/.test(title + " " + desc);
  if (normName.length <= 7 && !normName.includes(" ") && !hasShipContext) return "none";

  return "medium";
}

const MAX_PHOTOS        = 3;
const RESULTS_PER_QUERY = 10;

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

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("════════════════════════════════════════════════════════");
  log("=== photoScanAll.js başlıyor ===");

  await runMigration();
  log("Migration OK — photo_checked_at kolonu hazır");

  const cp = loadCheckpoint();
  log(`Önceki ilerleme: ${cp.scanned} tarandı, ${cp.found} foto bulundu`);

  const totalAtStart = await getTotalRemaining();
  log(`Kalan taranacak gemi: ${totalAtStart}`);
  log("────────────────────────────────────────────────────────");

  let batchNum = 0;
  const sessionScanned = { found: 0, notFound: 0, errors: 0 };

  while (true) {
    const batch = await getNextBatch();
    if (batch.length === 0) {
      log("✓ Tüm gemiler tarandı — tamamlandı!");
      break;
    }

    batchNum++;
    log(`\nBatch #${batchNum} — ${batch.length} gemi (örnek: ${batch[0].name} … ${batch[batch.length-1].name})`);

    for (const vessel of batch) {
      const { imo, name, scrap_score } = vessel;
      const label = `${name} (IMO ${imo}, score=${scrap_score ?? "—"})`;

      try {
        const photos = await findWikimediaPhotos(name, imo);

        if (photos.length) {
          await savePhotos(imo, photos);
          sessionScanned.found += photos.length;
          cp.found += photos.length;
          const summary = photos.map(p => `${p.confidence}/${p.license}`).join(", ");
          log(`  ✓ ${label} → ${photos.length} foto [${summary}]`);
        } else {
          await markChecked(imo);
          sessionScanned.notFound++;
        }
      } catch (e) {
        // Tek gemi hatası tüm scan'i durdurmasın
        log(`  ✗ HATA [${label}]: ${e.message} — atlanıyor`);
        sessionScanned.errors++;
        try { await markChecked(imo); } catch {}
      }

      cp.scanned++;
      await sleep(DELAY_VESSEL_MS);
    }

    // Batch sonrası ilerleme raporu
    const remaining = await getTotalRemaining();
    const totalScanned = totalAtStart - remaining;
    const pct = totalAtStart > 0 ? ((totalScanned / totalAtStart) * 100).toFixed(1) : "0";
    const elapsed = Math.round((Date.now() - new Date(cp.startedAt).getTime()) / 60_000);
    const rate = elapsed > 0 ? (cp.scanned / elapsed).toFixed(1) : "—";
    const eta = rate > 0 ? Math.round(remaining / rate) : "?";

    log(`──── Batch #${batchNum} bitti ────`);
    log(`  Bu oturumda: ${sessionScanned.found} foto (≤3/gemi), ${sessionScanned.notFound} yok, ${sessionScanned.errors} hata`);
    log(`  Toplam: ${cp.scanned} tarandı, ${cp.found} foto | Kalan: ${remaining} | %${pct}`);
    log(`  Hız: ~${rate} gemi/dk | Tahmini kalan süre: ${eta} dk`);

    saveCheckpoint(cp);

    if (remaining > 0) await sleep(DELAY_BATCH_MS);
  }

  // Final özet
  const elapsed = Math.round((Date.now() - new Date(cp.startedAt).getTime()) / 60_000);
  log("\n════════════════════════════════════════════════════════");
  log("=== photoScanAll.js TAMAMLANDI ===");
  log(`  Toplam süre: ${elapsed} dk`);
  log(`  Bulunan: ${cp.found} foto`);
  log(`  Taranan: ${cp.scanned} gemi`);
  log(`  Başarı oranı: ${cp.scanned > 0 ? ((cp.found/cp.scanned)*100).toFixed(1) : 0}%`);
  log("════════════════════════════════════════════════════════");

  saveCheckpoint({ ...cp, completedAt: new Date().toISOString() });
  await pool.end();
}

main().catch(e => {
  log(`FATAL: ${e.message}`);
  process.exit(1);
});
