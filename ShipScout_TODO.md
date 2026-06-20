# ShipScout TODO & Sprint Report
*Generated: 2026-06-20 | Branch: main | Last commit: c85a6bb*

---

## Sprint Özeti

Bu otonom sprint (~24 dakika, 69 tool use) şunları tamamladı ve yarım bıraktı:

---

## ✅ TAMAMLANDI

### 1. AIS Live Map (Harita)
- [x] Leaflet canvas renderer, cluster/individual markers
- [x] Scrap scoring: age>50→+40, >40→+35, >30→+28, >25→+20, >20→+12
- [x] Scrap kategorisi eşikleri: >35=critical, ≥25=high, ≥15=medium, <15=low
- [x] Cluster tıklanabilir (interactive:true + flyTo)
- [x] Map height fix: `position:absolute; inset:0`
- [x] Ticker bar `/map`'te gizleniyor (Layout.tsx)
- [x] "Live · N vessels" — Supabase COUNT'tan (WebSocket değil)
- [x] Panel: gemi detayı (isim, bayrak, hız, kurs, scrap skoru, yaş)
- [x] Track (last positions) görünümü

### 2. Owner/Contact Enrichment Pipeline
- [x] `src/lib/contactEnricher.ts` — domain heuristics, HEAD probe, maritime validation, email/phone/address extraction, emailFormat detection
- [x] `src/app/api/vessels/[mmsi]/contact/route.ts` — dual cache (memCache 6h + file cache owners.json), manager_name DB'den okunuyor
- [x] `src/components/MapView.tsx` — contact panel: website, emails (mailto), phones, emailFormat, LinkedIn butonu
- [x] `scraper/contactEnrichment.js` — ROLE_LOCALS filter, leadingAcronym, maritime validation, enrichWithCache
- [x] `scraper/equasisOwner.js` — Playwright login (page.evaluate), IMO arama, cheerio parseShipPage, management table parse

### 3. Equasis Scraper — Çalıştı
- [x] equasisOwner.js gerçek veri çekti: OCEAN ENDEAVOUR (7625811) + 9321483
- [x] `scraper/data/owners.json` populate edildi
- [x] OCEAN ENDEAVOUR: managerName=SUNSTONE SHIPS INC, ownerName=ENDEAVOUR PARTNERS UNIPESSOAL

### 4. Core Pages (daha önce tamamlanmış)
- [x] `/` — Ana sayfa
- [x] `/map` — AIS harita
- [x] `/alerts` — Judicial/distress alerts
- [x] `/snp` — S&P marketplace
- [x] `/owner` — Owner dashboard

### 5. Deploy (önceki commit)
- [x] Son deploy: `c85a6bb` Vercel'de canlı
- [x] Supabase bağlantısı: transaction pooler URL

---

## ✅ Sprint 2 Tamamlandılar (2026-06-20)

- [x] 4 uncommitted dosya commit & push edildi
- [x] contactEnrichment domain heuristics fix: `carriers`, `ocean`, `transportation` strip words; bare core + hyphenated-shipmanagement candidates sıralandı
- [x] Maritime validation threshold ≥2 → ≥4 (e-commerce false positives önlendi)
- [x] 5-şirket test PASS: SunStone✅ Bernhard Schulte✅ Columbia✅ Oldendorff✅ Cargill✅
- [x] S&P OCEAN ENDEAVOUR (7625811) eklendi — TRACKED_IMOS + hardcoded fallback
- [x] Track route: vessel_tracks tablosu yoksa 503 yerine graceful empty dönüyor
- [x] Railway Dockerfile mevcut ve hazır (`worker/Dockerfile`)
- [x] Tüm route curl testi — 6/7 ✅, contact ⚠️ (Equasis scraper bekleniyor)
- [x] Production deploy: shipscout.io güncel

---

## ⚠️ YARIDA KALDI / EKSİK

### 1. Git Commit — KRİTİK
**4 dosya değiştirildi ama commit edilmedi!**
```
modified: scraper/contactEnrichment.js
modified: scraper/equasisOwner.js
modified: src/app/api/vessels/[mmsi]/contact/route.ts
modified: src/components/MapView.tsx
```
→ `git add -A && git commit -m "..." && git push` gerekiyor

