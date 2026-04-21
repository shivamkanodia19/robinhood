import type { AgentKind, StockMetricsPayload } from "@/lib/metrics/types";

export interface AgentVote {
  agent: AgentKind;
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
  thesis: string;
  key_metric: string;
  key_risk: string;
  /** Model or parse failure — excluded from vote tallies and confidence averages */
  failed?: boolean;
  /** Set by groundVote: true if at least one numeric claim matched the validated snapshot */
  grounded?: boolean;
  /** Human-readable reason confidence was capped/reduced during grounding */
  capped_reason?: string;
}

export interface ConsensusResult {
  final_recommendation: "BUY" | "HOLD" | "SELL" | "MIXED";
  consensus_confidence: number;
  final_thesis: string;
  key_disagreement: string;
  next_checkpoint: string;
  vote_breakdown: { buy: number; hold: number; sell: number };
  agents: AgentVote[];
  /** Points subtracted from consensus_confidence due to capped agent votes (0..20) */
  data_quality_penalty: number;
  /** Human-readable explanation of penalty and any safety downgrade; "" when none applied */
  data_quality_note: string;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function buildConsensus(
  votes: AgentVote[],
  metrics?: StockMetricsPayload,
): ConsensusResult {
  const active = votes.filter((v) => !v.failed);
  const failedCount = votes.length - active.length;

  const counts = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const v of active) {
    counts[v.recommendation]++;
  }

  const maxCount = Math.max(counts.BUY, counts.HOLD, counts.SELL);
  const leaders = (["BUY", "HOLD", "SELL"] as const).filter(
    (r) => counts[r] === maxCount,
  );

  let final_recommendation: ConsensusResult["final_recommendation"] =
    active.length === 0
      ? "MIXED"
      : leaders.length !== 1
        ? "MIXED"
        : leaders[0];

  const dominant =
    final_recommendation === "MIXED" ? null : final_recommendation;

  const aligned = dominant
    ? active.filter((v) => v.recommendation === dominant)
    : active;
  const agreementCount = dominant ? aligned.length : 0;

  let agreementBonus = 0;
  const n = active.length;
  if (n >= 6 && dominant) {
    if (agreementCount === 6) agreementBonus = 15;
    else if (agreementCount === 5) agreementBonus = 8;
    else if (agreementCount === 4) agreementBonus = 3;
  }

  const baseConf = avg(active.map((v) => v.confidence));
  const consensus_confidence = Math.min(
    100,
    Math.round(baseConf + agreementBonus),
  );

  const dissenters = dominant
    ? active.filter((v) => v.recommendation !== dominant)
    : active;
  const key_disagreement =
    final_recommendation === "MIXED"
      ? `No single majority: BUY ${counts.BUY}, HOLD ${counts.HOLD}, SELL ${counts.SELL}.`
      : dissenters.length === 0
        ? "Agents largely agree on direction; differences are mostly confidence."
        : `Dissent: ${dissenters
            .map((d) => `${d.agent} → ${d.recommendation} (${d.key_metric})`)
            .join("; ")}`;

  const avail = `${active.length}/${votes.length}`;
  const failNote =
    failedCount > 0 ? ` (${failedCount} agent${failedCount > 1 ? "s" : ""} unavailable)` : "";

  const final_thesis =
    active.length === 0
      ? "No agent responses available for this run — try again shortly."
      : final_recommendation === "MIXED"
        ? `Mixed signals (${avail} responding${failNote}): BUY ${counts.BUY}, HOLD ${counts.HOLD}, SELL ${counts.SELL} — review thesis before sizing.`
        : `Council leans ${final_recommendation} with ${agreementCount}/${active.length} responding agents aligned; average confidence ${Math.round(baseConf)}${failNote}.`;

  const next_checkpoint =
    "Review if Treasury yields, earnings revisions, or price vs 200-day MA shift materially.";

  // Phase 5: data-quality penalty + safety downgrade
  // 1 capped vote = -5 (one agent's reasoning got clipped), 2 = -10, 3 = -15,
  // 4+ = -20 (floor). Ceiling chosen because below 20 we can still represent a
  // valid BUY with moderate conviction; above 20 we would routinely invert the
  // verdict on a single bad snapshot, which is too aggressive.
  const cappedCount = votes.filter(
    (v) => !v.failed && v.capped_reason,
  ).length;
  const data_quality_penalty =
    cappedCount >= 1 ? Math.min(20, 5 * cappedCount) : 0;
  const adjustedConfidence = Math.max(
    0,
    consensus_confidence - data_quality_penalty,
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
    final_recommendation === "BUY" &&
    adjustedConfidence < 60
  ) {
    final_recommendation = "HOLD";
    const names = hardFundamentalFlags.map((f) => f.metric).join(", ");
    data_quality_note =
      (data_quality_note ? data_quality_note + " " : "") +
      `Downgraded BUY → HOLD: adjustedConfidence ${adjustedConfidence} is below 60 and fundamentals have hard flags (${names}).`;
  }

  return {
    final_recommendation,
    consensus_confidence: adjustedConfidence,
    final_thesis,
    key_disagreement,
    next_checkpoint,
    vote_breakdown: {
      buy: counts.BUY,
      hold: counts.HOLD,
      sell: counts.SELL,
    },
    agents: votes,
    data_quality_penalty,
    data_quality_note,
  };
}

export function consensusFromVotes(
  votes: AgentVote[],
  metrics?: StockMetricsPayload,
): ConsensusResult {
  return buildConsensus(votes, metrics);
}
