const axios = require("axios");
const cheerio = require("cheerio");

async function fetchParisMOU() {
  const vessels = [];
  try {
    console.log("[Paris MOU] Veri çekiliyor...");
    const response = await axios.get(
      "http://parismou.org/Inspection-Database/current-detentions",
      {
        headers: { "User-Agent": "ShipScout/1.0 (+https://shipscout.io; maritime research)" },
        timeout: 15000,
      }
    );
    const $ = cheerio.load(response.data);
    $("table tbody tr").each((i, row) => {
      const cells = $(row).find("td");
      if (cells.length < 5) return;
      const vessel = {
        imo: normalizeIMO($(cells[1]).text().trim()),
        name: $(cells[0]).text().trim(),
        flag: $(cells[2]).text().trim(),
        shipType: $(cells[3]).text().trim(),
        builtYear: parseYear($(cells[4]).text().trim()),
        detentionDate: parseDate($(cells[5]).text().trim()),
        port: $(cells[6]).text().trim(),
        authority: "Paris MOU",
        deficiencies: [],
        source: "http://parismou.org/Inspection-Database/current-detentions",
      };
      vessel.scrapScore = calculateScrapScore(vessel);
      vessels.push(vessel);
    });
    console.log(`[Paris MOU] ${vessels.length} gemi bulundu`);
  } catch (err) {
    console.error("[Paris MOU] Hata:", err.message);
    const fallback = await fetchFromOpenSanctions("paris_mou_detention");
    vessels.push(...fallback);
  }
  return vessels;
}

async function fetchTokyoMOU() {
  console.log("[Tokyo MOU] OpenSanctions üzerinden veri çekiliyor...");
  return fetchFromOpenSanctions("tokyo_mou_detention");
}

async function fetchFromOpenSanctions(dataset) {
  const vessels = [];
  try {
    const csvUrl = `https://data.opensanctions.org/datasets/latest/${dataset}/targets.simple.csv`;
    const response = await axios.get(csvUrl, {
      headers: { "User-Agent": "ShipScout/1.0 (+https://shipscout.io; maritime research)" },
      timeout: 30000,
      responseType: "text",
    });
    const lines = response.data.split("\n");
    const headers = parseCSVLine(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, idx) => { row[h] = values[idx] || ""; });
      if (!row.schema || row.schema !== "Vessel") continue;
      const vessel = {
        imo: normalizeIMO(row.identifiers || ""),
        name: row.name || "",
        flag: row.countries || "",
        shipType: "",
        builtYear: null,
        detentionDate: new Date().toISOString().split("T")[0],
        port: "",
        authority: dataset.includes("tokyo") ? "Tokyo MOU" : "Paris MOU",
        deficiencies: (row.sanctions || "").split(" - inactive")[0].split(/\d{5} - /).filter(Boolean),
        source: `https://www.opensanctions.org/datasets/${dataset}/`,
      };
      vessel.scrapScore = calculateScrapScore(vessel);
      if (vessel.name) vessels.push(vessel);
    }
    console.log(`[${dataset}] ${vessels.length} gemi bulundu`);
  } catch (err) {
    console.error(`[${dataset}] Hata:`, err.message);
  }
  return vessels;
}

async function fetchUSCG() {
  const vessels = [];
  try {
    console.log("[USCG] Veri çekiliyor...");
    const response = await axios.get(
      "https://www.dco.uscg.mil/Our-Organization/Assistant-Commandant-for-Prevention-Policy-CG-5P/Inspections-Compliance-CG-5PC-/Office-of-Commercial-Vessel-Compliance/Port-State-Control/",
      { headers: { "User-Agent": "ShipScout/1.0" }, timeout: 15000 }
    );
    const $ = cheerio.load(response.data);
    $("table tr").each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find("td");
      if (cells.length < 4) return;
      const vessel = {
        imo: normalizeIMO($(cells[2]).text().trim()),
        name: $(cells[0]).text().trim(),
        flag: $(cells[1]).text().trim(),
        shipType: $(cells[3]).text().trim(),
        builtYear: null,
        detentionDate: new Date().toISOString().split("T")[0],
        port: $(cells[4]).text().trim(),
        authority: "USCG",
        deficiencies: [],
        source: "https://www.dco.uscg.mil/psc/",
      };
      vessel.scrapScore = calculateScrapScore(vessel);
      if (vessel.name && vessel.imo) vessels.push(vessel);
    });
    console.log(`[USCG] ${vessels.length} gemi bulundu`);
  } catch (err) {
    console.error("[USCG] Hata:", err.message);
  }
  return vessels;
}

