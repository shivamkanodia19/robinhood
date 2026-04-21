import { NextResponse } from "next/server";
import { z } from "zod";
import { getYahooQuoteSnapshot } from "@/lib/market/yahooQuote";

const bodySchema = z.object({
  tickers: z.array(z.string().min(1).max(16)).max(24),
});

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
      const snap = await getYahooQuoteSnapshot(ticker);
      quotes[ticker] = {
        price: snap.price,
        regularMarketChangePercent: snap.regularMarketChangePercent,
        currency: snap.currency,
        as_of: snap.as_of,
      };
    }),
  );

  return NextResponse.json({ quotes, source: "yahoo-finance2" });
}