### 2. equasisOwner.js Parse Bug
IMO 9321483 için parse hatalı: `managerName` company adı yerine adres string'i çıkıyor.
Muhtemelen management table column sırası yanlış parse ediliyor.
→ `scraper/data/equasis_debug/9321483.html` incelenmeli

### 3. cheerio npm Paketi
equasisOwner.js `require("cheerio")` kullanıyor ama package.json'da yoksa install gerekiyor:
```bash
cd scraper && npm install cheerio   # veya root'tan: npm install cheerio
```

### 4. S&P Modülü — OCEAN ENDEAVOUR Gerçek Listing Yok
OCEAN ENDEAVOUR (IMO 7625811) gerçek S&P listing olarak eklenmedi.
Şu an mock data var. `src/app/snp/page.tsx` veya API'ye eklenecek.

### 5. 5-Şirket contactEnrichment Testi
Sadece SunStone test edildi. Hedef 5 şirket:
- [ ] SunStone Ship Management ✅ (çalışıyor)
- [ ] Bernhard Schulte Shipmanagement
- [ ] Columbia Shipmanagement
- [ ] Oldendorff Carriers
- [ ] Cargill Ocean Transportation

### 6. Tüm Route'ların curl Testi
Sistematik test yapılmadı. Yapılacaklar:
```bash
curl https://shipscout.vercel.app/api/vessels          # list
curl https://shipscout.vercel.app/api/vessels/[mmsi]   # detail
curl https://shipscout.vercel.app/api/vessels/[mmsi]/contact  # enrichment
curl https://shipscout.vercel.app/api/vessels/[mmsi]/track    # track
curl https://shipscout.vercel.app/api/alerts           # alerts
curl https://shipscout.vercel.app/api/owner            # owner stats
```

### 7. Railway/Render Konfigürasyonu
`railway.toml` mevcut ama Dockerfile ve tam deployment config eksik.
AIS worker production'da Railway/Render'da çalışmıyor — sadece PM2 ile local.

### 8. Production Deploy (son değişiklikler)
Commit edilmemiş 4 dosya Vercel'de yok. Owner enrichment paneli production'da görünmüyor.

---

## 🐛 BİLİNEN BUGLAR

| Bug | Durum | Dosya |
|-----|-------|-------|
| 9321483 managerName parse yanlış | Açık | scraper/equasisOwner.js |
| owners.json'daki imo key'i string, DB'deki imo column farklı olabilir | Kontrol edilmeli | contact/route.ts |
| SunStone contact'ta emails boş dönüyor (sunstoneships.com'da email korunmuş olabilir) | Muhtemelen açık | contactEnricher.ts |

---

## 📋 SONRAKI ADIMLAR (Öncelik Sırasıyla)

1. **Commit & push** — 4 uncommitted dosyayı commit et
2. **npm install cheerio** — scraper dependencies
3. **equasisOwner parse fix** — 9321483 debug HTML'i inceleyip column sırasını düzelt
4. **Vercel deploy** — son commit'ten sonra otomatik tetiklenir
5. **5-şirket test** — `node scraper/contactEnrichment.js` ile
6. **S&P OCEAN ENDEAVOUR** — gerçek listing ekle
7. **curl test suite** — tüm route'ları systematically test et
8. **Railway Dockerfile** — AIS worker production deployment

---

## 🏗 MİMARİ ÖZET

```
AISStream WebSocket
    → worker/aisWorker.js (PM2, 45s poll)
    → Supabase vessels table (UPSERT, 5s dedup)
    → /api/vessels (Supabase SELECT)
    → MapView.tsx (Leaflet clusters)

Equasis scraper (equasisOwner.js, Playwright)
    → scraper/data/owners.json
    → Supabase vessels.manager_name (ayrı script gerekiyor)
    → /api/vessels/[mmsi]/contact
    → contactEnricher.ts (domain heuristics)
    → MapView.tsx contact panel
```

---

*Sprint agent 69 tool use / ~24 dk sonra 401 auth error ile kesildi.*
