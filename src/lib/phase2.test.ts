import { describe, it, expect } from "vitest";
import { buildWeightedConsensus, computeConvictionChange } from "./phase2";
import type { AgentVote } from "./consensus";

const votes: AgentVote[] = [
  { agent: "value", recommendation: "BUY", confidence: 80, thesis: "", key_metric: "", key_risk: "" },
  { agent: "momentum", recommendation: "BUY", confidence: 75, thesis: "", key_metric: "", key_risk: "" },
  { agent: "quality", recommendation: "HOLD", confidence: 65, thesis: "", key_metric: "", key_risk: "" },
  { agent: "contrarian", recommendation: "SELL", confidence: 55, thesis: "", key_metric: "", key_risk: "" },
  { agent: "macro", recommendation: "HOLD", confidence: 60, thesis: "", key_metric: "", key_risk: "" },
  { agent: "lowvol", recommendation: "BUY", confidence: 70, thesis: "", key_metric: "", key_risk: "" },
];

describe("phase2 weighted consensus", () => {
  it("changes output by profile weights", () => {
    const profileSensitiveVotes: AgentVote[] = [
      { agent: "value", recommendation: "SELL", confidence: 85, thesis: "", key_metric: "", key_risk: "" },
      { agent: "momentum", recommendation: "BUY", confidence: 85, thesis: "", key_metric: "", key_risk: "" },
      { agent: "quality", recommendation: "HOLD", confidence: 60, thesis: "", key_metric: "", key_risk: "" },
      { agent: "contrarian", recommendation: "HOLD", confidence: 60, thesis: "", key_metric: "", key_risk: "" },
      { agent: "macro", recommendation: "HOLD", confidence: 60, thesis: "", key_metric: "", key_risk: "" },
      { agent: "lowvol", recommendation: "HOLD", confidence: 60, thesis: "", key_metric: "", key_risk: "" },
    ];
    const value = buildWeightedConsensus(profileSensitiveVotes, "value");
    const momentum = buildWeightedConsensus(profileSensitiveVotes, "momentum");
    expect(value.profile).toBe("value");
    expect(momentum.profile).toBe("momentum");
    expect(value.weighted_score).not.toBe(momentum.weighted_score);
  });

  it("computes conviction direction", () => {
    const up = computeConvictionChange(0.3, 0.05);
    const down = computeConvictionChange(-0.2, 0.1);
    const stable = computeConvictionChange(0.11, 0.1);
    expect(up.direction).toBe("UP");
    expect(down.direction).toBe("DOWN");
    expect(stable.direction).toBe("STABLE");
  });
});
