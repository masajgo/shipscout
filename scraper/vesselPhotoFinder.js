"use strict";

/**
 * vesselPhotoFinder.js
 *
 * Wikimedia Commons'tan lisanslı gemi fotoğrafı bulur, vessels tablosuna yazar.
 * Sadece ticari kullanıma uygun CC lisansları (CC0, CC-BY*, CC-BY-SA*, PD) kabul edilir.
 * Flickr desteği ileride photo_source='flickr' ile eklenecek.
 *
 * Usage:
 *   node vesselPhotoFinder.js --test          # 8 karışık gemide test
 *   node vesselPhotoFinder.js --imo 9811000   # tek gemi (DB'den adı çeker)
 *   node vesselPhotoFinder.js                 # DB'deki foto eksik gemileri tara
 */

const fs   = require("fs");
const path = require("path");
const { Pool } = require("pg");

// ─── Env ───────────────────────────────────────────────────────────────────────

const ENV_PATH = path.join(__dirname, "../.env.local");
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, "utf8").split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=["']?([^"'\r\n]*?)["']?\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

// ─── DB ────────────────────────────────────────────────────────────────────────

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// ─── Config ────────────────────────────────────────────────────────────────────

const API_BASE = "https://commons.wikimedia.org/w/api.php";
const UA       = "ShipScout/1.0 (https://shipscout.io contact@shipscout.io)";
const TIMEOUT  = 10_000;

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── HTTP ──────────────────────────────────────────────────────────────────────

async function apiFetch(url) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": UA },
      signal:  ctrl.signal,
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── License filter ────────────────────────────────────────────────────────────

// NC veya ND içeren her şeyi reddet (ticari kullanım yasak)
const FORBIDDEN_RE = /\b(nc|nd|non.?commercial|no.?deriv|all.?rights.?reserved)\b/i;

// Kabul edilen lisans desenleri
const ALLOWED_RE = /^(cc[ -]?0|cc[ -]?by(?![ -]?(nc|nd))|public[ -]?domain|pd\b|government[ -]?work|no[ -]?known[ -]?copyright|unrestricted)/i;

function isCommercialOk(license) {
  if (!license || typeof license !== "string") return false;
  const l = license.trim();
  if (FORBIDDEN_RE.test(l)) return false;
  return ALLOWED_RE.test(l);
}

// ─── HTML strip ────────────────────────────────────────────────────────────────

function stripHtml(html) {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#\d+;/g, "").replace(/&[a-z]+;/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

// ─── Match confidence ──────────────────────────────────────────────────────────

/**
 * Dosya başlığı/açıklaması ile gemi adı+IMO eşleşmesini değerlendirir.
 *
 * "high"   → IMO numarası dosya adında veya açıklamada geçiyor
 * "medium" → Tam gemi adı (≥5 karakter) dosya adında net eşleşiyor
 * "none"   → Eşleşme yok → FOTO EKLENMEZ
 */
function matchConfidence(vesselName, imo, fileTitle, imageDescription) {
  const imoStr   = String(imo);
  const title    = (fileTitle        || "").toLowerCase();
  const desc     = (imageDescription || "").toLowerCase();

  // IMO doğrulaması → high confidence
  if (
    title.includes(`imo ${imoStr}`) || desc.includes(`imo ${imoStr}`) ||
    title.includes(`imo_${imoStr}`) || desc.includes(`imo_${imoStr}`) ||
    // bazı Commons dosyalarında sadece IMO numarası geçer
    new RegExp(`\\b${imoStr}\\b`).test(title) ||
    new RegExp(`\\b${imoStr}\\b`).test(desc)
  ) {
    return "high";
  }

  // Gemi adı eşleşmesi — kısa/generic adlarda (≤4 karakter) only-IMO kuralı
  const normName = vesselName
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normName.length < 5) return "none"; // çok kısa isim, IMO olmadan kabul etme

  const normTitle = title.replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ");

  if (normTitle.includes(normName)) return "medium";

  return "none";
}

// ─── Wikimedia Commons search ──────────────────────────────────────────────────

/**
 * Birden fazla arama stratejisi dener.
 * İlk geçerli, lisanslı, eşleşen fotoğrafı döndürür.
 * Hiçbiri bulunamazsa null döner.
 */
