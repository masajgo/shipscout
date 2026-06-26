"use strict";
/**
 * importOwnershipCSV.js  v2
 *
 * Datalastic bulk raporlarını (ownership + inspections + dry_dock_dates +
 * sales_purchase_demolitions) Supabase'e import eder.
 *
 * 0 ek API isteği — sadece rapor listesi + CSV indirme.
 * Equasis verisi korunur: sadece NULL alanları doldurur.
 *
 * Kullanım:
 *   node scripts/importOwnershipCSV.js           # API'den en son raporları çek
 *   node scripts/importOwnershipCSV.js --local   # scraper/data/reports/ içindeki CSV
 *   node scripts/importOwnershipCSV.js --fleetstats
 *   node scripts/importOwnershipCSV.js --ownership
 *   node scripts/importOwnershipCSV.js --inspections
 *   node scripts/importOwnershipCSV.js --drydock
 *   node scripts/importOwnershipCSV.js --sales
 */

const path      = require("path");
const fs        = require("fs");
const https     = require("https");
const http      = require("http");
const { execSync } = require("child_process");
const { Pool }  = require("pg");
const csvParser = require("csv-parser");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const API_KEY = process.env.DATALASTIC_API_KEY;
const DB_URL  = process.env.DATABASE_URL;

if (!API_KEY) { console.error("DATALASTIC_API_KEY eksik"); process.exit(1); }
if (!DB_URL)  { console.error("DATABASE_URL eksik");       process.exit(1); }

const pool = new Pool({
  connectionString: DB_URL,
  max: 10,
  idleTimeoutMillis: 60_000,
  ssl: DB_URL.includes("supabase") ? { rejectUnauthorized: false } : undefined,
});

const REPORTS_DIR = path.join(__dirname, "../scraper/data/reports");
const BATCH_SIZE  = 500;

const args       = process.argv.slice(2);
const LOCAL      = args.includes("--local");
const FLEETSTATS = args.includes("--fleetstats");
const ONLY_OWN   = args.includes("--ownership");
const ONLY_INS   = args.includes("--inspections");
const ONLY_DRY   = args.includes("--drydock");
const ONLY_SAL   = args.includes("--sales");
const RUN_ALL    = !ONLY_OWN && !ONLY_INS && !ONLY_DRY && !ONLY_SAL && !FLEETSTATS;

function log(msg) { process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`); }

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

async function fetchJSON(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const j   = await res.json();
  if (!j?.meta?.success) throw new Error(j?.meta?.message || "API error");
  return j;
}

function downloadToFile(url, dest) {
  return new Promise((resolve, reject) => {
    function get(u) {
      const proto = u.startsWith("https") ? https : http;
      proto.get(u, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
          return get(res.headers.location);
        if (res.statusCode !== 200)
          return reject(new Error(`HTTP ${res.statusCode} from ${u}`));
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on("finish", resolve);
        out.on("error", reject);
      }).on("error", reject);
    }
    get(url);
  });
}

// ─── Rapor URL'si ─────────────────────────────────────────────────────────────

async function getReportUrl(type) {
  const j = await fetchJSON(`https://api.datalastic.com/api/v0/report?api-key=${API_KEY}&report_id=_all`);
  const done = (j.data || [])
    .filter(r => r.report_type === type && r.status === "_DONE_")
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  if (!done.length) throw new Error(`Hazır ${type} raporu yok`);
  return done[0].result_url;
}

// ─── CSV dosyasını bul / indir ────────────────────────────────────────────────

function findLocalCSV(prefix) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort().reverse();
  if (!files.length) throw new Error(`${REPORTS_DIR} içinde ${prefix}*.csv yok`);
  return path.join(REPORTS_DIR, files[0]);
}

async function getCSV(type, prefix) {
  if (LOCAL) return findLocalCSV(prefix);
  const url  = await getReportUrl(type);
  const zip  = path.join(REPORTS_DIR, `${prefix}_latest.zip`);
  log(`${type}: indiriliyor…`);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
  await downloadToFile(url, zip);
  execSync(`unzip -o "${zip}" -d "${REPORTS_DIR}"`, { stdio: "pipe" });
  return findLocalCSV(prefix);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function loadOurIMOs() {
  const { rows } = await pool.query("SELECT imo::text FROM vessels WHERE imo IS NOT NULL");
  return new Set(rows.map(r => r.imo));
}

/** Generic CSV streaming with per-row callback. pause/resume ile backpressure. */
function streamCSV(csvPath, onRow) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(csvPath).pipe(csvParser());
    stream
      .on("data", function(row) {
        const p = onRow(row, this);
        if (p && typeof p.then === "function") {
          this.pause();
          p.then(() => this.resume()).catch(reject);
        }
      })
      .on("end", resolve)
      .on("error", reject);
  });
}

