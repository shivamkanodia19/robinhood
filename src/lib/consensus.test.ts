import { describe, it, expect } from "vitest";
import { buildConsensus, type AgentVote } from "./consensus";
import type { MetricFlag, StockMetricsPayload } from "@/lib/metrics/types";

const base = (r: AgentVote["recommendation"]): Omit<AgentVote, "agent"> => ({
  recommendation: r,
  confidence: 60,
  thesis: "t",
  key_metric: "m",
  key_risk: "k",
});

function metricsWithFlags(flags: MetricFlag[]): StockMetricsPayload {
  return {
    ticker: "TEST",
    currency: "USD",
    as_of: "2026-01-01T00:00:00.000Z",
    price: null,
    market_cap: null,
    enterprise_value: null,
    pe_ratio: null,
    forward_pe: null,
    pb_ratio: null,
    ps_ratio: null,
    dividend_yield_pct: null,
    beta: null,
    roe_pct: null,
    net_margin_pct: null,
    debt_to_equity: null,
    debt_to_ebitda: null,
    fcf: null,
    net_income: null,
    fcf_yield_pct: null,
    fcf_vs_earnings_ratio: null,
    revenue: null,
    cash_pct_of_assets: null,
    momentum_12m_pct: null,
    price_vs_ma_50_pct: null,
    price_vs_ma_200_pct: null,
    ma_50: null,
    ma_200: null,
    insider_buys_3mo: null,
    insider_sells_3mo: null,
    news_sentiment_score: null,
    earnings_volatility_coeff: null,
    semi_deviation_monthly: null,
    pe_vs_5y_avg_ratio: null,
    pe_5y_avg: null,
    div_yield_vs_5y_avg_ratio: null,
    div_yield_5y_avg_pct: null,
    analyst_downgrades_3mo: null,
    short_interest_pct: null,
    sector_pb_median_proxy: null,
    sector_roe_median_proxy: null,
    sector_short_median_proxy: null,
    treasury_10y_pct: null,
    yield_spread_vs_treasury_pct: null,
    earnings_growth_consensus_pct: null,
    earnings_consensus_std_pct: null,
    data_warnings: [],
    metric_flags: flags,
  };
}

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
    expect(c.data_quality_penalty).toBe(0);
    expect(c.data_quality_note).toBe("");
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

  it("excludes failed agents from alignment and vote counts", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY"), failed: true },
      { agent: "momentum", ...base("BUY"), failed: true },
      { agent: "quality", ...base("HOLD") },
      { agent: "contrarian", ...base("HOLD") },
      { agent: "macro", ...base("HOLD") },
      { agent: "lowvol", ...base("HOLD") },
    ];
    const c = buildConsensus(votes);
    expect(c.vote_breakdown).toEqual({ buy: 0, hold: 4, sell: 0 });
    expect(c.final_thesis).toContain("4/4");
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

describe("buildConsensus - data_quality_penalty", () => {
  it("applies -10 penalty for 2 capped votes without changing recommendation", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("BUY"), capped_reason: "ungrounded: x" },
      { agent: "quality", ...base("BUY"), capped_reason: "hard_flag: y" },
      { agent: "contrarian", ...base("BUY") },
      { agent: "macro", ...base("BUY") },
      { agent: "lowvol", ...base("BUY") },
    ];
    const c = buildConsensus(votes);
    expect(c.final_recommendation).toBe("BUY");
    expect(c.data_quality_penalty).toBe(10);
    expect(c.consensus_confidence).toBe(75 - 10);
    expect(c.data_quality_note).toContain("2 agents");
    expect(c.data_quality_note).toContain("capped");
  });

  it("clamps penalty at 20 for 4+ capped votes", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY"), capped_reason: "ungrounded: a" },
      { agent: "momentum", ...base("BUY"), capped_reason: "ungrounded: b" },
      { agent: "quality", ...base("BUY"), capped_reason: "ungrounded: c" },
      { agent: "contrarian", ...base("BUY"), capped_reason: "ungrounded: d" },
      { agent: "macro", ...base("BUY"), capped_reason: "ungrounded: e" },
      { agent: "lowvol", ...base("BUY") },
    ];
    const c = buildConsensus(votes);
    expect(c.data_quality_penalty).toBe(20);
  });

  it("applies no penalty when no votes are capped", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("BUY") },
      { agent: "quality", ...base("BUY") },
      { agent: "contrarian", ...base("BUY") },
      { agent: "macro", ...base("BUY") },
      { agent: "lowvol", ...base("BUY") },
    ];
    const c = buildConsensus(votes);
    expect(c.data_quality_penalty).toBe(0);
    expect(c.data_quality_note).toBe("");
  });
});

