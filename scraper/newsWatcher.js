const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");

const STORE_PATH = path.join(__dirname, "data", "watched_vessels.json");

// ─── Store (JSON file, PostgreSQL'e geçince db.js ile değiştir) ──────────────

function loadStore() {
  if (!fs.existsSync(STORE_PATH)) return { vessels: [], ownerQueue: [], emailQueue: [] };
  return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
}

function saveStore(store) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
}

// ─── Watched Vessels ──────────────────────────────────────────────────────────

function watchVessel(vessel) {
  const store = loadStore();
  const exists = store.vessels.find((v) => v.imo === vessel.imo);
  if (exists) {
    console.log(`[Watch] ${vessel.name} (${vessel.imo}) zaten izleniyor`);
    return exists;
  }
  const entry = {
    imo: vessel.imo,
    name: vessel.name,
    flag: vessel.flag || null,
    shipType: vessel.shipType || null,
    builtYear: vessel.builtYear || null,
    source: vessel.source || null,
    addedAt: new Date().toISOString(),
    detentions: [],
    ownerInfo: null,
    offerEmail: null,
    status: "watching", // watching | owner_queued | email_ready | contacted
  };
  store.vessels.push(entry);
  // Sahip lookup kuyruğuna ekle
  store.ownerQueue.push({ imo: vessel.imo, name: vessel.name, queuedAt: new Date().toISOString() });
  saveStore(store);
  console.log(`[Watch] ${vessel.name} (${vessel.imo}) izlemeye alındı`);
  return entry;
}

function getWatchedVessels() {
  return loadStore().vessels;
}

function removeWatch(imo) {
  const store = loadStore();
  store.vessels = store.vessels.filter((v) => v.imo !== imo);
  store.ownerQueue = store.ownerQueue.filter((v) => v.imo !== imo);
  saveStore(store);
  console.log(`[Watch] ${imo} izlemeden çıkarıldı`);
}

// ─── MOU / USCG Cross-Check ───────────────────────────────────────────────────

async function checkDetentions(detainedVessels) {
  const store = loadStore();
  let alerts = 0;

  for (const watched of store.vessels) {
    const hit = detainedVessels.find((d) => d.imo === watched.imo);
    if (!hit) continue;

    const alreadyLogged = watched.detentions.find(
      (d) => d.authority === hit.authority && d.detentionDate === hit.detentionDate
    );
    if (alreadyLogged) continue;

    watched.detentions.push({
      authority: hit.authority,
      port: hit.port,
      detentionDate: hit.detentionDate,
      deficiencies: hit.deficiencies?.length || 0,
      scrapScore: hit.scrapScore,
      detectedAt: new Date().toISOString(),
    });

    console.log(`🚨 [Alert] ${watched.name} (${watched.imo}) — ${hit.authority} listesinde bulundu! Port: ${hit.port}`);
    alerts++;

    // Email kuyruğuna ekle (sahip bilgisi varsa)
    if (watched.ownerInfo) {
      queueOfferEmail(watched, store);
    }
  }

  if (alerts > 0) saveStore(store);
  return alerts;
}

// ─── Owner Lookup ─────────────────────────────────────────────────────────────

async function processOwnerQueue() {
  const store = loadStore();
  if (store.ownerQueue.length === 0) return;

  console.log(`[Owner] ${store.ownerQueue.length} gemi için sahip bilgisi aranıyor...`);

  for (const item of [...store.ownerQueue]) {
    try {
      const owner = await lookupOwner(item.imo);
      if (!owner) continue;

      const vessel = store.vessels.find((v) => v.imo === item.imo);
      if (vessel) {
        vessel.ownerInfo = owner;
        vessel.status = "owner_queued";
        // Detention varsa email kuyruğuna al
        if (vessel.detentions.length > 0) {
          queueOfferEmail(vessel, store);
        }
      }

      store.ownerQueue = store.ownerQueue.filter((q) => q.imo !== item.imo);
      console.log(`[Owner] ${item.name} (${item.imo}) — ${owner.company || "bulunamadı"}`);
    } catch (err) {
      console.error(`[Owner] ${item.imo} hata:`, err.message);
    }
  }

  saveStore(store);
}

async function lookupOwner(imo) {
  // Datalastic API (DATALASTIC_API_KEY .env.local'da tanımlıysa kullan)
  const apiKey = process.env.DATALASTIC_API_KEY;
  if (!apiKey) {
    console.warn(`[Owner] DATALASTIC_API_KEY eksik — ${imo} için sahip bilgisi alınamıyor`);
    return null;
  }
  try {
    const res = await axios.get(`https://api.datalastic.com/api/v0/vessel_owner`, {
      params: { "api-key": apiKey, imo },
      timeout: 10000,
    });
    const d = res.data?.data;
    if (!d) return null;
    return {
      company: d.registered_owner || d.beneficial_owner || null,
      operator: d.operator || null,
      manager: d.ship_manager || null,
      country: d.country || null,
      email: d.contact_email || null,
      phone: d.contact_phone || null,
    };
  } catch {
    return null;
  }
}