async function findWikimediaPhoto(vesselName, imo) {
  const imoStr = String(imo);

  // Sıralı sorgular: IMO önce (unique), sonra isimli
  const queries = [
    `"IMO ${imoStr}"`,
    `"IMO_${imoStr}"`,
    `${vesselName} ship`,
  ];

  for (const q of queries) {
    const url =
      `${API_BASE}?action=query` +
      `&generator=search` +
      `&gsrsearch=${encodeURIComponent(q)}` +
      `&gsrnamespace=6` +   // sadece File: sayfaları
      `&gsrlimit=5` +
      `&prop=imageinfo` +
      `&iiprop=url%7Cextmetadata%7Csize` +
      `&iiurlwidth=800` +
      `&format=json&origin=*`;

    const data = await apiFetch(url);
    await sleep(600); // ~1-2 req/sn

    const pages = data?.query?.pages;
    if (!pages) continue;

    for (const page of Object.values(pages)) {
      const fileTitle = (page.title || "").replace(/^File:/, "");
      const ii        = page.imageinfo?.[0];
      if (!ii) continue;

      const url      = ii.url      || "";
      const thumbUrl = ii.thumburl || url;

      // Sadece görüntü dosyaları (SVG/PDF/OGG reddedilir)
      if (!/\.(jpe?g|png|webp)$/i.test(url)) continue;

      const meta       = ii.extmetadata || {};
      const license    = meta.LicenseShortName?.value || meta.License?.value || "";
      const licenseUrl = meta.LicenseUrl?.value || "";
      const artistRaw  = meta.Artist?.value || meta.Credit?.value || "Unknown";
      const artist     = stripHtml(artistRaw);
      const desc       = stripHtml(meta.ImageDescription?.value || "");
      const copyrighted = (meta.Copyrighted?.value || "").toLowerCase();

      // Açıkça telif hakkı var + ticari lisans da yoksa reddet
      if (copyrighted === "true" && !isCommercialOk(license)) continue;
      if (!isCommercialOk(license)) continue;

      // Gemi eşleşme kontrolü — yanlış gemi fotosunu engelle
      const conf = matchConfidence(vesselName, imo, page.title + " " + fileTitle, desc);
      if (conf === "none") continue;

      return {
        url,
        thumb:       thumbUrl,
        artist,
        license,
        licenseUrl:  licenseUrl || "https://creativecommons.org/licenses/",
        source:      "wikimedia",
        pageUrl:     `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title || "")}`,
        attribution: `© ${artist} / ${license}`,
        confidence:  conf,
      };
    }
  }

  return null;
}

// ─── DB migration ──────────────────────────────────────────────────────────────

