import { NextResponse } from "next/server";
import { computeStockMetrics } from "@/lib/metrics/calculator";
import { buildConsensus } from "@/lib/consensus";
import { runAllAgentsWithDiagnostics } from "@/lib/agents/runAgents";
import { ruleBasedVotes } from "@/lib/agents/ruleFallback";
import { hasAnthropic, hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildWeightedConsensus,
  computeConvictionChange,
  toInvestingProfile,
} from "@/lib/phase2";
import { z } from "zod";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";

const bodySchema = z.object({
  ticker: z.string().min(1).max(16),
  mode: z.enum(["decision", "analyst"]).optional(),
  skipCache: z.boolean().optional(),
  profile: z
    .enum(["value", "growth", "momentum", "income", "balanced"])
    .optional(),
});

export async function POST(req: Request) {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);

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

  // Haiku 4.5 IDs: https://platform.claude.com/docs/en/about-claude/models/overview
  // (Do not use claude-4-5-haiku-* — those strings are not valid API model IDs.)
  const requestedModel = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";
  const modelCandidates = Array.from(
    new Set([
      requestedModel,
      "claude-haiku-4-5",
      "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-latest",
      "claude-3-5-haiku-20241022",
    ]),
  );
  const apiKey = process.env.ANTHROPIC_API_KEY ?? "";

  const modelDiagnostics = {
    used_rule_fallback: false,
    attempted_models: [] as string[],
    selected_model: null as string | null,
    failed_agents: [] as string[],
    errors: [] as string[],
  };
  let votes = ruleBasedVotes(metrics);
  if (hasAnthropic()) {
    for (const candidate of modelCandidates) {
      modelDiagnostics.attempted_models.push(candidate);
      const llm = await runAllAgentsWithDiagnostics(apiKey, candidate, metrics);
      const allFailed = llm.votes.every((v) => v.confidence === 0);
      modelDiagnostics.failed_agents = llm.failedAgents;
      modelDiagnostics.errors = llm.errors;

      if (!allFailed) {
        votes = llm.votes;
        modelDiagnostics.selected_model = candidate;
        break;
      }
      // Try next snapshot/alias until one works or the list is exhausted.
    }

    if (!modelDiagnostics.selected_model) {
      modelDiagnostics.used_rule_fallback = true;
      votes = ruleBasedVotes(metrics);
    }
  } else {
    modelDiagnostics.used_rule_fallback = true;
    modelDiagnostics.errors = ["No ANTHROPIC_API_KEY configured."];
  }

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
        .eq("id", userId)
        .maybeSingle();
      resolvedProfile = toInvestingProfile(
        profile ?? userRow?.investing_profile ?? "balanced",
      );

      const { data: previousAnalysis } = await sb
        .from("stock_analyses")
        .select("stock_data")
        .eq("user_id", userId)
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
          .eq("id", userId);
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
          user_id: userId,
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
    degraded: !hasAnthropic() || modelDiagnostics.used_rule_fallback,
    degraded_message: hasAnthropic()
      ? modelDiagnostics.used_rule_fallback
        ? "Model calls failed in this run. Showing deterministic rule-based fallback."
        : modelDiagnostics.errors.length
          ? `Some agents failed: ${modelDiagnostics.failed_agents.join(", ")}`
          : undefined
      : "Anthropic API key not set — showing deterministic rule-based council for development.",
    diagnostics: modelDiagnostics,
  });
}
