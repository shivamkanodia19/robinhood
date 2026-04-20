import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";

export async function GET() {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ analyses: [] });
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("stock_analyses")
    .select("id,ticker,analysis_date,final_recommendation,consensus_confidence")
    .eq("user_id", userId)
    .order("analysis_date", { ascending: false })
    .limit(25);
  if (error) {
    return NextResponse.json({ error: "Could not fetch analyses" }, { status: 500 });
  }
  return NextResponse.json({ analyses: data ?? [] });
}
