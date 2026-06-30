// Fallback static prices — authoritative values live in DB (scrap_prices table).
// These are kept in sync with the last seed (GMS Week 3 2026, tanker headline).
export const SCRAP_MARKETS = [
  { market: "Alang",      country: "India",      emoji: "🇮🇳", price: 400 },
  { market: "Chittagong", country: "Bangladesh", emoji: "🇧🇩", price: 420 },
  { market: "Gadani",     country: "Pakistan",   emoji: "🇵🇰", price: 410 },
  { market: "Aliağa",     country: "Turkey",     emoji: "🇹🇷", price: 280 },
] as const;

export type ScrapMarket = typeof SCRAP_MARKETS[number];