function n(v) { const x = parseFloat(v); return isNaN(x) ? null : x; }
function i(v) { const x = parseInt(v);   return isNaN(x) ? null : x; }
function s(v) { const t = (v||"").trim(); return t || null; }
function d(v) { return s(v); }   // date string — pg casts

// Phone validation — rejects dates, IPs, version numbers, too-short strings
function phone(v) {
  const t = (v || "").trim();
  if (!t) return null;
  if (/^\+?\d{4}-\d{2}-\d{2}/.test(t))          return null; // date: +2024-01-09
  if (/^\d{2}\.\d{2}\.\d{2,4}$/.test(t))         return null; // date: 10.17.21
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t))     return null; // date: 01/09/2024
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(t))           return null; // date: 2024/01/09
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) return null; // IP
  if (/^\d+\.\d+\.\d+$/.test(t))                 return null; // version x.y.z
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15)   return null;
  return t;
}

// ─── 1. OWNERSHIP ─────────────────────────────────────────────────────────────

async function importOwnership(ourIMOs) {
  const csvPath = await getCSV("ownership", "ownership");
  log(`ownership CSV: ${csvPath}`);

  let total = 0, matched = 0, skipped = 0;
  let owBatch = [], vesBatch = [], cvBatch = [];

  async function flush(force = false) {
    if (owBatch.length  >= BATCH_SIZE || (force && owBatch.length))  { await flushOwners(owBatch.splice(0)); }
    if (vesBatch.length >= BATCH_SIZE || (force && vesBatch.length)) { await flushVessels(vesBatch.splice(0)); }
    if (cvBatch.length  >= BATCH_SIZE || (force && cvBatch.length))  { await flushCV(cvBatch.splice(0)); }
  }

  await streamCSV(csvPath, async function(row, stream) {
    total++;
    const imo = s(row.imo);
    if (!imo || !ourIMOs.has(imo)) { skipped++; return; }
    matched++;

    const owner   = s(row.beneficial_owner);
    const country = s(row.beneficial_owner_country);
    const mgr     = s(row.commercial_manager);
    const op      = s(row.operator);
    const tech    = s(row.technical_manager);
    const flag    = s(row.flag_name);
    const builtY  = i(row.built_year);
    const dwt     = i(row.dwt_design);
    const vname   = s(row.vessel_name);

    owBatch.push({ imo, vessel_name: vname, owner_name: owner, country, manager_name: mgr || op, ism_manager: tech });
    vesBatch.push({ imo, flag, manager_name: mgr || tech, built_year: builtY, dwt });

    const roles = [];
    if (owner)                              roles.push([owner, "owner"]);
    if (mgr  && mgr  !== owner)             roles.push([mgr,   "manager"]);
    if (op   && !roles.find(([n])=>n===op)) roles.push([op,    "operator"]);
    if (tech && !roles.find(([n])=>n===tech)) roles.push([tech, "technical_manager"]);
    for (const [cn, role] of roles)
      cvBatch.push({ company_name: cn, imo, vessel_name: vname, year_built: builtY, flag, dwt, role });

    if (owBatch.length >= BATCH_SIZE || cvBatch.length >= BATCH_SIZE)
      return flush();

    if (total % 1000 === 0)
      log(`  ownership: ${total.toLocaleString()} satır | eşleşen: ${matched.toLocaleString()} | atlanan: ${skipped.toLocaleString()}`);
  });

  await flush(true);
  log(`ownership TAMAM: ${total.toLocaleString()} satır | eşleşen: ${matched.toLocaleString()} | atlanan: ${skipped.toLocaleString()}`);
}

