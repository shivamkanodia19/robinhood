import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import YahooFinance from "yahoo-finance2";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";

const yahooFinance = new YahooFinance();

export async function POST() {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ reasons: [], queued: [] });
  }

  const sb = getSupabaseAdmin();
  const { data: rows, error } = await sb
    .from("stock_analyses")
    .select("id,ticker,analysis_date,stock_data")
    .eq("user_id", userId)
    .order("analysis_date", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Could not inspect analyses" }, { status: 500 });
  }

  let currentTnx = 4.2;
  try {
    const tnx = await yahooFinance.quote("^TNX");
    if (typeof tnx.regularMarketPrice === "number") {
      currentTnx = tnx.regularMarketPrice;
    }
  } catch {
    // fallback remains
  }

  const now = Date.now();
  const queued: Array<{ ticker: string; reason: "STALE_ANALYSIS" | "TREASURY_BREACH" }> = [];

  for (const row of rows ?? []) {
    const ageMs = now - new Date(row.analysis_date).getTime();
    if (ageMs > 3 * 24 * 60 * 60 * 1000) {
      queued.push({ ticker: row.ticker, reason: "STALE_ANALYSIS" });
      continue;
    }
    const prevTnx =
      typeof row.stock_data?.treasury_10y_pct === "number"
        ? row.stock_data.treasury_10y_pct
        : null;
    if (prevTnx !== null && Math.abs(currentTnx - prevTnx) >= 0.15) {
      queued.push({ ticker: row.ticker, reason: "TREASURY_BREACH" });
    }
  }

  return NextResponse.json({
    reasons: [...new Set(queued.map((x) => x.reason))],
    queued,
    queued_count: queued.length,
    treasury_10y_current: currentTnx,
  });
}
