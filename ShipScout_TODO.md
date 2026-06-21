# ShipScout TODO & Sprint Report
*Güncellendi: 2026-06-21 | Son commit: 3323cfb*

---

## ✅ TAMAMLANDI

### 1. AIS Live Map
- [x] Leaflet canvas renderer, cluster/individual markers
- [x] Scrap scoring: age≥50→+40, ≥40→+35, ≥30→+28, ≥25→+20, ≥20→+12
- [x] Scrap kategorisi: >35=critical, ≥25=high, ≥15=medium, <15=low
- [x] Cluster tıklanabilir (interactive:true + flyTo)
- [x] Ticker bar `/map`'te gizleniyor
- [x] "Live · N vessels" — Supabase COUNT'tan
- [x] Panel: gemi detayı (isim, bayrak, hız, kurs, scrap skoru, yaş)
- [x] Track (last positions) görünümü

### 2. Owner/Contact Enrichment Pipeline
- [x] `src/lib/contactEnricher.ts` — domain heuristics, HEAD probe, maritime validation
- [x] `src/app/api/vessels/[mmsi]/contact/route.ts` — **owners tablosundan** (Supabase) okuma, maxDuration:10s
- [x] Contact panel: website, emails (mailto), phones, emailFormat, LinkedIn butonu
- [x] `scraper/contactEnrichment.js` — ROLE_LOCALS filter, maritime validation ≥4 threshold

### 3. Equasis Scraper
- [x] `scraper/equasisOwner.js` — Playwright login, IMO arama, cheerio parseShipPage
- [x] Rate-limit koruması: DAILY_LIMIT=250, delay 5-8s, block detection regex
- [x] Checkpoint/resume: owners.json'daki IMO'lar atlanıyor
- [x] waitForURL fix: `/restricted\/ShipInfo/` (false positive düzeltildi)
- [x] Log: `[5/120] ✓ IMO 9321483 | bugün: 47/250 (kalan: 203)`
- [x] equasis_usage.json — günlük sayaç, tarih bazlı otomatik sıfırlama

### 4. Kalıcı Owners Tablosu (Supabase)
- [x] `owners` tablosu oluşturuldu: `imo bigint PRIMARY KEY`, vessel_name, owner_name, manager_name, ism_manager, website, emails[], phones[], address, email_format, linkedin_url, source, fetched_at
- [x] `scraper/dailyOwnerScan.js` — pipeline: vessels WHERE scrap_category IN ('critical','high') AND imo≥8M → Equasis → owners UPSERT
- [x] --dry-run flag, scraper/data/daily_scan.log
- [x] launchd: `com.shipscout.ownerscan` — 09:00 günlük, yüklü ve aktif

### 5. Render AIS Worker (Production)
- [x] `render.yaml` — dockerfilePath + dockerContext:. (Blueprint parse fix)
- [x] `worker/Dockerfile` — `COPY scraper/ ./scraper/` eklendi (builtYearEnrichment bağımlılığı)
- [x] Render'a deploy edildi, 15.600+ gemi/cycle işliyor
- [x] Env vars: DATABASE_URL, AISSTREAM_API_KEY, DATALASTIC_API_KEY, NODE_ENV=production

### 6. Datalastic Full Enrichment
- [x] `scraper/builtYearEnrichment.js` — TÜM statik alanlar: gross_tonnage, deadweight, type_specific, teu, length, breadth, draught, speed_avg, speed_max, home_port, callsign, flag
- [x] LDT tahmini: DWT × tip katsayısı (container 0.28, tanker 0.20, bulk 0.20, ro-ro 0.40...)
- [x] Yolcu/cruise/ferry → ldt=null ("as per request")
- [x] Scrap value: LDT × $450/LDT (SCRAP_PRICE_PER_LDT env ile override)
- [x] `updateStaticsToDB()` — COALESCE UPDATE, sadece null olan alanları doldurur
- [x] `worker/aisWorker.js` — Step 2b: her cycle sonrası updateStaticsToDB() çağrısı
- [x] Yeni DB sütunları: gross_tonnage, deadweight, ldt, ldt_estimated, type_specific, teu, home_port, speed_max, callsign, scrap_value_usd, scrap_value_estimated

