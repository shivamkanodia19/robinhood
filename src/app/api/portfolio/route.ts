import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasSupabase } from "@/lib/env";
import { z } from "zod";

const positionSchema = z.object({
  ticker: z.string().min(1).max(16),
  shares: z.number().positive(),
  cost_basis: z.number().nonnegative(),
  entry_date: z.string(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ positions: [] });
  }
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("portfolio_positions")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ positions: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = positionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid position" }, { status: 400 });
  }
  const p = parsed.data;
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("portfolio_positions")
      .insert({
        user_id: session.user.id,
        ticker: p.ticker.toUpperCase(),
        shares: p.shares,
        cost_basis: p.cost_basis,
        entry_date: p.entry_date,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ position: data });
  } catch {
    return NextResponse.json({ error: "Could not save position" }, { status: 500 });
  }
}