async function runMigration() {
  // Eski kolonları koru, yenileri ekle, Flickr için şema hazır
  await pool.query(`
    ALTER TABLE vessels
      ADD COLUMN IF NOT EXISTS photo_thumb           text,
      ADD COLUMN IF NOT EXISTS photo_artist          text,
      ADD COLUMN IF NOT EXISTS photo_license         text,
      ADD COLUMN IF NOT EXISTS photo_license_url     text,
      ADD COLUMN IF NOT EXISTS photo_source          text,
      ADD COLUMN IF NOT EXISTS photo_match_confidence text,
      ADD COLUMN IF NOT EXISTS photo_fetched_at      timestamptz;
  `);
  // Eski kolon adlarını migrate et (varsa)
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='vessels' AND column_name='photo_confidence')
         AND NOT EXISTS (SELECT 1 FROM information_schema.columns
                         WHERE table_name='vessels' AND column_name='photo_match_confidence')
      THEN
        ALTER TABLE vessels RENAME COLUMN photo_confidence TO photo_match_confidence;
      END IF;
    END $$;
  `);
}

// ─── DB write ──────────────────────────────────────────────────────────────────

async function savePhoto(imo, photo) {
  await pool.query(
    `UPDATE vessels SET
       photo_url             = $2,
       photo_thumb           = $3,
       photo_artist          = $4,
       photo_license         = $5,
       photo_license_url     = $6,
       photo_source          = $7,
       photo_match_confidence= $8,
       photo_fetched_at      = NOW(),
       licensed_photo        = $9::jsonb
     WHERE imo = $1::bigint`,
    [
      imo,
      photo.url,
      photo.thumb,
      photo.artist,
      photo.license,
      photo.licenseUrl,
      photo.source,
      photo.confidence,
      JSON.stringify({
        url:         photo.url,
        thumb:       photo.thumb,
        license:     photo.license,
        licenseUrl:  photo.licenseUrl,
        author:      photo.artist,
        source:      photo.source,
        pageUrl:     photo.pageUrl,
        attribution: photo.attribution,
        cachedAt:    new Date().toISOString(),
      }),
    ],
  );
}

// ─── Single vessel enrichment ──────────────────────────────────────────────────

async function enrichVessel(vesselName, imo, { verbose = true } = {}) {
  if (verbose) process.stdout.write(`  "${vesselName}" (IMO ${imo}) … `);

  const photo = await findWikimediaPhoto(vesselName, String(imo));

  if (!photo) {
    if (verbose) console.log("foto bulunamadı");
    return null;
  }

  if (verbose) {
    console.log(`✓ ${photo.confidence}`);
    console.log(`    Lisans:  ${photo.license}`);
    console.log(`    Atıf:    ${photo.attribution}`);
    console.log(`    Thumb:   ${photo.thumb}`);
    console.log(`    Sayfa:   ${photo.pageUrl}`);
  }

  return photo;
}

// ─── Test mode ─────────────────────────────────────────────────────────────────

async function runTests() {
  // 3 büyük konteyner, 2 tanker, 3 küçük/eski
  const TEST_VESSELS = [
    // Büyük konteynerler
    { name: "MSC OSCAR",             imo: "9703291", cat: "container" },
    { name: "EVER GIVEN",            imo: "9811000", cat: "container" },
    { name: "EMMA MAERSK",           imo: "9321483", cat: "container" },
    // Tankerler
    { name: "FRONT ALTAIR",          imo: "9390175", cat: "tanker"    },
    { name: "Jahre VIKING",          imo: "7381154", cat: "tanker"    },
    // Küçük/eski
    { name: "MV DOULOS",             imo: "5097844", cat: "old"       },
    { name: "PACIFIC STAR",          imo: "9108930", cat: "generic"   },
    { name: "SEAWISE GIANT",         imo: "7381154", cat: "old"       },
  ];

  console.log("\n=== Wikimedia Commons Photo Finder — Test (8 gemi) ===\n");

  let found = 0, notFound = 0;
  const results = [];

  for (const v of TEST_VESSELS) {
    console.log(`[${v.cat.toUpperCase()}] ${v.name}`);
    const photo = await enrichVessel(v.name, v.imo);
    if (photo) { found++; results.push({ ...v, photo }); }
    else        { notFound++; results.push({ ...v, photo: null }); }
    console.log();
    await sleep(800);
  }

  console.log("─".repeat(55));
  console.log(`Toplam: ${found}/${TEST_VESSELS.length} gemide foto bulundu\n`);

  console.log("Özet:");
  for (const r of results) {
    const status = r.photo
      ? `✓ ${r.photo.confidence.padEnd(6)} | ${r.photo.license}`
      : "✗ bulunamadı";
    console.log(`  ${r.name.padEnd(30)} ${status}`);
  }
  console.log();
}

// ─── Batch mode ────────────────────────────────────────────────────────────────

async function batchEnrich({ limit = 50 } = {}) {
  const { rows } = await pool.query(
    `SELECT imo, name FROM vessels
     WHERE name IS NOT NULL
       AND (photo_url IS NULL
            OR photo_fetched_at IS NULL
            OR photo_fetched_at < NOW() - INTERVAL '30 days')
     ORDER BY scrap_score DESC NULLS LAST
     LIMIT $1`,
    [limit],
  );

  console.log(`\n${rows.length} gemi taranacak…\n`);
  let found = 0, notFound = 0;

  for (const { imo, name } of rows) {
    const photo = await enrichVessel(name, imo);
    if (photo) { await savePhoto(imo, photo); found++; }
    else        { notFound++; }
    await sleep(700);
  }

  console.log(`\nTamamlandı: ${found} foto kaydedildi, ${notFound} bulunamadı`);
}

// ─── CLI ───────────────────────────────────────────────────────────────────────

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
      "SELECT name FROM vessels WHERE imo = $1::bigint LIMIT 1",
      [imo],
    );
    const name = rows[0]?.name;
    if (!name) { console.error(`IMO ${imo} DB'de bulunamadı`); process.exit(1); }

    const photo = await enrichVessel(name, imo);
    if (photo) { await savePhoto(imo, photo); console.log("DB'ye kaydedildi."); }
    await pool.end();
    return;
  }

  // Varsayılan: batch
  await batchEnrich({ limit: 50 });
  await pool.end();
})().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
