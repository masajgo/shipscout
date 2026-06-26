"use strict";
/**
 * weeklyRefresh.js
 *
 * Haftalık Datalastic CSV rapor tazeleme + Supabase import.
 * launchd tarafından Pazar 03:00'de çağrılır.
 *
 * Akış:
 *   1. Kredi kontrolü (< 50 ise çık)
 *   2. 4 rapor oluştur (POST /report)
 *   3. Tümü DONE olana kadar bekle (30s poll, 10dk timeout)
 *   4. importOwnershipCSV.js --ownership --inspections --drydock --sales çalıştır
 *   5. scrap_score yeniden hesapla (survey/detention değişti)
 *   6. Başında ve sonunda kalan krediyi logla
 *
 * Kullanım:
 *   node scripts/weeklyRefresh.js
 *   node scripts/weeklyRefresh.js --dry-run   # rapor oluşturma, sadece kredi kontrol
 *   caffeinate -i node scripts/weeklyRefresh.js
 */

const path   = require("path");
const fs     = require("fs");
const { execSync, spawn } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const API_KEY = process.env.DATALASTIC_API_KEY;
if (!API_KEY) { console.error("DATALASTIC_API_KEY eksik"); process.exit(1); }

const CREDIT_MIN   = 50;          // bu kadar kalırsa çalışma
const POLL_MS      = 30_000;      // rapor status poll aralığı
const TIMEOUT_MS   = 10 * 60_000; // max bekleme süresi

const LOG_FILE = path.join(__dirname, "../logs/weekly_refresh.log");
const DRY_RUN  = process.argv.includes("--dry-run");

const REPORT_TYPES = [
  "ownership",
  "inspections",
  "dry_dock_dates",
  "sales_purchase_demolitions",
];

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  process.stdout.write(line + "\n");
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Datalastic helpers ───────────────────────────────────────────────────────

async function dlJSON(url, opts = {}) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...opts });
  const j   = await res.json();
  return j;
}

async function getCredit() {
  const j = await dlJSON(`https://api.datalastic.com/api/v0/stat?api-key=${API_KEY}`);
  if (!j?.meta?.success) throw new Error(`stat endpoint hatası: ${j?.meta?.message}`);
  return {
    remaining: j.data.requests_remaining,
    made:      j.data.requests_made,
  };
}

async function createReport(type) {
  const j = await dlJSON("https://api.datalastic.com/api/v0/report", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ "api-key": API_KEY, report_type: type }),
  });
  if (!j?.meta?.success) throw new Error(`Rapor oluşturulamadı (${type}): ${j?.meta?.message}`);
  return j.data.report_id;
}

async function listReports() {
  const j = await dlJSON(`https://api.datalastic.com/api/v0/report?api-key=${API_KEY}&report_id=_all`);
  if (!j?.meta?.success) throw new Error(`Rapor listesi alınamadı: ${j?.meta?.message}`);
  return j.data || [];
}

// ─── Rapor tamamlanana kadar bekle ────────────────────────────────────────────

async function waitForReports(reportIds) {
  const idSet    = new Set(reportIds);
  const deadline = Date.now() + TIMEOUT_MS;
  const done     = new Map(); // report_id → result_url

  log(`${idSet.size} rapor bekleniyor (max ${TIMEOUT_MS / 60000} dk)…`);

  while (done.size < idSet.size) {
    if (Date.now() > deadline) {
      const pending = [...idSet].filter(id => !done.has(id));
      throw new Error(`Timeout — şu raporlar tamamlanamadı: ${pending.join(", ")}`);
    }

    const reports = await listReports();
    for (const r of reports) {
      if (idSet.has(r.report_id) && r.status === "_DONE_" && !done.has(r.report_id)) {
        done.set(r.report_id, r.result_url);
        log(`  ✓ ${r.report_type} DONE`);
      }
    }

    if (done.size < idSet.size) {
      const pending = [...idSet].filter(id => !done.has(id)).length;
      log(`  … ${pending} rapor hâlâ işleniyor, ${POLL_MS / 1000}s bekliyor`);
      await sleep(POLL_MS);
    }
  }

  return done;
}

