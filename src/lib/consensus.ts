import type { AgentKind } from "@/lib/metrics/types";

export interface AgentVote {
  agent: AgentKind;
  recommendation: "BUY" | "HOLD" | "SELL";
  confidence: number;
  thesis: string;
  key_metric: string;
  key_risk: string;
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
  const counts = { BUY: 0, HOLD: 0, SELL: 0 };
  for (const v of votes) {
    counts[v.recommendation]++;
  }

  const maxCount = Math.max(counts.BUY, counts.HOLD, counts.SELL);
  const leaders = (["BUY", "HOLD", "SELL"] as const).filter(
    (r) => counts[r] === maxCount,
  );

  const final_recommendation: ConsensusResult["final_recommendation"] =
    leaders.length !== 1 ? "MIXED" : leaders[0];

  const dominant =
    final_recommendation === "MIXED" ? null : final_recommendation;

  const aligned = dominant
    ? votes.filter((v) => v.recommendation === dominant)
    : votes;
  const agreementCount = dominant ? aligned.length : 0;

  let agreementBonus = 0;
  const n = votes.length;
  if (n >= 6 && dominant) {
    if (agreementCount === 6) agreementBonus = 15;
    else if (agreementCount === 5) agreementBonus = 8;
    else if (agreementCount === 4) agreementBonus = 3;
  }

  const baseConf = avg(votes.map((v) => v.confidence));
  const consensus_confidence = Math.min(
    100,
    Math.round(baseConf + agreementBonus),
  );

  const dissenters = dominant
    ? votes.filter((v) => v.recommendation !== dominant)
    : votes;
  const key_disagreement =
    final_recommendation === "MIXED"
      ? `No single majority: BUY ${counts.BUY}, HOLD ${counts.HOLD}, SELL ${counts.SELL}.`
      : dissenters.length === 0
        ? "Agents largely agree on direction; differences are mostly confidence."
        : `Dissent: ${dissenters
            .map((d) => `${d.agent} → ${d.recommendation} (${d.key_metric})`)
            .join("; ")}`;

  const final_thesis =
    final_recommendation === "MIXED"
      ? `Mixed signals: BUY ${counts.BUY}, HOLD ${counts.HOLD}, SELL ${counts.SELL} — review thesis before sizing.`
      : `Council leans ${final_recommendation} with ${agreementCount}/${votes.length} agents aligned; average confidence ${Math.round(baseConf)}.`;

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
