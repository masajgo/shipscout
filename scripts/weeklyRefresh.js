"use strict";
/**
 * weeklyRefresh.js
 *
 * Haftalık veri tazeleme — Datalastic yok, ücretsiz kaynaklar:
 *
 *   1. Thetis / Paris MOU  → güncel PSC detansiyonları (REST API, ücretsiz)
 *   2. Equasis              → vessel specs + ownership (Playwright, ~200/gün limit)
 *   3. Scrap score          → tüm gemiler için yeniden hesapla
 *
 * Çalıştırma:
 *   node scripts/weeklyRefresh.js
 *   node scripts/weeklyRefresh.js --dry-run
 *   caffeinate -i node scripts/weeklyRefresh.js
 */

const path   = require("path");
const fs     = require("fs");
const { spawn } = require("child_process");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const DRY_RUN  = process.argv.includes("--dry-run");
const LOG_FILE = path.join(__dirname, "../logs/weekly_refresh.log");

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  process.stdout.write(line + "\n");
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line + "\n");
  } catch {}
}

// ─── Script runner ────────────────────────────────────────────────────────────

function runScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    log(`▶ ${path.basename(scriptPath)} ${args.join(" ")}`);
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: path.join(__dirname, ".."),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", d =>
      d.toString().split("\n").filter(Boolean).forEach(l => log(`  | ${l}`))
    );
    child.stderr.on("data", d =>
      d.toString().split("\n").filter(Boolean).forEach(l => log(`  ! ${l}`))
    );
    child.on("close", code => {
      if (code === 0) {
        log(`  ✓ ${path.basename(scriptPath)} tamamlandı`);
        resolve();
      } else {
        const err = new Error(`${path.basename(scriptPath)} çıkış kodu: ${code}`);
        log(`  ✗ ${err.message}`);
        reject(err);
      }
    });
    child.on("error", reject);
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log("════════════════════════════════════════════════════");
  log("=== weeklyRefresh başlıyor (Equasis + Thetis) ===");
  if (DRY_RUN) log("[DRY-RUN] Script'ler çalıştırılmayacak.");

  if (DRY_RUN) {
    log("Adımlar: 1) Thetis detansiyonları  2) Equasis enrich (200 gemi)  3) Scrap rescore");
    log("=== weeklyRefresh DRY-RUN tamamlandı ===");
    return;
  }

  // 1. Paris MOU / Thetis — güncel PSC detansiyonlarını çek
  log("── Adım 1: Thetis PSC detansiyonları ──");
  try {
    await runScript(path.join(__dirname, "fetchThetisDetentions.js"));
  } catch (e) {
    log(`  ⚠ Thetis başarısız (devam): ${e.message}`);
  }

  // 2. Paris MOU XLS — aylık XLS import (varsa)
  log("── Adım 2: Paris MOU XLS import ──");
  try {
    await runScript(path.join(__dirname, "importParisMOU.js"));
  } catch (e) {
    log(`  ⚠ Paris MOU import başarısız (devam): ${e.message}`);
  }

  // 3. Equasis — eksik statik veri + ownership (günlük limit: ~200)
  log("── Adım 3: Equasis vessel enrich (200 gemi) ──");
  try {
    await runScript(path.join(__dirname, "backfillFromEquasis.js"), ["--limit=200"]);
  } catch (e) {
    log(`  ⚠ Equasis enrich başarısız (devam): ${e.message}`);
  }

  // 4. Scrap score yeniden hesapla
  log("── Adım 4: Scrap score rescore ──");
  try {
    await runScript(path.join(__dirname, "recomputeScrapScores.js"));
  } catch (e) {
    log(`  ⚠ Rescore başarısız (devam): ${e.message}`);
  }

  log("=== weeklyRefresh tamamlandı ===");
  log("════════════════════════════════════════════════════");
}

main().catch(err => {
  log(`FATAL: ${err.message}`);
  process.exit(1);
});