// ─── importOwnershipCSV.js'i çalıştır ────────────────────────────────────────

function runImport(args) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "importOwnershipCSV.js");
    log(`importOwnershipCSV.js ${args.join(" ")} çalıştırılıyor…`);

    const child = spawn(
      process.execPath,
      [scriptPath, ...args],
      {
        cwd:   path.join(__dirname, ".."),
        env:   process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout.on("data", d => {
      const lines = d.toString().split("\n").filter(Boolean);
      lines.forEach(l => log(`  | ${l}`));
    });
    child.stderr.on("data", d => {
      const lines = d.toString().split("\n").filter(Boolean);
      lines.forEach(l => log(`  ! ${l}`));
    });
    child.on("close", code => {
      if (code === 0) resolve();
      else reject(new Error(`importOwnershipCSV.js çıkış kodu: ${code}`));
    });
    child.on("error", reject);
  });
}

// ─── scrap_score yeniden hesapla ──────────────────────────────────────────────

function runRescore() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, "bulkEnrichAll.js");
    log("Rescore başlıyor (bulkEnrichAll --rescore)…");

    const child = spawn(
      process.execPath,
      [scriptPath, "--rescore"],
      {
        cwd:   path.join(__dirname, ".."),
        env:   process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    child.stdout.on("data", d => {
      const lines = d.toString().split("\n").filter(Boolean);
      lines.forEach(l => log(`  | ${l}`));
    });
    child.stderr.on("data", d => {
      const lines = d.toString().split("\n").filter(Boolean);
      lines.forEach(l => log(`  ! ${l}`));
    });
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`rescore çıkış kodu: ${code}`)));
    child.on("error", reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("════════════════════════════════════════════════════");
  log("=== weeklyRefresh başlıyor ===");
  if (DRY_RUN) log("[DRY-RUN] Gerçek rapor oluşturulmayacak.");

  // 1. Kredi kontrolü
  const creditBefore = await getCredit();
  log(`Datalastic kredi: ${creditBefore.remaining} kaldı (${creditBefore.made} kullanıldı)`);

  if (creditBefore.remaining < CREDIT_MIN) {
    log(`⚠ Datalastic kredi bitti (${creditBefore.remaining} < ${CREDIT_MIN}), tazeleme atlandı.`);
    log("=== weeklyRefresh ATLANDIRILDI — kredi yetersiz ===");
    return;
  }

  if (DRY_RUN) {
    log("[DRY-RUN] Kredi yeterli. Gerçek çalıştırmada raporlar oluşturulacak.");
    log("=== weeklyRefresh DRY-RUN tamamlandı ===");
    return;
  }

  // 2. Raporları oluştur
  log("Raporlar oluşturuluyor…");
  const reportIds = [];
  for (const type of REPORT_TYPES) {
    try {
      const id = await createReport(type);
      reportIds.push(id);
      log(`  ${type} → ${id}`);
    } catch (e) {
      log(`  ✗ ${type} rapor oluşturulamadı: ${e.message}`);
    }
  }

  if (!reportIds.length) throw new Error("Hiç rapor oluşturulamadı.");

  // 3. Tümü tamamlanana kadar bekle
  await waitForReports(reportIds);
  log("Tüm raporlar DONE ✓");

  // 4. Import — fresh reports (--local değil, API'den en son alacak)
  await runImport(["--ownership", "--inspections", "--drydock", "--sales"]);

  // 5. Scrap scoring yeniden hesapla
  await runRescore();

  // 6. Bitiş kredisi
  const creditAfter = await getCredit();
  log(`Datalastic kredi (sonra): ${creditAfter.remaining} kaldı`);
  log(`Kullanılan: ${creditAfter.made - creditBefore.made} istek`);

  log("=== weeklyRefresh tamamlandı ===");
  log("════════════════════════════════════════════════════");
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