async function flushOwners(batch) {
  if (!batch.length) return;
  const vals = [], params = [];
  let p = 1;
  for (const r of batch) {
    vals.push(`($${p++}::bigint,$${p++},$${p++},$${p++},$${p++},$${p++},'datalastic',NOW())`);
    params.push(r.imo, r.vessel_name, r.owner_name, r.country, r.manager_name, r.ism_manager);
  }
  await pool.query(`
    INSERT INTO owners (imo,vessel_name,owner_name,country,manager_name,ism_manager,contact_source,fetched_at)
    VALUES ${vals}
    ON CONFLICT (imo) DO UPDATE SET
      vessel_name  = COALESCE(NULLIF(owners.vessel_name,''),  NULLIF(EXCLUDED.vessel_name,'')),
      owner_name   = COALESCE(NULLIF(owners.owner_name,''),   NULLIF(EXCLUDED.owner_name,'')),
      country      = COALESCE(NULLIF(owners.country,''),      NULLIF(EXCLUDED.country,'')),
      manager_name = COALESCE(NULLIF(owners.manager_name,''), NULLIF(EXCLUDED.manager_name,'')),
      ism_manager  = COALESCE(NULLIF(owners.ism_manager,''),  NULLIF(EXCLUDED.ism_manager,''))
  `, params);
}

async function flushVessels(batch) {
  if (!batch.length) return;
  const vals = [], params = [];
  let p = 1;
  for (const r of batch) {
    vals.push(`($${p++}::bigint,$${p++},$${p++},$${p++}::int4,$${p++}::int4)`);
    params.push(r.imo, r.flag, r.manager_name, r.built_year, r.dwt);
  }
  await pool.query(`
    UPDATE vessels AS v SET
      flag         = COALESCE(v.flag,         t.flag),
      manager_name = COALESCE(v.manager_name, t.mgr),
      built_year   = COALESCE(v.built_year,   t.by),
      deadweight   = COALESCE(v.deadweight,   t.dwt),
      updated_at   = NOW()
    FROM (VALUES ${vals}) AS t(imo,flag,mgr,by,dwt)
    WHERE v.imo = t.imo
  `, params);
}

async function flushCV(batch) {
  if (!batch.length) return;
  const vals = [], params = [];
  let p = 1;
  for (const r of batch) {
    vals.push(`($${p++},$${p++},$${p++},$${p++}::int4,$${p++},$${p++}::int4,$${p++})`);
    params.push(r.company_name, r.imo, r.vessel_name, r.year_built, r.flag, r.dwt, r.role);
  }
  await pool.query(`
    INSERT INTO company_vessels (company_name,imo,vessel_name,year_built,flag,deadweight,role)
    VALUES ${vals}
    ON CONFLICT (company_name,imo) DO UPDATE SET
      vessel_name = COALESCE(EXCLUDED.vessel_name, company_vessels.vessel_name),
      year_built  = COALESCE(EXCLUDED.year_built,  company_vessels.year_built),
      flag        = COALESCE(EXCLUDED.flag,         company_vessels.flag),
      deadweight  = COALESCE(EXCLUDED.deadweight,   company_vessels.deadweight),
      role        = EXCLUDED.role
  `, params);
}

// ─── 2. INSPECTIONS ───────────────────────────────────────────────────────────

