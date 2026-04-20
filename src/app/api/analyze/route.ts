import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { computeStockMetrics } from "@/lib/metrics/calculator";
import { buildConsensus } from "@/lib/consensus";
import { runAllAgents } from "@/lib/agents/runAgents";
import { ruleBasedVotes } from "@/lib/agents/ruleFallback";
import { hasAnthropic, hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWeightedConsensus,
  computeConvictionChange,
  toInvestingProfile,
} from "@/lib/phase2";
import { z } from "zod";

const bodySchema = z.object({
  ticker: z.string().min(1).max(16),
  mode: z.enum(["decision", "analyst"]).optional(),
  skipCache: z.boolean().optional(),
  profile: z
    .enum(["value", "growth", "momentum", "income", "balanced"])
    .optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid ticker" }, { status: 400 });
  }

  const { ticker, mode, skipCache, profile } = parsed.data;

  let metrics;
  try {
    metrics = await computeStockMetrics(ticker, { skipCache: skipCache ?? false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Market data unavailable";
    return NextResponse.json(
      { error: "We could not load market data for that symbol. Try another ticker." },
      { status: 422 },
    );
  }

  // Cost + consistency guardrail: force Haiku-only for now.
  const requestedModel = process.env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-20241022";
  const model = requestedModel.includes("haiku")
    ? requestedModel
    : "claude-3-5-haiku-20241022";
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

  const votes = hasAnthropic()
    ? await runAllAgents(apiKey, model, metrics)
    : ruleBasedVotes(metrics);

  const consensus = buildConsensus(votes);
  let resolvedProfile = toInvestingProfile(profile);
  let previousWeightedScore: number | null = null;

  let analysisId: string | null = null;
  if (hasSupabase()) {
    try {
      const sb = getSupabaseAdmin();
      const { data: userRow } = await sb
        .from("users")
        .select("investing_profile")
        .eq("id", session.user.id)
        .maybeSingle();
      resolvedProfile = toInvestingProfile(
        profile ?? userRow?.investing_profile ?? "balanced",
      );

      const { data: previousAnalysis } = await sb
        .from("stock_analyses")
        .select("stock_data")
        .eq("user_id", session.user.id)
        .eq("ticker", metrics.ticker)
        .order("analysis_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      previousWeightedScore =
        typeof previousAnalysis?.stock_data?.weighted_consensus?.weighted_score ===
        "number"
          ? previousAnalysis.stock_data.weighted_consensus.weighted_score
          : null;

      if (profile && profile !== userRow?.investing_profile) {
        await sb
          .from("users")
          .update({ investing_profile: profile })
          .eq("id", session.user.id);
      }
    } catch {
      resolvedProfile = toInvestingProfile(profile);
    }
  }

  const weighted = buildWeightedConsensus(votes, resolvedProfile);
  const conviction = computeConvictionChange(
    weighted.weighted_score,
    previousWeightedScore,
  );

  if (hasSupabase()) {
    try {
      const sb = getSupabaseAdmin();
      const { data: row, error } = await sb
        .from("stock_analyses")
        .insert({
          user_id: session.user.id,
          ticker: metrics.ticker,
          final_recommendation: consensus.final_recommendation,
          consensus_confidence: consensus.consensus_confidence,
          final_thesis: consensus.final_thesis,
          key_disagreement: consensus.key_disagreement,
          stock_data: {
            ...metrics,
            weighted_consensus: weighted,
            conviction_change: conviction,
          } as unknown as Record<string, unknown>,
        })
        .select("id")
        .single();
      if (!error && row?.id) {
        analysisId = row.id;
        const rows = votes.map((v) => ({
          analysis_id: row.id,
          agent_type: v.agent,
          recommendation: v.recommendation,
          confidence: v.confidence,
          thesis: v.thesis,
          key_metric: v.key_metric,
          key_risk: v.key_risk,
          metrics: metrics as unknown as Record<string, unknown>,
        }));
        await sb.from("agent_responses").insert(rows);
      }
    } catch {
      // persistence optional; response still returned
    }
  }

  return NextResponse.json({
    mode: mode ?? "decision",
    analysis_id: analysisId,
    metrics,
    consensus,
    weighted_consensus: weighted,
    conviction_change: conviction,
    profile: resolvedProfile,
    degraded: !hasAnthropic(),
    degraded_message: hasAnthropic()
      ? undefined
      : "Anthropic API key not set — showing deterministic rule-based council for development.",
  });
}
