# ShipScout TODO & Durum Raporu
*Güncellendi: 2026-06-21 | Son commit: 4a8413f | Branch: main*

---

## ✅ TAMAMLANDI (Bu Oturuma Kadar)

### AIS Live Map
- [x] Leaflet canvas renderer, cluster/individual markers
- [x] Scrap scoring + kategori (critical/high/medium/low)
- [x] Map panel: isim, bayrak, hız, kurs, scrap skoru, yaş
- [x] Track (last positions) görünümü
- [x] Cluster tıklanabilir, flyTo animasyonu

### Datalastic Full Enrichment (commit: 3323cfb)
- [x] `scraper/builtYearEnrichment.js` — TÜM statik alanlar: gross_tonnage, deadweight, type_specific, teu, length, breadth, draught, speed_max, home_port, callsign, flag
- [x] LDT tahmini: DWT × tip katsayısı (container 0.28 / tanker 0.20 / bulk 0.20 / ro-ro 0.40...)
- [x] Yolcu/cruise/ferry → ldt=null ("as per request")
- [x] Scrap value: LDT × $450/LDT (SCRAP_PRICE_PER_LDT env override)
- [x] `updateStaticsToDB()` — COALESCE UPDATE, sadece null kolonları doldurur
- [x] `worker/aisWorker.js` — her cycle sonrası updateStaticsToDB() çağrısı
- [x] 11 yeni vessels sütunu eklendi

### Render AIS Worker (Production)
- [x] `render.yaml` — dockerfilePath + `dockerContext: .` (Blueprint parse fix)
- [x] `worker/Dockerfile` — `COPY scraper/ ./scraper/` eklendi
- [x] Render'a deploy edildi, 15.600+ gemi/cycle işliyor
- [x] Env: DATABASE_URL, AISSTREAM_API_KEY, DATALASTIC_API_KEY, NODE_ENV=production

### Owners DB + Günlük Equasis Pipeline
- [x] `owners` tablosu: `imo bigint PRIMARY KEY`, vessel_name, owner_name, manager_name, ism_manager, website, emails[], phones[], address, email_format, linkedin_url, source, fetched_at
- [x] `scraper/dailyOwnerScan.js` — critical/high AND imo≥8M → Equasis → owners UPSERT
- [x] Rate-limit koruması: DAILY_LIMIT=250, delay 5-8s, block detection, checkpoint/resume
- [x] equasis_usage.json — günlük sayaç (tarih bazlı sıfırlama)
- [x] launchd: `com.shipscout.ownerscan` — 09:00 günlük, yüklü ve aktif
- [x] Contact API (`/api/vessels/[mmsi]/contact`) — owners tablosundan okuma, maxDuration:10s

### Contact Panel (MapView)
- [x] Website linki, emails (mailto), phones, emailFormat gösterimi
- [x] LinkedIn arama linki butonu (company name → URL encode)
- [x] "Teklif emaili yaz" butonu — mailto ile draft oluşturma
- [x] "No owner data available" fallback

---

## 🔴 YARI KALDI — OWNER ZİNCİRİ

Owner chain'in 3 kritik parçası **eksik veya kısmi**:

### 1. LinkedIn Arama Linkleri — Kısmi (Öncelik: Yüksek)
**Mevcut durum:** `linkedinSearchUrl` oluşturuluyor AMA kalitesi düşük.
- owners tablosundaki `linkedin_url` çoğunlukla null → fallback `/search/results/companies/?keywords=...` üretiliyor
- Bu arama URL'i company sayfasına değil, arama listesine götürüyor

**Yapılacak:**
- Equasis'ten çekilen `manager_name` ile şirketin gerçek LinkedIn company page URL'i bulunacak
- Yöntem 1: Datalastic `vessel_info`'da varsa company LinkedIn alanı kontrol et
- Yöntem 2: Google arama `"{companyName}" site:linkedin.com/company` → ilk sonucu parse et
- Yöntem 3: Scraper'da manual lookup table (top 50 shipmanager için hardcode)
- owners.linkedin_url doldurulunca panel direkt doğru sayfaya açılacak

### 2. 4 Katmanlı Email Bulma — YAPILMADI (Öncelik: Yüksek)
**Mevcut durum:** Sadece website scrape var (Katman 1). Diğer 3 katman hiç yok.

**Planlanan 4 katman:**
```
Katman 1: Website scrape (contactEnricher.ts — MEVCUT)
  → mailto: linkleri, /contact sayfası, meta tags

Katman 2: Hunter.io API (YAPILMADI)
  → GET https://api.hunter.io/v2/domain-search?domain={domain}&api_key=KEY
  → emails[] + emailFormat pattern döner
  → Aylık 25 free / 500 starter $49/mo

Katman 3: Apollo.io / Clearbit API (YAPILMADI)
  → Apollo: POST /v1/people/search { organization_domains: [domain] }
  → Clearbit: GET https://autocomplete.clearbit.com/v1/companies/suggest?query=...
  → Kişi bazlı: "Commercial Director", "Fleet Manager" title filter

Katman 4: Email format tahmini + doğrulama (KISMI)
  → emailFormat pattern'den {first}.{last}@domain.com üret (MEVCUT — guessEmailFormat)
  → SMTP verify (YAPILMADI) — MX lookup + RCPT TO handshake
```