async function importInspections(ourIMOs) {
  const csvPath = await getCSV("inspections", "inspections");
  log(`inspections CSV: ${csvPath}`);

  // Group by IMO: max(date), sum(detention), sum(deficiencies), contact per ism_manager
  const byImo = new Map();  // imo → { lastDate, detentions, deficiencies }
  const contactByMgr = new Map(); // mgr_name → { website, email, phone }

  let total = 0, skipped = 0;

  await streamCSV(csvPath, (row) => {
    total++;
    const imo = s(row.imo);
    if (!imo || !ourIMOs.has(imo)) { skipped++; return; }

    const cur = byImo.get(imo) || { lastDate: null, detentions: 0, deficiencies: 0 };
    const dt  = s(row.inspection_date);
    if (dt && (!cur.lastDate || dt > cur.lastDate)) cur.lastDate = dt;
    if (row.detention === "1" || row.detention === 1) cur.detentions++;
    cur.deficiencies += i(row.ship_deficiencies) || 0;
    byImo.set(imo, cur);

    const mgr = s(row.technical_ism_manager);
    if (mgr && (s(row.website) || s(row.email) || phone(row.phone))) {
      if (!contactByMgr.has(mgr)) {
        contactByMgr.set(mgr, { website: s(row.website), email: s(row.email), phone: phone(row.phone) });
      }
    }
  });

  log(`  inspections: ${total.toLocaleString()} satır | eşleşen gemi: ${byImo.size} | atlanan: ${skipped.toLocaleString()}`);

  // Batch UPDATE vessels
  const entries = [...byImo.entries()];
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const vals = [], params = [];
    let p = 1;
    for (const [imo, r] of batch) {
      vals.push(`($${p++}::bigint,$${p++}::date,$${p++}::int4,$${p++}::int4)`);
      params.push(imo, r.lastDate, r.detentions, r.deficiencies);
    }
    await pool.query(`
      UPDATE vessels AS v SET
        last_inspection_date = GREATEST(v.last_inspection_date, t.dt),
        detention_count      = GREATEST(COALESCE(v.detention_count,0), t.det),
        deficiency_count     = GREATEST(COALESCE(v.deficiency_count,0), t.def)
      FROM (VALUES ${vals}) AS t(imo,dt,det,def)
      WHERE v.imo = t.imo
    `, params);
  }
  log(`  inspections → vessels güncellendi: ${byImo.size} gemi`);

  // owners: contact (sadece NULL doldur)
  const mgrEntries = [...contactByMgr.entries()];
  for (let i = 0; i < mgrEntries.length; i += BATCH_SIZE) {
    const batch = mgrEntries.slice(i, i + BATCH_SIZE);
    const vals = [], params = [];
    let p = 1;
    for (const [mgr, c] of batch) {
      vals.push(`($${p++},$${p++},$${p++},$${p++})`);
      params.push(mgr, c.website, c.email, c.phone);
    }
    await pool.query(`
      UPDATE owners SET
        website = COALESCE(owners.website, t.website),
        email   = COALESCE(owners.email,   t.email),
        phone   = COALESCE(owners.phone,   t.phone)
      FROM (VALUES ${vals}) AS t(mgr,website,email,phone)
      WHERE owners.manager_name = t.mgr OR owners.ism_manager = t.mgr
    `, params);
  }
  log(`  inspections → owners contact güncellendi: ${contactByMgr.size} şirket`);
  log(`inspections TAMAM`);
}

// ─── 3. DRY DOCK DATES ────────────────────────────────────────────────────────

async function importDryDock(ourIMOs) {
  const csvPath = await getCSV("dry_dock_dates", "dry_dock_dates");
  log(`dry_dock_dates CSV: ${csvPath}`);

  let total = 0, matched = 0, skipped = 0;
  const vesBatch = [];
  const contactByMgr = new Map();

  async function flush(force = false) {
    if (vesBatch.length >= BATCH_SIZE || (force && vesBatch.length)) {
      const batch = vesBatch.splice(0);
      const vals = [], params = [];
      let p = 1;
      for (const r of batch) {
        vals.push(`($${p++}::bigint,$${p++}::date,$${p++}::date,$${p++}::date,$${p++}::date)`);
        params.push(r.imo, r.special_survey_date, r.dry_dock_date, r.iopp_exp_date, r.dry_dock_date);
      }
      await pool.query(`
        UPDATE vessels AS v SET
          special_survey_date = COALESCE(v.special_survey_date, t.ssd),
          last_dry_dock_date  = COALESCE(v.last_dry_dock_date,  t.ddd),
          dry_dock_date       = COALESCE(v.dry_dock_date,       t.ddd2),
          iopp_exp_date       = COALESCE(v.iopp_exp_date,       t.iopp)
        FROM (VALUES ${vals}) AS t(imo,ssd,ddd,iopp,ddd2)
        WHERE v.imo = t.imo
      `, params);
    }
  }

  await streamCSV(csvPath, async function(row) {
    total++;
    const imo = s(row.imo);
    if (!imo || !ourIMOs.has(imo)) { skipped++; return; }
    matched++;

    vesBatch.push({
      imo,
      special_survey_date: d(row.special_survey_date),
      dry_dock_date:       d(row.dry_dock_date),
      iopp_exp_date:       d(row.iopp_exp_date),
    });

    const mgr = s(row.technical_manager);
    if (mgr && (s(row.website) || s(row.email) || phone(row.phone))) {
      if (!contactByMgr.has(mgr))
        contactByMgr.set(mgr, { website: s(row.website), email: s(row.email), phone: phone(row.phone) });
    }

    if (vesBatch.length >= BATCH_SIZE) return flush();
    if (total % 1000 === 0)
      log(`  dry_dock_dates: ${total.toLocaleString()} | eşleşen: ${matched.toLocaleString()}`);
  });

  await flush(true);

  // owners contact
  const mgrEntries = [...contactByMgr.entries()];
  for (let i = 0; i < mgrEntries.length; i += BATCH_SIZE) {
    const batch = mgrEntries.slice(i, i + BATCH_SIZE);
    const vals = [], params = [];
    let p = 1;
    for (const [mgr, c] of batch) {
      vals.push(`($${p++},$${p++},$${p++},$${p++})`);
      params.push(mgr, c.website, c.email, c.phone);
    }
    await pool.query(`
      UPDATE owners SET
        website = COALESCE(owners.website, t.website),
        email   = COALESCE(owners.email,   t.email),
        phone   = COALESCE(owners.phone,   t.phone)
      FROM (VALUES ${vals}) AS t(mgr,website,email,phone)
      WHERE owners.manager_name = t.mgr OR owners.ism_manager = t.mgr
    `, params);
  }

  log(`dry_dock_dates TAMAM: ${total.toLocaleString()} satır | eşleşen: ${matched.toLocaleString()} | atlanan: ${skipped.toLocaleString()} | contact: ${contactByMgr.size} şirket`);
}

