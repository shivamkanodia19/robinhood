import type { AgentKind, StockMetricsPayload } from "@/lib/metrics/types";
import type { AgentVote } from "@/lib/consensus";

export type InvestingProfile =
  | "value"
  | "growth"
  | "momentum"
  | "income"
  | "balanced";

type WeightMap = Record<AgentKind, number>;

const PROFILE_WEIGHTS: Record<InvestingProfile, WeightMap> = {
  value: {
    value: 0.35,
    momentum: 0.05,
    quality: 0.25,
    contrarian: 0.1,
    macro: 0.1,
    lowvol: 0.15,
  },
  growth: {
    value: 0.1,
    momentum: 0.25,
    quality: 0.3,
    contrarian: 0.1,
    macro: 0.15,
    lowvol: 0.1,
  },
  momentum: {
    value: 0.05,
    momentum: 0.4,
    quality: 0.2,
    contrarian: 0.1,
    macro: 0.15,
    lowvol: 0.1,
  },
  income: {
    value: 0.25,
    momentum: 0.05,
    quality: 0.1,
    contrarian: 0.05,
    macro: 0.2,
    lowvol: 0.35,
  },
  balanced: {
    value: 0.166,
    momentum: 0.166,
    quality: 0.166,
    contrarian: 0.166,
    macro: 0.166,
    lowvol: 0.17,
  },
};

const REC_SCORE: Record<AgentVote["recommendation"], number> = {
  BUY: 1,
  HOLD: 0,
  SELL: -1,
};

export interface WeightedConsensus {
  profile: InvestingProfile;
  weighted_score: number;
  final_recommendation: "BUY" | "HOLD" | "SELL";
  consensus_confidence: number;
  weighted_support_count: number;
  weights_used: WeightMap;
  contrarian_footnote: string;
  /** Points subtracted from consensus_confidence due to capped agent votes (0..20) */
  data_quality_penalty: number;
  /** Human-readable explanation of penalty and any safety downgrade; "" when none applied */
  data_quality_note: string;
}

export function getWeights(profile: InvestingProfile): WeightMap {
  return PROFILE_WEIGHTS[profile];
}

export function toInvestingProfile(value: string | null | undefined): InvestingProfile {
  if (
    value === "value" ||
    value === "growth" ||
    value === "momentum" ||
    value === "income" ||
    value === "balanced"
  ) {
    return value;
  }
  return "balanced";
}

export function buildWeightedConsensus(
  votes: AgentVote[],
  profile: InvestingProfile,
  metrics?: StockMetricsPayload,
): WeightedConsensus {
  const weights = getWeights(profile);
  const active = votes.filter((v) => !v.failed);
  const weightSum = active.reduce((s, v) => s + weights[v.agent], 0) || 1;

  let score = 0;
  let confidenceAccumulator = 0;
  let weightedSupportCount = 0;

  for (const vote of active) {
    const w = weights[vote.agent] / weightSum;
    score += REC_SCORE[vote.recommendation] * w;
    confidenceAccumulator += vote.confidence * w;
    if (vote.recommendation !== "SELL") weightedSupportCount += w;
  }

  let final: WeightedConsensus["final_recommendation"] =
    score > 0.2 ? "BUY" : score < -0.2 ? "SELL" : "HOLD";

  const weightedConfidence = Math.round(confidenceAccumulator);

  // Phase 5: data-quality penalty + safety downgrade (mirrors buildConsensus).
  const cappedCount = votes.filter(
    (v) => !v.failed && v.capped_reason,
  ).length;
  const data_quality_penalty =
    cappedCount >= 1 ? Math.min(20, 5 * cappedCount) : 0;
  const adjustedConfidence = Math.max(
    0,
    weightedConfidence - data_quality_penalty,
  );

  const hardFundamentalFlags = (metrics?.metric_flags ?? []).filter(
    (f) => f.severity === "hard" && f.family === "fundamental",
  );

  let data_quality_note = "";
  if (data_quality_penalty > 0) {
    data_quality_note = `${cappedCount} agent${cappedCount === 1 ? "" : "s"} had confidence capped by grounding or flag checks; consensus confidence reduced by ${data_quality_penalty}.`;
  }
  if (
    hardFundamentalFlags.length > 0 &&
    final === "BUY" &&
    adjustedConfidence < 60
  ) {
    final = "HOLD";
    const names = hardFundamentalFlags.map((f) => f.metric).join(", ");
    data_quality_note =
      (data_quality_note ? data_quality_note + " " : "") +
      `Downgraded BUY → HOLD: adjustedConfidence ${adjustedConfidence} is below 60 and fundamentals have hard flags (${names}).`;
  }

  return {
    profile,
    weighted_score: Number(score.toFixed(3)),
    final_recommendation: final,
    consensus_confidence: adjustedConfidence,
    weighted_support_count: Number(weightedSupportCount.toFixed(3)),
    weights_used: weights,
    contrarian_footnote:
      active.length < votes.length
        ? `Weights renormalized over ${active.length} agents that returned a model vote.`
        : "Contrarian perspective is always displayed even when profile weights deprioritize it.",
    data_quality_penalty,
    data_quality_note,
  };
}

export interface ConvictionChange {
  direction: "UP" | "DOWN" | "STABLE";
  reason: string;
  delta_score: number;
}

export function computeConvictionChange(
  currentScore: number,
  previousScore: number | null,
): ConvictionChange {
  if (previousScore === null) {
    return {
      direction: "STABLE",
      reason: "No prior analysis for this ticker yet.",
      delta_score: 0,
    };
  }

  const delta = Number((currentScore - previousScore).toFixed(3));
  if (delta > 0.08) {
    return {
      direction: "UP",
      reason: "Profile-weighted score increased versus prior analysis.",
      delta_score: delta,
    };
  }
  if (delta < -0.08) {
    return {
      direction: "DOWN",
      reason: "Profile-weighted score weakened versus prior analysis.",
      delta_score: delta,
    };
  }
  return {
    direction: "STABLE",
    reason: "Signal change is within noise band.",
    delta_score: delta,
  };
}
