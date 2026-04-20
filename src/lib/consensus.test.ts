import { describe, it, expect } from "vitest";
import { buildConsensus, type AgentVote } from "./consensus";

const base = (r: AgentVote["recommendation"]): Omit<AgentVote, "agent"> => ({
  recommendation: r,
  confidence: 60,
  thesis: "t",
  key_metric: "m",
  key_risk: "k",
});

describe("buildConsensus", () => {
  it("unanimous BUY adds agreement bonus", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("BUY") },
      { agent: "quality", ...base("BUY") },
      { agent: "contrarian", ...base("BUY") },
      { agent: "macro", ...base("BUY") },
      { agent: "lowvol", ...base("BUY") },
    ];
    const c = buildConsensus(votes);
    expect(c.final_recommendation).toBe("BUY");
    expect(c.consensus_confidence).toBeGreaterThanOrEqual(60 + 15);
  });

  it("detects MIXED when three-way tie", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("BUY") },
      { agent: "quality", ...base("HOLD") },
      { agent: "contrarian", ...base("HOLD") },
      { agent: "macro", ...base("SELL") },
      { agent: "lowvol", ...base("SELL") },
    ];
    const c = buildConsensus(votes);
    expect(c.final_recommendation).toBe("MIXED");
  });

  it("handles 100 concurrent aggregations", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("HOLD") },
      { agent: "quality", ...base("BUY") },
      { agent: "contrarian", ...base("SELL") },
      { agent: "macro", ...base("BUY") },
      { agent: "lowvol", ...base("HOLD") },
    ];
    for (let i = 0; i < 100; i++) {
      const c = buildConsensus(votes);
      expect(c.vote_breakdown).toEqual({ buy: 3, hold: 2, sell: 1 });
    }
  });
});