// ─── 4. SALES & DEMOLITIONS ───────────────────────────────────────────────────

async function importSales(ourIMOs) {
  const csvPath = await getCSV("sales_purchase_demolitions", "sales_purchase_demolitions");
  log(`sales CSV: ${csvPath}`);

  let total = 0, matched = 0, skipped = 0;
  let batch = [];

  async function flush(force = false) {
    if (batch.length >= BATCH_SIZE || (force && batch.length)) {
      const rawRows = batch.splice(0);
      // Deduplicate by (imo, sale_date) within batch — CSV may have multiple rows per sale
      const seen = new Set();
      const rows = rawRows.filter(r => {
        const key = `${r.imo}|${r.sale_date}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const vals = [], params = [];
      let p = 1;
      for (const r of rows) {
        vals.push(`($${p++}::bigint,$${p++},$${p++},$${p++},$${p++},$${p++}::int4,$${p++}::numeric,$${p++}::numeric,$${p++}::numeric,$${p++},$${p++},$${p++}::numeric,$${p++}::numeric,$${p++},$${p++}::date,$${p++}::date,$${p++}::date,$${p++},$${p++}::boolean)`);
        params.push(
          r.imo, r.vessel_name, r.flag_name, r.vessel_type, r.seller,
          r.built_year, r.dwt, r.gt, r.ldt,
          r.buyer, r.sales_type,
          r.sales_price_usd_mio, r.sales_price_usd_ldt,
          r.destination,
          r.sale_date, r.dry_dock_date, r.special_survey_date,
          r.sales_note, r.previous_sales_record,
        );
      }
      await pool.query(`
        INSERT INTO vessel_sales
          (imo,vessel_name,flag_name,vessel_type,seller,built_year,dwt,gt,ldt,
           buyer,sales_type,sales_price_usd_mio,sales_price_usd_ldt,destination,
           sale_date,dry_dock_date,special_survey_date,sales_note,previous_sales_record)
        VALUES ${vals}
        ON CONFLICT (imo,sale_date) DO UPDATE SET
          seller              = COALESCE(EXCLUDED.seller,              vessel_sales.seller),
          buyer               = COALESCE(EXCLUDED.buyer,               vessel_sales.buyer),
          sales_price_usd_mio = COALESCE(EXCLUDED.sales_price_usd_mio, vessel_sales.sales_price_usd_mio),
          sales_price_usd_ldt = COALESCE(EXCLUDED.sales_price_usd_ldt, vessel_sales.sales_price_usd_ldt),
          destination         = COALESCE(EXCLUDED.destination,         vessel_sales.destination),
          sales_type          = COALESCE(EXCLUDED.sales_type,          vessel_sales.sales_type)
      `, params);
    }
  }

  await streamCSV(csvPath, async function(row) {
    total++;
    const imo = s(row.imo);
    // Sales: tüm satırları ekle (bizde olmayan IMO'lar da) — S&P geçmişi değerli
    // Ama sadece bizde olanlar için vessels join yapılır panelde
    if (!imo) { skipped++; return; }
    matched++;

    batch.push({
      imo,
      vessel_name:         s(row.vessel_name),
      flag_name:           s(row.flag_name),
      vessel_type:         s(row.vessel_type_code),
      seller:              s(row.seller),
      built_year:          i(row.built_year),
      dwt:                 n(row.dwt_design),
      gt:                  n(row.gt),
      ldt:                 n(row.ldt),
      buyer:               s(row.buyer),
      sales_type:          s(row.sales_type),
      sales_price_usd_mio: n(row.sales_price_usd_mio),
      sales_price_usd_ldt: n(row.sales_price_usd_ldt),
      destination:         s(row.destination),
      sale_date:           d(row.sales_report_date),
      dry_dock_date:       d(row.dry_dock_date),
      special_survey_date: d(row.special_survey_date),
      sales_note:          s(row.sales_note),
      previous_sales_record: row.previous_sales_record === "true" || row.previous_sales_record === "1",
    });

    if (batch.length >= BATCH_SIZE) return flush();
    if (total % 1000 === 0)
      log(`  sales: ${total.toLocaleString()} satır | import: ${matched.toLocaleString()}`);
  });

  await flush(true);
  log(`sales TAMAM: ${total.toLocaleString()} satır | import: ${matched.toLocaleString()} | atlanan: ${skipped.toLocaleString()}`);
}

// ─── Fleet stats ──────────────────────────────────────────────────────────────

async function updateFleetStats() {
  log("Fleet stats güncelleniyor…");
  const { rowCount } = await pool.query(`
    UPDATE owners SET
      fleet_count          = (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name),
      fleet_avg_age        = (SELECT ROUND(AVG(EXTRACT(YEAR FROM NOW()) - cv.year_built)::numeric, 1)
                              FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.year_built IS NOT NULL),
      fleet_total_dwt      = (SELECT SUM(cv.deadweight) FROM company_vessels cv WHERE cv.company_name = owners.owner_name),
      fleet_critical_count = (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.scrap_score >= 50),
      fleet_high_count     = (SELECT COUNT(*) FROM company_vessels cv WHERE cv.company_name = owners.owner_name AND cv.scrap_score >= 38),
      last_enriched_at     = NOW()
    WHERE owner_name IS NOT NULL
  `);
  log(`Fleet stats: ${rowCount} owner güncellendi.`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (FLEETSTATS) { await updateFleetStats(); await pool.end(); return; }

  log("=== importOwnershipCSV v2 başlıyor ===");
  if (LOCAL) log("Mod: LOCAL (scraper/data/reports/)");

  log("DB IMO listesi yükleniyor…");
  const ourIMOs = await loadOurIMOs();
  log(`DB'de ${ourIMOs.size.toLocaleString()} gemi.`);

  if (RUN_ALL || ONLY_OWN) await importOwnership(ourIMOs);
  if (RUN_ALL || ONLY_INS) await importInspections(ourIMOs);
  if (RUN_ALL || ONLY_DRY) await importDryDock(ourIMOs);
  if (RUN_ALL || ONLY_SAL) await importSales(ourIMOs);

  if (RUN_ALL || ONLY_OWN) await updateFleetStats();

  // Özet
  const [{ rows: ow }, { rows: cv }, { rows: vs }] = await Promise.all([
    pool.query("SELECT COUNT(*) c FROM owners WHERE owner_name IS NOT NULL OR manager_name IS NOT NULL"),
    pool.query("SELECT COUNT(*) c, COUNT(DISTINCT company_name) cos FROM company_vessels"),
    pool.query("SELECT COUNT(*) c FROM vessel_sales"),
  ]);
  log(`\nÖzet:`);
  log(`  owners (dolu): ${ow[0].c}`);
  log(`  company_vessels: ${cv[0].c} satır | ${cv[0].cos} şirket`);
  log(`  vessel_sales: ${vs[0].c} satır`);

  await pool.end();
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
