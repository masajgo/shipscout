# ShipScout — Durum & Yapılacaklar
*2026-06-21 | Son commit: bfbb5db | Branch: main*

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

Katman 2 ❌  Hunter.io domain-search API
             → GET /v2/domain-search?domain=X&api_key=KEY
             → emails[] + emailFormat pattern
             → Ücretsiz: 25 req/ay | Starter: $49/mo 500 req

Katman 3 ❌  Apollo.io people search
             → "Commercial Director" / "Fleet Manager" title filter
             → Ücretsiz: 50 export/mo

Katman 4 ⚠️  Email format tahmini (KISMI — guessEmailFormat() var)
             → {first}.{last}@domain.com üretiliyor
             → SMTP verify YOK — MX lookup + RCPT TO handshake eksik
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
- [ ] **Equasis parse bug** — IMO 9321483: `managerName` adres string'i dönüyor
  - `scraper/equasisOwner.js` management table column sırası yanlış
- [ ] **is_navaid / liquid_gas / speed_avg** — Datalastic'te var, DB'ye eklenmedi. Eklensin mi?

### Düşük
- [ ] **S&P OCEAN ENDEAVOUR** — IMO 7625811 gerçek listing (`src/app/snp/page.tsx`)

---

## 📋 ÖNCELİK SIRASI

| # | Görev | Dosya | Est. |
|---|-------|-------|------|
| 1 | Render log + launchd kontrol | — | 5 dk |
| 2 | LinkedIn hardcode lookup (top-50) | dailyOwnerScan.js | 30 dk |
| 3 | Panel: owner/manager/ism ayrımı + adres | MapView.tsx | 30 dk |
| 4 | Hunter.io email (Katman 2) | emailHunter.ts | 1 sa |
| 5 | Equasis parse bug fix (9321483) | equasisOwner.js | 20 dk |
| 6 | SMTP verify (Katman 4) | smtpVerify.ts | 1.5 sa |
| 7 | Apollo people search (Katman 3) | emailHunter.ts | 1 sa |
| 8 | S&P real listing | snp/page.tsx | 20 dk |

---

## 🏗 MİMARİ

```
AISStream → aisWorker.js (Render)
              ├─ vessels UPSERT
              ├─ Datalastic enrichCandidates()
              └─ updateStaticsToDB()

launchd 09:00 → dailyOwnerScan.js
                  → vessels (critical/high, imo≥8M, NOT IN owners)
                  → equasisOwner.js (Playwright, 250/gün)
                  → owners UPSERT

/api/vessels/[mmsi]/contact
  → SELECT FROM owners
  → ContactResult → MapView contact panel

EKSIK ZİNCİR:
  owners.linkedin_url → gerçek company page   ← #2
  emailHunter.ts      → Hunter + Apollo       ← #4/#7
  smtpVerify.ts       → SMTP doğrulama        ← #6
  MapView panel       → tam alan gösterimi    ← #3
```
