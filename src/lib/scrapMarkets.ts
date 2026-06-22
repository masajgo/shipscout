export const SCRAP_MARKETS = [
  { market: "Alang",      country: "India",      emoji: "🇮🇳", price: 510 },
  { market: "Chittagong", country: "Bangladesh", emoji: "🇧🇩", price: 560 },
  { market: "Gadani",     country: "Pakistan",   emoji: "🇵🇰", price: 500 },
  { market: "Aliağa",     country: "Turkey",     emoji: "🇹🇷", price: 420 },
] as const;

export type ScrapMarket = typeof SCRAP_MARKETS[number];
