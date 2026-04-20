import { NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { z } from "zod";

const yahooFinance = new YahooFinance();

const bodySchema = z.object({
  tickers: z.array(z.string().min(1).max(16)).max(24),
});

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Batch Yahoo quotes for portfolio cards (unofficial API — same source as metrics).
 */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid tickers" }, { status: 400 });
  }

  const tickers = parsed.data.tickers.map((t) => t.trim().toUpperCase());
  const unique = Array.from(new Set(tickers));

  const quotes: Record<
    string,
    { price: number | null; regularMarketChangePercent: number | null; currency: string | null; as_of: string }
  > = {};

  await Promise.all(
    unique.map(async (ticker) => {
      try {
        const q = await yahooFinance.quote(ticker);
        const price =
          num(q.postMarketPrice) ??
          num(q.regularMarketPrice) ??
          num(q.preMarketPrice);
        const chg = num(q.regularMarketChangePercent);
        const rt = q.regularMarketTime as unknown;
        let as_of = new Date().toISOString();
        if (typeof rt === "number") {
          as_of = new Date(rt > 1e12 ? rt : rt * 1000).toISOString();
        } else if (rt instanceof Date) {
          as_of = rt.toISOString();
        }
        const cur =
          typeof q.currency === "string" ? q.currency : q.financialCurrency != null ? String(q.financialCurrency) : "USD";
        quotes[ticker] = {
          price,
          regularMarketChangePercent: chg,
          currency: cur,
          as_of,
        };
      } catch {
        quotes[ticker] = {
          price: null,
          regularMarketChangePercent: null,
          currency: null,
          as_of: new Date().toISOString(),
        };
      }
    }),
  );

  return NextResponse.json({ quotes, source: "yahoo-finance2" });
}
