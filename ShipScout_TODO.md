# ShipScout — Durum & Yapılacaklar
*2026-08-02 | Son commit: 47aa67c | Branch: main*

---

## ✅ TAMAMLANDI

| Alan | Durum |
|------|-------|
| AIS Live Map (Leaflet, cluster, scrap scoring) | ✅ |
| Datalastic full enrichment (11 alan + LDT + scrap_value) | ✅ |
| Render AIS worker (Docker, 15.600+ gemi/cycle) | ✅ |
| `owners` tablosu (Supabase, bigint PK) | ✅ |
| `scraper/dailyOwnerScan.js` (Equasis pipeline, 50/gün) | ✅ |
| launchd `com.shipscout.ownerscan` (09:00 günlük) | ✅ |
| Contact API (`/api/vessels/[mmsi]/contact`) → owners tablosu | ✅ |
| MapView contact panel (website, emails, phones, LinkedIn btn) | ✅ |
| scraper/data/ gitignore (debug HTML, owners.json, logs) | ✅ |
| **Panel: owner/manager/ISM ayrı satır + adres** (commit d30288c) | ✅ |
| **Equasis company table — data-field kolon parse** (commit 67f3be6) | ✅ |
| **LinkedIn statik lookup — top-50 ship manager** (commit 4a80a88) | ✅ |
| **SMTP verify Layer 4** — smtpVerify.ts + emailHunter.ts (commit 3814327) | ✅ |
| **S&P featured vessels** — DB'den canlı (OCEAN ENDEAVOUR + LADY ADRIANA, commit ff22886) | ✅ |
| **Radar News Signals** — newsRadarScan.js + /api/radar-events + /opportunities UI (commit a5054fd) | ✅ |
| **ShipScout Weekly** — generateWeeklyDigest.js + /weekly + /admin/weekly (commit 47aa67c) | ✅ |

---

## 🔴 OWNER ZİNCİRİ — YARI KALAN

### 1. LinkedIn Şirket Sayfası URL'i
**Sorun:** `linkedin_url` owners tablosunda çoğunlukla NULL.  
Panel şu an `/search/results/companies/?keywords=...` üretiyor — arama listesi açıyor, şirket sayfası değil.

**Çözüm seçenekleri (küçükten büyüğe):**
```
A) Top-50 shipmanager için hardcode lookup table → owners.linkedin_url UPDATE
B) dailyOwnerScan.js içinde: Google "site:linkedin.com/company {name}" → ilk URL parse
C) LinkedIn API (Companies endpoint) — OAuth gerektiriyor, overkill
```
→ **Öneri: A ile başla, 30 dk iş.**

**Dosyalar:** `scraper/dailyOwnerScan.js`, `owners` tablosu

---

### 2. 4 Katmanlı Email Bulma
**Sorun:** Sadece Katman 1 çalışıyor. Çoğu shipmanager websitesi email'i gizliyor.

```
Katman 1 ✅  Website scrape (contactEnricher.ts)
             → mailto: linkler, /contact sayfası

Katman 2 ⏸  Hunter.io domain-search API — STUB (key yok)
             → src/lib/emailHunter.ts içinde TODO bırakıldı

Katman 3 ⏸  Apollo.io people search — STUB (hesap yok)
             → src/lib/emailHunter.ts içinde TODO bırakıldı

Katman 4 ✅  SMTP verify (smtpVerify.ts)
             → MX lookup + RCPT TO handshake
             → Catch-all tespiti (random probe)
             → Domain concurrency lock, 10s timeout
             → contactEnricher.ts'e entegre
```

**Yapılacak dosyalar:**
- `src/lib/emailHunter.ts` — Hunter.io + Apollo entegrasyonu
- `src/lib/smtpVerify.ts` — SMTP doğrulama
- `src/lib/contactEnricher.ts` — fallback zinciri güncelle

---

### 3. Panel'e Tam Bağlama
**Sorun:** owners tablosundaki tüm alanlar panelde gösterilmiyor.

```
Şu an gösterilen:          Eksik:
─────────────────          ──────────────────────────
company (manager||owner)   owner_name  (ayrı satır)
website                    manager_name (ayrı satır)
emails[]                   ism_manager
phones[]                   address
emailFormat                email kalite badge (verified/scraped/guessed)
LinkedIn btn               kaynak indikatörü (equasis vs scraper)
```

**Dosya:** `src/components/MapView.tsx` (contact panel bloğu, ~satır 644-705)

**Hedef UI:**
```
┌─────────────────────────────┐
│ Manager: BERNHARD SCHULTE   │
│ Owner:   BSM SHIPPING LTD   │
│ ISM:     BSM GERMANY GMBH   │
│ 📍 Hamburg, Germany         │
├─────────────────────────────┤
│ 🌐 bs-shipmanagement.com    │
│ ✉ info@bs-shipmanagement.com  [scraped]
│ ✉ ops@bs-shipmanagement.com   [guessed]
│ 📞 +49 40 3019 0            │
└─────────────────────────────┘
```

---

## 🔲 DİĞER AÇIK GÖREVLER

### Acil (bugün/yarın)
- [ ] **Render log doğrula** — `updateStaticsToDB: N vessels updated` var mı?
  ```
  Render Dashboard → shipscout-ais-worker → Logs
  ```
