import type { AgentKind } from "@/lib/metrics/types";

export interface AgentVote {
  agent: AgentKind;
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
  thesis: string;
  key_metric: string;
  key_risk: string;
  /** Model or parse failure — excluded from vote tallies and confidence averages */
  failed?: boolean;
}

export interface ConsensusResult {
  final_recommendation: "BUY" | "HOLD" | "SELL" | "MIXED";
  consensus_confidence: number;
  final_thesis: string;
  key_disagreement: string;
  next_checkpoint: string;
  vote_breakdown: { buy: number; hold: number; sell: number };
  agents: AgentVote[];
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function buildConsensus(votes: AgentVote[]): ConsensusResult {
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

  const final_recommendation: ConsensusResult["final_recommendation"] =
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

  return {
    final_recommendation,
    consensus_confidence,
    final_thesis,
    key_disagreement,
    next_checkpoint,
    vote_breakdown: {
      buy: counts.BUY,
      hold: counts.HOLD,
      sell: counts.SELL,
    },
    agents: votes,
  };
}

export function consensusFromVotes(votes: AgentVote[]): ConsensusResult {
  return buildConsensus(votes);
}