function calculateScrapScore(vessel) {
  let score = 0;
  if (vessel.builtYear) {
    const age = new Date().getFullYear() - vessel.builtYear;
    if (age >= 30) score += 35;
    else if (age >= 25) score += 28;
    else if (age >= 20) score += 20;
    else if (age >= 15) score += 10;
    else if (age >= 10) score += 3;
  }
  if (vessel.authority) score += 25;
  const defCount = vessel.deficiencies.length;
  if (defCount >= 10) score += 20;
  else if (defCount >= 5) score += 12;
  else if (defCount >= 2) score += 6;
  else if (defCount >= 1) score += 2;
  const highValueTypes = ["bulk carrier", "tanker", "general cargo", "container"];
  if (highValueTypes.some((t) => (vessel.shipType || "").toLowerCase().includes(t))) score += 10;
  const highRiskFlags = ["comoros", "palau", "togo", "mongolia", "cambodia", "sierra leone", "tanzania", "gabon", "north korea", "belize", "moldova"];
  if (highRiskFlags.some((f) => (vessel.flag || "").toLowerCase().includes(f))) score += 10;
  return Math.min(100, score);
}

async function fetchAllDistressedVessels(options = {}) {
  const { minScore = 50 } = options;
  console.log("🚢 Distressed vessel verisi çekiliyor...\n");
  const [parisVessels, tokyoVessels, uscgVessels] = await Promise.allSettled([
    fetchParisMOU(), fetchTokyoMOU(), fetchUSCG(),
  ]);
  const allVessels = [
    ...(parisVessels.status === "fulfilled" ? parisVessels.value : []),
    ...(tokyoVessels.status === "fulfilled" ? tokyoVessels.value : []),
    ...(uscgVessels.status === "fulfilled" ? uscgVessels.value : []),
  ];
  const uniqueMap = new Map();
  for (const v of allVessels) {
    if (!v.imo) continue;
    if (uniqueMap.has(v.imo)) {
      const existing = uniqueMap.get(v.imo);
      existing.authority = `${existing.authority} + ${v.authority}`;
      existing.scrapScore = Math.min(100, Math.max(existing.scrapScore, v.scrapScore) + 5);
    } else {
      uniqueMap.set(v.imo, v);
    }
  }
  const results = Array.from(uniqueMap.values())
    .filter((v) => v.scrapScore >= minScore)
    .sort((a, b) => b.scrapScore - a.scrapScore);
  console.log(`\n✅ Toplam ${results.length} yüksek riskli gemi bulundu (score ≥ ${minScore})`);
  return results;
}

function normalizeIMO(raw) {
  if (!raw) return null;
  const match = raw.replace(/\s/g, "").match(/\d{7}/);
  return match ? match[0] : null;
}
function parseYear(raw) {
  if (!raw) return null;
  const match = raw.match(/\b(19|20)\d{2}\b/);
  return match ? parseInt(match[0], 10) : null;
}
function parseDate(raw) {
  if (!raw) return null;
  try { return new Date(raw).toISOString().split("T")[0]; } catch { return null; }
}
function extractProperty(row, key) {
  const value = row[key] || row[`properties.${key}`] || "";
  return value.split("|")[0].trim();
}
function extractList(row, key) {
  const value = row[key] || row[`properties.${key}`] || "";
  return value.split("|").map((s) => s.trim()).filter(Boolean);
}
function parseCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === "," && !inQuotes) { result.push(current); current = ""; }
    else current += char;
  }
  result.push(current);
  return result;
}

module.exports = { fetchAllDistressedVessels, fetchParisMOU, fetchTokyoMOU, fetchUSCG, calculateScrapScore };