- [ ] **launchd run sonucu** — 09:00 çalıştı mı?
  ```bash
  tail -50 scraper/data/daily_scan.log
  # Supabase'de:
  SELECT COUNT(*) FROM owners;
  ```

### Orta
- [x] **Equasis parse bug** — IMO 9321483: `managerName` adres string'i dönüyordu. `data-field` kolon eşlemesi ile düzeltildi. ✅
- [ ] **is_navaid / liquid_gas / speed_avg** — Datalastic'te var, DB'ye eklenmedi. Eklensin mi?

### Düşük
- [x] **S&P OCEAN ENDEAVOUR + LADY ADRIANA** — IMO 7625811 + 5073234, DB'den canlı query. ✅

---

## 📋 ÖNCELİK SIRASI

| # | Görev | Dosya | Durum |
|---|-------|-------|-------|
| 1 | Render log + launchd kontrol | — | ⏳ Manuel |
| 2 | LinkedIn hardcode lookup (top-50) | linkedinLookup.js | ✅ Done |
| 3 | Panel: owner/manager/ism ayrımı + adres | MapView.tsx | ✅ Done |
| 4 | Hunter.io email (Katman 2) | emailHunter.ts | ⏸ Stub/TODO |
| 5 | Equasis parse bug fix (9321483) | equasisOwner.js | ✅ Done |
| 6 | SMTP verify (Katman 4) | smtpVerify.ts | ✅ Done |
| 7 | Apollo people search (Katman 3) | emailHunter.ts | ⏸ Stub/TODO |
| 8 | S&P real listing | snp/route.ts | ✅ Done |
| 9 | Radar News Signals | newsRadarScan.js + radar-events API | ✅ Done |

### Weekly açık blokajlar
- `/admin/weekly` → draft'ı "Publish" et → `/weekly` listesinde görünür
- Her Pazartesi 08:00 launchd çalışır (`com.shipscout.weeklydigest` yüklendi ✅)
- Daha fazla radar_events biriktikçe --backfill ile geçmişi doldurabilirsin

### Radar açık blokajlar
- launchd plist: `launchctl load ~/Desktop/shipscout/launchd/com.shipscout.newsscan.plist` ile aktif et
- MarEx RSS URL doğrulandı (`/feed`), tekrar test edilebilir
- OFAC SDN: IMO number eşleşmesi 0 döndü — SDN XML'de `<idType>` string'i "IMO" tam eşleşme yerine farklı bir format kullanıyor olabilir; ileride kontrol et
- Paris MOU + Tokyo MOU: resmi feed yok, stub olarak bırakıldı

---

## 🏗 MİMARİ

```
AISStream → aisWorker.js (Render)
              ├─ vessels UPSERT
              ├─ Datalastic enrichCandidates()
              └─ updateStaticsToDB()

launchd 09:00 → dailyOwnerScan.js
                  → vessels (critical/high, imo≥8M, NOT IN owners)
                  → equasisOwner.js (Playwright, data-field parse ✅)
                  → contactEnrichment.js → linkedinLookup.js (top-50 ✅)
                  → owners UPSERT

/api/vessels/[mmsi]/contact
  → SELECT FROM owners (ism_manager + address dahil ✅)
  → ContactResult → MapView contact panel (owner/mgr/ISM ayrı ✅)

contactEnricher.ts enrichment katmanları:
  Katman 1: website scrape ✅
  Katman 2: Hunter.io ⏸ (stub)
  Katman 3: Apollo.io ⏸ (stub)
  Katman 4: SMTP verify ✅ smtpVerify.ts

Kalan blokajlar:
  DB şifre rotasyonu  → 3'lü güncelleme (Mac + Vercel + Railway)
  Datalastic kredi    → weeklyRefresh.js beklemede
  Photo scan          → ~%20 tamamlandı, caffeinate ile devam
  Hunter.io Katman 2  → paid plan ($49/mo)
  Apollo Katman 3     → hesap/key
```

## 2026-07-19 — Güvenlik rotasyonu / Enrichment durumu

**Tamamlandı:**
- [x] Anthropic API key rotate edildi
- [x] JWT_SECRET rotate edildi + Vercel production redeploy edildi (önceden hiç set edilmemiş, ADMIN_SECRET'a fallback ediyordu — açık kapandı)
- [x] Contact enrichment Run 5-6: 430 email / 395 phone / 771 website / 780 checkpoint (%46 email hit rate, en iyi run)

**Bekliyor — SIRADAKİ:**
- [ ] DB şifresi rotasyonu — Supabase Dashboard → Settings → Database → Reset database password
  - Reset sonrası HEMEN 3 yerde güncelle (tek oturumda, yoksa site kopar):
    1. Mac ~/Desktop/shipscout/.env.local → DATABASE_URL
    2. Vercel: npx vercel env rm DATABASE_URL production && npx vercel env add DATABASE_URL production
    3. Railway: Dashboard → Variables → DATABASE_URL
  - Sonra: npx vercel --prod (Railway genelde otomatik restart eder, kontrol et)
- [ ] Photo scan ~%20 kaldı (DB-friendly batch mode hazır, caffeinate ile çalıştır)
- [ ] Datalastic kredisi tükendi — weeklyRefresh.js kredi bekliyor, yeni kredi eklenmeli
- [ ] Contact enrichment devam edebilir: node scripts/enrichOpportunityContacts.js --limit=200
