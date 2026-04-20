import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!hasSupabase()) {
    return NextResponse.json({ analyses: [] });
  }
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("stock_analyses")
    .select("id,ticker,analysis_date,final_recommendation,consensus_confidence")
    .eq("user_id", session.user.id)
    .order("analysis_date", { ascending: false })
    .limit(25);
  if (error) {
    return NextResponse.json({ error: "Could not fetch analyses" }, { status: 500 });
  }
  return NextResponse.json({ analyses: data ?? [] });
}
