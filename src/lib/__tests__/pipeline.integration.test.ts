import { describe, it, expect } from "vitest";
import { ruleBasedVotes } from "@/lib/agents/ruleFallback";
import { buildConsensus, type AgentVote } from "@/lib/consensus";
import { validateMetrics } from "@/lib/metrics/validate";
import type { MetricFlag, StockMetricsPayload } from "@/lib/metrics/types";

function emptyMetrics(
  over: Partial<StockMetricsPayload> = {},
): StockMetricsPayload {
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
    metric_flags: [],
    ...over,
  };
}

describe("pipeline integration - LMT-like hallucination profile", () => {
  it("validates → rule votes → consensus yields non-BUY and surfaces hard flags", () => {
    // Pre-validate snapshot that mirrors the LMT bug
    const raw = emptyMetrics({
      ticker: "LMT",
      price: 500,
      roe_pct: 76.87,
      fcf_vs_earnings_ratio: 3.93,
      earnings_growth_consensus_pct: 161,
      pe_ratio: 27.04,
      momentum_12m_pct: 26.83,
      price_vs_ma_200_pct: 12,
      beta: 0.24,
      debt_to_equity: 2.0,
    });

    const validated = validateMetrics(raw);

    // Three fundamental metrics should be HARD-flagged after validation
    const hardMetrics = new Set(
      validated.metric_flags
        .filter((f) => f.severity === "hard")
        .map((f) => f.metric),
    );
    expect(hardMetrics.has("roe_pct")).toBe(true);
    expect(hardMetrics.has("fcf_vs_earnings_ratio")).toBe(true);
    expect(hardMetrics.has("earnings_growth_consensus_pct")).toBe(true);

    const votes = ruleBasedVotes(validated);

    // Quality suppressed by roe_pct hard flag
    const quality = votes.find((v) => v.agent === "quality")!;
    expect(quality.recommendation).toBe("HOLD");
    expect(quality.confidence).toBe(50);

    // Macro suppressed by earnings_growth_consensus_pct hard flag
    const macro = votes.find((v) => v.agent === "macro")!;
    expect(macro.recommendation).toBe("HOLD");
    expect(macro.confidence).toBe(50);

    const consensus = buildConsensus(votes, validated);

    // Council should NOT issue a BUY when half the persona ensemble has been suppressed
    expect(consensus.final_recommendation).not.toBe("BUY");
    // Hard flags still live on the payload for audit even if the note itself is empty
    expect(validated.metric_flags.some((f) => f.severity === "hard")).toBe(true);
  });
});

describe("pipeline integration - explicit BUY→HOLD safety downgrade", () => {
  it("downgrades manually-constructed BUY consensus when caps + hard fundamental flag present", () => {
    // Construct a raw consensus of BUY @ 52 (4 BUY + 2 HOLD @ conf 49, +3 agreement bonus)
    const votes: AgentVote[] = [
      {
        agent: "value",
        recommendation: "BUY",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
      },
      {
        agent: "momentum",
        recommendation: "BUY",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
        capped_reason: "ungrounded: no numeric citation matched",
      },
      {
        agent: "quality",
        recommendation: "BUY",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
        capped_reason: "hard_flag: roe_pct",
      },
      {
        agent: "contrarian",
        recommendation: "BUY",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
      },
      {
        agent: "macro",
        recommendation: "HOLD",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
      },
      {
        agent: "lowvol",
        recommendation: "HOLD",
        confidence: 49,
        thesis: "t",
        key_metric: "m",
        key_risk: "k",
      },
    ];

    const flag: MetricFlag = {
      metric: "roe_pct",
      value: 76.87,
      severity: "hard",
      family: "fundamental",
      reason: "ROE exceeds S&P 500 top-0.1% threshold",
    };
    const metrics = emptyMetrics({ roe_pct: 76.87, metric_flags: [flag] });

    const consensus = buildConsensus(votes, metrics);

    // 2 caps × 5 = 10 penalty; raw 52 → adjusted 42, below 60 floor
    expect(consensus.data_quality_penalty).toBe(10);
    expect(consensus.consensus_confidence).toBe(42);
    expect(consensus.final_recommendation).toBe("HOLD");
    expect(consensus.data_quality_note).toContain("capped");
    expect(consensus.data_quality_note).toContain("Downgraded BUY → HOLD");
    expect(consensus.data_quality_note).toContain("roe_pct");
  });
});
