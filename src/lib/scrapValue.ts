// Turns a vessel into the cheque a cash buyer would actually write: LDT × the
// yard's $/LDT for that hull type. scrap_prices only quotes bulker/tanker/container,
// so every non-tanker, non-boxship cargo hull is priced on the bulker line.
export type PriceCategory = "bulker" | "tanker" | "container";

export function priceCategory(type: string | null, typeSpecific: string | null): PriceCategory {
  const s = `${typeSpecific ?? ""} ${type ?? ""}`.toLowerCase();
  if (s.includes("container")) return "container";
  if (s.includes("tanker")) return "tanker";
  return "bulker";
}

export type YardPrices = Record<string, { country: string; prices: Record<string, number> }>;

// Null when LDT is unknown — an estimated cheque off an estimated LDT is a number
// a buyer would act on, so we show nothing rather than a guess.
export function estimateCheque(
  ldt: number | null,
  category: PriceCategory,
  yard: string,
  yards: YardPrices,
): number | null {
  if (!ldt || ldt <= 0) return null;
  const price = yards[yard]?.prices[category];
  if (!price) return null;
  return Math.round(ldt * price);
}

export function formatUsd(v: number): string {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(v >= 10_000_000 ? 1 : 2)}M`;
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`;
  return `$${v}`;
}
