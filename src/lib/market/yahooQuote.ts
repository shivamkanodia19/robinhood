import YahooFinance from "yahoo-finance2";

const yahooFinance = new YahooFinance();

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

export type YahooQuoteSnapshot = {
  price: number | null;
  regularMarketChangePercent: number | null;
  currency: string | null;
  as_of: string;
};

/**
 * Single-symbol snapshot (same logic as batch /api/quotes).
 * Used for simulated market fills on sells.
 */
export async function getYahooQuoteSnapshot(ticker: string): Promise<YahooQuoteSnapshot> {
  const sym = ticker.trim().toUpperCase();
  try {
    const q = await yahooFinance.quote(sym);
    const price =
      num(q.postMarketPrice) ?? num(q.regularMarketPrice) ?? num(q.preMarketPrice);
    const chg = num(q.regularMarketChangePercent);
    const rt = q.regularMarketTime as unknown;
    let as_of = new Date().toISOString();
    if (typeof rt === "number") {
      as_of = new Date(rt > 1e12 ? rt : rt * 1000).toISOString();
    } else if (rt instanceof Date) {
      as_of = rt.toISOString();
    }
    const cur =
      typeof q.currency === "string"
        ? q.currency
        : q.financialCurrency != null
          ? String(q.financialCurrency)
          : "USD";
    return {
      price,
      regularMarketChangePercent: chg,
      currency: cur,
      as_of,
    };
  } catch {
    return {
      price: null,
      regularMarketChangePercent: null,
      currency: null,
      as_of: new Date().toISOString(),
    };
  }
}