**Yapılacak dosyalar:**
- `src/lib/emailHunter.ts` — Hunter.io + Apollo entegrasyonu
- `src/lib/smtpVerify.ts` — SMTP doğrulama (basit MX + connect check)
- `src/lib/contactEnricher.ts` — fallback zinciri: scrape → hunter → apollo → format guess

### 3. Panele Tam Bağlama — Eksik (Öncelik: Orta)
**Mevcut durum:** Panel owners tablosundaki veriyi gösteriyor AMA:

- `owner_name` vs `manager_name` ayrımı panelde gösterilmiyor (sadece `company` = manager || owner)
- `ism_manager` hiç gösterilmiyor
- `address` gösterilmiyor
- Email kalitesi indikatörü yok (verified mi? scraped mı? guessed mı?)
- Equasis'ten gelen veri vs contactEnricher'dan gelen veri ayrımı yok (`cached:"db"` ama kaynak belli değil)

**Yapılacak (MapView.tsx contact panel):**
```tsx
// Şu an:
<div>{contact.company}</div>

// Olacak:
<div>Manager: {managerName}</div>
<div>Owner: {ownerName}</div>
{ismManager && <div>ISM: {ismManager}</div>}
{address && <div style={{fontSize:9}}>{address}</div>}
{emails.map(e => <EmailBadge email={e} verified={e.verified} />)}
// EmailBadge: yeşil=verified, sarı=scraped, gri=guessed
```

---

## 🔲 DİĞER AÇIK GÖREVLER

### Acil
- [ ] **Render worker log doğrula** — `updateStaticsToDB: N vessels updated` satırı var mı?
  - Render Dashboard → shipscout-ais-worker → Logs
- [ ] **09:00 launchd run kontrolü** — `tail -50 scraper/data/daily_scan.log` + `SELECT COUNT(*) FROM owners`

### Orta Öncelik
- [ ] **scraper/data/ gitignore** — runtime dosyaları commit'e girmesin:
  ```
  scraper/data/owners.json
  scraper/data/daily_scan.log
  scraper/data/contact_cache.json
  scraper/data/equasis_debug/
  scraper/data/equasis_usage.json
  ```
- [ ] **Equasis parse bug** — IMO 9321483: `managerName` adres string'i dönüyor
  - `scraper/data/equasis_debug/9321483.html` incelenecek
  - Management table column sırası düzeltilecek

### Düşük Öncelik
- [ ] **is_navaid / liquid_gas / speed_avg** — Datalastic'te var ama DB'ye eklenmedi. Eklensin mi karar verilecek.
- [ ] **S&P OCEAN ENDEAVOUR** — IMO 7625811 için gerçek S&P listing (`src/app/snp/page.tsx`)
- [ ] **VesselPanel.tsx** — MapView içindeki inline panel kodu ayrı component'e çıkarılabilir (refactor, acil değil)

---

## 🏗 MİMARİ ÖZET

```
AISStream WebSocket
    → worker/aisWorker.js (Render, 45s cycle)
        ├─ Step 1: vessels UPSERT (konum + AIS)
        ├─ Step 2a: enrichCandidates() → Datalastic API → statik alanlar
        └─ Step 2b: updateStaticsToDB() → COALESCE UPDATE

Equasis (launchd 09:00 / gün)
    → scraper/dailyOwnerScan.js
        → vessels WHERE critical/high AND imo≥8M AND NOT IN owners
        → equasisOwner.js (Playwright, 250/gün limit)
        → owners table UPSERT

Next.js /api/vessels/[mmsi]/contact
    → SELECT FROM owners WHERE imo=$1
    → ContactResult → MapView contact panel

EKSIK:
    Hunter.io / Apollo → emailHunter.ts  ← YAPILACAK
    SMTP verify        → smtpVerify.ts   ← YAPILACAK
    LinkedIn company URL lookup          ← YAPILACAK
```

---

## 📋 ÖNCELIK SIRALI YAPILACAKLAR

| # | Görev | Dosya | Süre |
|---|-------|-------|------|
| 1 | Render log + launchd kontrol | — | 5 dk |
| 2 | scraper/data/ gitignore | .gitignore | 2 dk |
| 3 | LinkedIn URL lookup (top 50 shipmanager hardcode) | owners table / dailyOwnerScan.js | 30 dk |
| 4 | Hunter.io entegrasyonu (Katman 2 email) | src/lib/emailHunter.ts | 1 saat |
| 5 | Panel owner/manager/ism ayrımı + adres | src/components/MapView.tsx | 30 dk |
| 6 | Equasis parse bug fix (9321483) | scraper/equasisOwner.js | 20 dk |
| 7 | Apollo / SMTP verify (Katman 3-4) | src/lib/smtpVerify.ts | 2 saat |
| 8 | S&P real listing OCEAN ENDEAVOUR | src/app/snp/page.tsx | 20 dk |

---

*Render worker: canlı, 15.600+ gemi/cycle | launchd: 09:00 aktif | Son commit: 4a8413f*
