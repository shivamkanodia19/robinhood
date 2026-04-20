import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { z } from "zod";

const bodySchema = z.object({
  analysis_id: z.string().uuid(),
  position_id: z.string().uuid().nullable().optional(),
  user_action: z.enum(["followed", "ignored", "opposite"]),
  action_date: z.string(),
  entry_price: z.number().positive(),
  current_price: z.number().positive(),
  notes: z.string().max(500).optional(),
});

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ outcomes: [] });
  }
  const url = new URL(req.url);
  const analysisId = url.searchParams.get("analysis_id");
  const sb = getSupabaseAdmin();
  const query = sb
    .from("recommendation_outcomes")
    .select("*, stock_analyses!inner(user_id)")
    .eq("stock_analyses.user_id", session.user.id)
    .order("action_date", { ascending: false });
  const { data, error } = analysisId
    ? await query.eq("analysis_id", analysisId)
    : await query;
  if (error) {
    return NextResponse.json({ error: "Could not load outcomes" }, { status: 500 });
  }
  return NextResponse.json({ outcomes: data ?? [] });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const p = parsed.data;
  const returnPct = ((p.current_price - p.entry_price) / p.entry_price) * 100;

  const sb = getSupabaseAdmin();
  const { data: analysisRow, error: analysisError } = await sb
    .from("stock_analyses")
    .select("id,user_id")
    .eq("id", p.analysis_id)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (analysisError || !analysisRow) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }

  const { data, error } = await sb
    .from("recommendation_outcomes")
    .insert({
      analysis_id: p.analysis_id,
      position_id: p.position_id ?? null,
      user_action: p.user_action,
      action_date: p.action_date,
      entry_price: p.entry_price,
      current_price: p.current_price,
      return_pct: Number(returnPct.toFixed(3)),
      notes: p.notes ?? null,
    })
    .select("id,analysis_id,user_action,return_pct")
    .single();
  if (error) {
    return NextResponse.json({ error: "Could not save outcome" }, { status: 500 });
  }
  return NextResponse.json({
    outcome_id: data.id,
    analysis_id: data.analysis_id,
    user_action: data.user_action,
    return_pct: data.return_pct,
  });
}