### 7. Core Pages
- [x] `/` — Ana sayfa
- [x] `/map` — AIS harita
- [x] `/alerts` — Judicial/distress alerts
- [x] `/snp` — S&P marketplace
- [x] `/owner` — Owner dashboard

---

## ⏳ BUGÜN OTOMATİK (2026-06-21)

- [ ] **09:00** — `com.shipscout.ownerscan` launchd çalışacak (ilk gerçek run, taze 250 limit)
  - 50 gemi × 5-8s ≈ 5-7 dk
  - Log: `scraper/data/daily_scan.log`
  - Doğrulama: `SELECT COUNT(*) FROM owners` (akşam kontrol)

---

## 🔲 AÇIK / BEKLEYEN

### 1. Render Worker Log Doğrulaması (Öncelik: Yüksek)
Datalastic enrichment'ın production'da çalıştığını doğrula:
```
Render → shipscout-ais-worker → Logs
→ "updateStaticsToDB: N vessels updated" satırı aranacak
```

### 2. scraper/data/ .gitignore (Öncelik: Orta)
Runtime dosyaları commit edilmemeli:
```
# .gitignore'a ekle:
scraper/data/owners.json
scraper/data/daily_scan.log
scraper/data/contact_cache.json
scraper/data/equasis_debug/
scraper/data/equasis_usage.json
```
Not: `scraper/data/vessel_age_cache.json` zaten gitignore'da.

### 3. Equasis Parse Bug — 9321483 (Öncelik: Orta)
`managerName` company adı yerine adres string'i dönüyor.
→ `scraper/data/equasis_debug/9321483.html` incelenmeli, management table column sırası düzeltilmeli

### 4. is_navaid / liquid_gas / speed_avg Karar (Öncelik: Düşük)
Datalastic'te mevcut 3 alan henüz DB'ye eklenmedi. Eklenecekse:
- vessels tablosuna sütun ekle
- getVesselInfo() entry'sine ekle
- updateStaticsToDB() parametrelerine ekle

### 5. S&P OCEAN ENDEAVOUR Gerçek Listing (Öncelik: Düşük)
IMO 7625811 için `src/app/snp/page.tsx` veya API'ye gerçek listing eklenmeli.
Şu an mock data var.

### 6. Equasis Parse Bug — IMO 9321483 managerName
`scraper/data/equasis_debug/9321483.html` incelenerek management table parsing düzeltilecek.

---

## 🐛 BİLİNEN BUGLAR

| Bug | Durum | Dosya |
|-----|-------|-------|
| 9321483 managerName parse yanlış | Açık | scraper/equasisOwner.js |
| SunStone contact'ta emails boş | Muhtemelen site koruması | contactEnricher.ts |

---

## 🏗 MİMARİ ÖZET

```
AISStream WebSocket (aisstream.io)
    → worker/aisWorker.js (Render background worker, 45s cycle)
        → Step 1: vessels UPSERT (konum, AIS data, scrap_score)
        → Step 2a: enrichCandidates() — Datalastic API (anchored/moored/risk flag)
        → Step 2b: updateStaticsToDB() — COALESCE UPDATE statik alanlar
    → Supabase vessels table

Equasis scraper (launchd 09:00 günlük)
    → scraper/dailyOwnerScan.js
        → vessels WHERE critical/high AND imo≥8M AND NOT IN owners
        → equasisOwner.js (Playwright, 5-8s delay, 250/day limit)
        → owners table UPSERT (Supabase)

Next.js API (/api/vessels/[mmsi]/contact)
    → SELECT FROM owners WHERE imo=$1
    → ContactResult { cached:"db" }
    → MapView.tsx contact panel
```

---

## 📋 SONRAKİ ADIMLAR (Öncelik Sırasıyla)

1. **Render worker logları** — updateStaticsToDB çalışıyor mu doğrula
2. **.gitignore** — scraper/data/ dosyaları ekle, commit
3. **09:00 launchd** — daily_scan.log'u akşam kontrol et, owners COUNT'u bak
4. **Equasis parse bug** — 9321483 HTML debug
5. **is_navaid/liquid_gas/speed_avg** — eklensin mi karar ver
6. **S&P real listing** — OCEAN ENDEAVOUR

---

*Son commit: `3323cfb` feat(enrichment): Datalastic tüm alanları + LDT tahmini + scrap value*
