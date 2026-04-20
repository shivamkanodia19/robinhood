import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { computeConvictionChange, toInvestingProfile } from "@/lib/phase2";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";

export async function GET(
  _req: Request,
  context: { params: Promise<{ ticker: string }> },
) {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({
      ticker: "UNKNOWN",
      conviction_change: {
        direction: "STABLE",
        reason: "Database not configured.",
        delta_score: 0,
      },
    });
  }

  const { ticker } = await context.params;
  const sb = getSupabaseAdmin();

  const { data: profileRow } = await sb
    .from("users")
    .select("investing_profile")
    .eq("id", userId)
    .maybeSingle();
  const profile = toInvestingProfile(profileRow?.investing_profile);

  const { data: rows, error } = await sb
    .from("stock_analyses")
    .select("id,analysis_date,final_recommendation,consensus_confidence,stock_data")
    .eq("user_id", userId)
    .eq("ticker", ticker.toUpperCase())
    .order("analysis_date", { ascending: false })
    .limit(2);

  if (error || !rows || rows.length === 0) {
    return NextResponse.json({ error: "No analysis found" }, { status: 404 });
  }

  const latest = rows[0];
  const previous = rows[1] ?? null;
  const latestScore =
    typeof latest.stock_data?.weighted_consensus?.weighted_score === "number"
      ? latest.stock_data.weighted_consensus.weighted_score
      : 0;
  const previousScore =
    previous && typeof previous.stock_data?.weighted_consensus?.weighted_score === "number"
      ? previous.stock_data.weighted_consensus.weighted_score
      : null;

  const conviction = computeConvictionChange(latestScore, previousScore);
  return NextResponse.json({
    ticker: ticker.toUpperCase(),
    profile,
    latest_analysis_id: latest.id,
    conviction_change: conviction,
    latest: {
      recommendation: latest.final_recommendation,
      weighted_score: latestScore,
      consensus_confidence: latest.consensus_confidence,
      analysis_date: latest.analysis_date,
    },
    previous: previous
      ? {
          recommendation: previous.final_recommendation,
          weighted_score: previousScore,
          consensus_confidence: previous.consensus_confidence,
          analysis_date: previous.analysis_date,
        }
      : null,
  });
}
