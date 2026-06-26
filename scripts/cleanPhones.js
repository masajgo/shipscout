"use strict";

/**
 * cleanPhones.js
 *
 * owners tablosundaki phone / phones sütunlarını tarar, geçersizleri temizler.
 *
 * Kullanım:
 *   node scripts/cleanPhones.js           # dry-run (sadece rapor, DB'ye yazma)
 *   node scripts/cleanPhones.js --apply   # gerçek temizlik
 */

const path = require("path");
const fs   = require("fs");
const { Pool } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "../.env.local") });

const pool  = new Pool({ connectionString: process.env.DATABASE_URL });
const APPLY = process.argv.includes("--apply");

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Bir telefon dizesinin geçerli olup olmadığını kontrol eder.
 * Geçerli: + ile başlayıp 7-15 rakam, veya 7-15 rakamlı herhangi bir dize.
 * Geçersiz: tarih formatları, çok kısa, rakam içermeyen.
 */
function isValidPhone(p) {
  if (!p || typeof p !== "string") return false;
  const s = p.trim();
  if (!s) return false;

  // Tarih formatları → GEÇERSİZ
  // +YYYY-MM-DD, YYYY-MM-DD, DD.MM.YYYY, MM/DD/YYYY, vb.
  if (/^\+?\d{4}-\d{2}-\d{2}/.test(s))          return false; // +2024-01-09
  if (/^\d{2}\.\d{2}\.\d{2,4}$/.test(s))         return false; // 10.17.21
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s))     return false; // 01/09/2024
  if (/^\d{4}\/\d{2}\/\d{2}$/.test(s))           return false; // 2024/01/09

  // IP adresi formatı
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return false;

  // Versiyon numarası (x.y.z)
  if (/^\d+\.\d+\.\d+$/.test(s)) return false;

  // Rakam sayısını kontrol et
  const digits = s.replace(/\D/g, "");
  if (digits.length < 7)  return false; // çok kısa
  if (digits.length > 15) return false; // ITU-T E.164 max 15

  // En az bir rakam olmalı
  if (!/\d/.test(s)) return false;

  return true;
}

// ─── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log(`\n=== cleanPhones.js — ${APPLY ? "APPLY MODE" : "DRY-RUN"} ===\n`);

  const { rows } = await pool.query(
    "SELECT imo, phone, phones FROM owners WHERE phone IS NOT NULL OR (phones IS NOT NULL AND array_length(phones,1) > 0)"
  );

  let totalPhone    = 0, invalidPhone    = 0;
  let totalPhones   = 0, invalidPhones   = 0;
  const toFix = []; // { imo, newPhone, newPhones }

  const invalidExamples = [];

  for (const row of rows) {
    let phoneChanged  = false;
    let phonesChanged = false;
    let newPhone      = row.phone;
    let newPhones     = row.phones ? [...row.phones] : null;

    // ── scalar phone ──────────────────────────────────────────────────────────
    if (row.phone) {
      totalPhone++;
      if (!isValidPhone(row.phone)) {
        invalidPhone++;
        newPhone = null;
        phoneChanged = true;
        if (invalidExamples.length < 30)
          invalidExamples.push({ imo: row.imo, col: "phone", val: row.phone });
      }
    }

    // ── phones array ──────────────────────────────────────────────────────────
    if (row.phones && row.phones.length) {
      const cleaned = [];
      for (const p of row.phones) {
        totalPhones++;
        if (isValidPhone(p)) {
          cleaned.push(p);
        } else {
          invalidPhones++;
          phonesChanged = true;
          if (invalidExamples.length < 30)
            invalidExamples.push({ imo: row.imo, col: "phones[]", val: p });
        }
      }
      if (phonesChanged) {
        newPhones = cleaned.length ? cleaned : null;
      }
    }

    if ((phoneChanged || phonesChanged) && APPLY) {
      toFix.push({ imo: row.imo, newPhone, newPhones });
    }
  }

  // ── Report ────────────────────────────────────────────────────────────────────
  const totalInvalid = invalidPhone + invalidPhones;
  const totalTotal   = totalPhone   + totalPhones;

  console.log(`Taranan kayıt:   ${rows.length}`);
  console.log(`phone  sütunu:   ${totalPhone} değer → ${invalidPhone} geçersiz`);
  console.log(`phones sütunu:   ${totalPhones} değer → ${invalidPhones} geçersiz`);
  console.log(`─────────────────────────────────────`);
  console.log(`Toplam:          ${totalTotal} değer → ${totalInvalid} geçersiz (${((totalInvalid/totalTotal||0)*100).toFixed(1)}%)`);
  console.log(`Geçerli kalan:   ${totalTotal - totalInvalid}`);

  if (invalidExamples.length) {
    console.log(`\nGeçersiz örnekler:`);
    invalidExamples.forEach(e =>
      console.log(`  IMO ${e.imo} [${e.col}]: ${JSON.stringify(e.val)}`)
    );
  } else {
    console.log("\n✓ Geçersiz kayıt yok.");
  }

  // ── Apply ─────────────────────────────────────────────────────────────────────
  if (APPLY && toFix.length) {
    console.log(`\nTemizleniyor: ${toFix.length} satır güncelleniyor…`);
    let updated = 0;
    for (const { imo, newPhone, newPhones } of toFix) {
      await pool.query(
        `UPDATE owners SET
           phone  = $2,
           phones = $3::text[]
         WHERE imo = $1::bigint`,
        [imo, newPhone, newPhones]
      );
      updated++;
    }
    console.log(`✓ ${updated} satır güncellendi.`);
  } else if (APPLY && !toFix.length) {
    console.log("\n✓ Temizlenecek kayıt yok.");
  } else if (totalInvalid > 0) {
    console.log(`\nGerçek temizlik için: node scripts/cleanPhones.js --apply`);
  }

  await pool.end();
})().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