// ─── Offer Email ──────────────────────────────────────────────────────────────

function queueOfferEmail(vessel, store) {
  const alreadyQueued = store.emailQueue.find((e) => e.imo === vessel.imo);
  if (alreadyQueued) return;

  const email = buildOfferEmail(vessel);
  vessel.offerEmail = email;
  vessel.status = "email_ready";
  store.emailQueue.push({ imo: vessel.imo, name: vessel.name, email, queuedAt: new Date().toISOString() });
  console.log(`📧 [Email] ${vessel.name} için teklif emaili hazırlandı`);
}

function buildOfferEmail(vessel) {
  const owner = vessel.ownerInfo;
  const latestDetention = vessel.detentions[vessel.detentions.length - 1];
  const age = vessel.builtYear ? new Date().getFullYear() - vessel.builtYear : null;

  const to = owner?.email || null;
  const subject = `Recycling Offer — ${vessel.name} (IMO ${vessel.imo})`;
  const body = `Dear ${owner?.company || "Ship Owner"},

We are writing regarding your vessel ${vessel.name} (IMO: ${vessel.imo}${age ? `, built ${vessel.builtYear}` : ""}).

${latestDetention ? `We note that your vessel was recently detained at ${latestDetention.port} by ${latestDetention.authority} on ${latestDetention.detentionDate}.` : ""}

ShipScout has identified ${vessel.name} as a strong candidate for responsible recycling. We work with certified recycling yards and can offer:

• Competitive LDT-based pricing
• Full compliance with Hong Kong Convention
• Cash payment within 30 days of LOI signing
• Complete documentation support

We would be pleased to provide a formal recycling offer. Please reply to this email or contact us at recycling@shipscout.io.

Best regards,
ShipScout Recycling Desk
recycling@shipscout.io`;

  return { to, subject, body, generatedAt: new Date().toISOString() };
}

// ─── Maritime News Scraper ────────────────────────────────────────────────────

async function fetchMaritimeNews() {
  const articles = [];

  // TradeWinds RSS
  try {
    const { data } = await axios.get("https://www.tradewindsnews.com/rss/feed", {
      headers: { "User-Agent": "ShipScout/1.0" },
      timeout: 10000,
    });
    const $ = cheerio.load(data, { xmlMode: true });
    $("item").each((_, el) => {
      articles.push({
        title: $(el).find("title").text(),
        link: $(el).find("link").text(),
        date: $(el).find("pubDate").text(),
        source: "TradeWinds",
      });
    });
  } catch (err) {
    console.warn("[News] TradeWinds RSS hatası:", err.message);
  }

  // Splash247 RSS
  try {
    const { data } = await axios.get("https://splash247.com/feed/", {
      headers: { "User-Agent": "ShipScout/1.0" },
      timeout: 10000,
    });
    const $ = cheerio.load(data, { xmlMode: true });
    $("item").each((_, el) => {
      articles.push({
        title: $(el).find("title").text(),
        link: $(el).find("link").text(),
        date: $(el).find("pubDate").text(),
        source: "Splash247",
      });
    });
  } catch (err) {
    console.warn("[News] Splash247 RSS hatası:", err.message);
  }

  // İzlenen gemilerle eşleştir
  const store = loadStore();
  const hits = [];

  for (const article of articles) {
    for (const vessel of store.vessels) {
      if (!vessel.name) continue;
      const titleLower = article.title.toLowerCase();
      const nameLower = vessel.name.toLowerCase();
      if (titleLower.includes(nameLower) || (vessel.imo && titleLower.includes(vessel.imo))) {
        hits.push({ vessel: vessel.name, imo: vessel.imo, article });
        console.log(`📰 [News] "${vessel.name}" haberde geçiyor: ${article.title}`);
      }
    }
  }

  return { total: articles.length, hits };
}

// ─── Ana Döngü ────────────────────────────────────────────────────────────────

async function runWatcher(detainedVessels = []) {
  console.log("\n[Watcher] Kontrol başlıyor...");

  const detentionAlerts = await checkDetentions(detainedVessels);
  await processOwnerQueue();
  const news = await fetchMaritimeNews();

  const store = loadStore();
  console.log(`[Watcher] ${store.vessels.length} gemi izleniyor | ${detentionAlerts} yeni detention | ${news.hits.length} haber eşleşmesi | ${store.emailQueue.length} email hazır`);

  return {
    watched: store.vessels.length,
    detentionAlerts,
    newsHits: news.hits,
    emailsReady: store.emailQueue.length,
  };
}

module.exports = { watchVessel, getWatchedVessels, removeWatch, checkDetentions, runWatcher, fetchMaritimeNews, buildOfferEmail };
