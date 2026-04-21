import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasSupabase } from "@/lib/env";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";
import { getYahooQuoteSnapshot } from "@/lib/market/yahooQuote";
import { z } from "zod";

const idSchema = z.string().uuid();

const sellBodySchema = z.object({
  shares: z.number().positive(),
});

const EPS = 1e-8;

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Simulated market sell: fills at Yahoo last/extended price (same source as portfolio quotes).
 * Partial sell keeps average cost / share on the remaining lot (simplified cost basis).
 * Full sell deletes the row.
 */
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await context.params;
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid position id" }, { status: 400 });
  }
  const id = idParsed.data;

  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = sellBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body: need positive shares" }, { status: 400 });
  }
  const sharesToSell = parsed.data.shares;

  try {
    const sb = getSupabaseAdmin();
    const { data: pos, error: selErr } = await sb
      .from("portfolio_positions")
      .select("id,ticker,shares,cost_basis,entry_date")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!pos) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }

    const held = toNum(pos.shares);
    if (sharesToSell > held + EPS) {
      return NextResponse.json(
        { error: "Cannot sell more shares than you hold", detail: `You have ${held} shares.` },
        { status: 400 },
      );
    }

    const ticker = String(pos.ticker).toUpperCase();
    const snap = await getYahooQuoteSnapshot(ticker);
    const execPrice = snap.price;
    if (execPrice === null || execPrice <= 0) {
      return NextResponse.json(
        {
          error: "No live price",
          detail: "Could not load a usable Yahoo quote for this symbol. Try again.",
        },
        { status: 503 },
      );
    }

    const avgCost = toNum(pos.cost_basis);
    const costOfSlice = sharesToSell * avgCost;
    const proceeds = sharesToSell * execPrice;
    const realizedPnl = proceeds - costOfSlice;
    const remaining = held - sharesToSell;

    if (remaining <= EPS) {
      const { error: delErr } = await sb.from("portfolio_positions").delete().eq("id", id).eq("user_id", userId);
      if (delErr) throw delErr;
      return NextResponse.json({
        closed: true,
        ticker,
        shares_sold: sharesToSell,
        execution_price: execPrice,
        proceeds,
        cost_basis_sold: costOfSlice,
        realized_pnl: realizedPnl,
        quote_as_of: snap.as_of,
        currency: snap.currency ?? "USD",
      });
    }

    const newShares = held - sharesToSell;
    const { data: updated, error: upErr } = await sb
      .from("portfolio_positions")
      .update({ shares: newShares })
      .eq("id", id)
      .eq("user_id", userId)
      .select()
      .single();
    if (upErr) throw upErr;

    return NextResponse.json({
      closed: false,
      position: updated,
      ticker,
      shares_sold: sharesToSell,
      shares_remaining: newShares,
      execution_price: execPrice,
      proceeds,
      cost_basis_sold: costOfSlice,
      realized_pnl: realizedPnl,
      quote_as_of: snap.as_of,
      currency: snap.currency ?? "USD",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sell failed";
    return NextResponse.json({ error: "Sell failed", detail: message }, { status: 500 });
  }
}
