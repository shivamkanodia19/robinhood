import { describe, it, expect } from "vitest";
import { FIXTURES } from "./fixtures";
import { validateMetrics } from "@/lib/metrics/validate";
import { ruleBasedVotes } from "@/lib/agents/ruleFallback";
import { buildConsensus } from "@/lib/consensus";

describe("regression harness — hallucination defense", () => {
  for (const fx of FIXTURES) {
    it(`${fx.ticker}: ${fx.label}`, () => {
      const validated = validateMetrics(fx.metrics);

      const hard = validated.metric_flags
        .filter((f) => f.severity === "hard")
        .map((f) => f.metric)
        .sort();
      const soft = validated.metric_flags
        .filter((f) => f.severity === "soft")
        .map((f) => f.metric)
        .sort();

      expect(hard).toEqual([...fx.expected.hard_flag_metrics].sort());
      expect(soft).toEqual([...fx.expected.soft_flag_metrics].sort());

      const votes = ruleBasedVotes(validated);
      const consensus = buildConsensus(votes, validated);

      expect(consensus.final_recommendation).toBe(
        fx.expected.final_recommendation,
      );
      expect(consensus.data_quality_penalty).toBeGreaterThanOrEqual(
        fx.expected.data_quality_penalty_min,
      );
      for (const needle of fx.expected.note_contains ?? []) {
        expect(consensus.data_quality_note).toContain(needle);
      }
    });
  }
});