describe("buildConsensus - BUY→HOLD safety downgrade", () => {
  it("downgrades BUY to HOLD when adjusted confidence < 60 and hard fundamental flag present", () => {
    // 4 BUY + 2 HOLD at conf 49 → base=49, bonus=3 (4 aligned), consensus=52.
    // 2 capped → penalty=10 → adjusted=42. Below 60 + hard fundamental → HOLD.
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY"), confidence: 49 },
      { agent: "momentum", ...base("BUY"), confidence: 49, capped_reason: "ungrounded: a" },
      { agent: "quality", ...base("BUY"), confidence: 49, capped_reason: "hard_flag: b" },
      { agent: "contrarian", ...base("BUY"), confidence: 49 },
      { agent: "macro", ...base("HOLD"), confidence: 49 },
      { agent: "lowvol", ...base("HOLD"), confidence: 49 },
    ];
    const metrics = metricsWithFlags([
      {
        metric: "roe_pct",
        value: 76.87,
        severity: "hard",
        family: "fundamental",
        reason: "ROE implausible",
      },
    ]);
    const c = buildConsensus(votes, metrics);
    expect(c.final_recommendation).toBe("HOLD");
    expect(c.data_quality_penalty).toBe(10);
    expect(c.consensus_confidence).toBe(42);
    expect(c.data_quality_note).toContain("capped");
    expect(c.data_quality_note).toContain("Downgraded BUY → HOLD");
  });

  it("keeps BUY when adjusted confidence >= 60 even with hard fundamental flag", () => {
    // 6 BUY at conf 60, unanimous → base=60, bonus=15, consensus=75. 2 caps → adjusted=65.
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY") },
      { agent: "momentum", ...base("BUY"), capped_reason: "ungrounded: a" },
      { agent: "quality", ...base("BUY"), capped_reason: "hard_flag: b" },
      { agent: "contrarian", ...base("BUY") },
      { agent: "macro", ...base("BUY") },
      { agent: "lowvol", ...base("BUY") },
    ];
    const metrics = metricsWithFlags([
      {
        metric: "roe_pct",
        value: 76.87,
        severity: "hard",
        family: "fundamental",
        reason: "ROE implausible",
      },
    ]);
    const c = buildConsensus(votes, metrics);
    expect(c.final_recommendation).toBe("BUY");
    expect(c.consensus_confidence).toBe(65);
    expect(c.data_quality_note).toContain("capped");
    expect(c.data_quality_note).not.toContain("Downgraded");
  });

  it("does not re-downgrade when final is already HOLD", () => {
    const votes: AgentVote[] = [
      { agent: "value", ...base("HOLD"), confidence: 49 },
      { agent: "momentum", ...base("HOLD"), confidence: 49, capped_reason: "ungrounded: a" },
      { agent: "quality", ...base("HOLD"), confidence: 49, capped_reason: "hard_flag: b" },
      { agent: "contrarian", ...base("HOLD"), confidence: 49 },
      { agent: "macro", ...base("HOLD"), confidence: 49 },
      { agent: "lowvol", ...base("HOLD"), confidence: 49 },
    ];
    const metrics = metricsWithFlags([
      {
        metric: "roe_pct",
        value: 76.87,
        severity: "hard",
        family: "fundamental",
        reason: "ROE implausible",
      },
    ]);
    const c = buildConsensus(votes, metrics);
    expect(c.final_recommendation).toBe("HOLD");
    expect(c.data_quality_note).toContain("capped");
    expect(c.data_quality_note).not.toContain("Downgraded");
  });

  it("does NOT downgrade on hard PRICE flag (only fundamental flags trigger the safety)", () => {
    // 4 BUY + 2 HOLD at conf 49 → consensus=52, 2 caps → adjusted=42. Flag family = price.
    const votes: AgentVote[] = [
      { agent: "value", ...base("BUY"), confidence: 49 },
      { agent: "momentum", ...base("BUY"), confidence: 49, capped_reason: "ungrounded: a" },
      { agent: "quality", ...base("BUY"), confidence: 49, capped_reason: "hard_flag: b" },
      { agent: "contrarian", ...base("BUY"), confidence: 49 },
      { agent: "macro", ...base("HOLD"), confidence: 49 },
      { agent: "lowvol", ...base("HOLD"), confidence: 49 },
    ];
    const metrics = metricsWithFlags([
      {
        metric: "momentum_12m_pct",
        value: 300,
        severity: "hard",
        family: "price",
        reason: "Momentum extreme",
      },
    ]);
    const c = buildConsensus(votes, metrics);
    expect(c.final_recommendation).toBe("BUY");
    expect(c.consensus_confidence).toBe(42);
    expect(c.data_quality_note).not.toContain("Downgraded");
  });
});
