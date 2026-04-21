import { describe, it, expect } from "vitest";
import { groundVote } from "./groundVote";
import type { AgentVote } from "@/lib/consensus";
import type { MetricFlag, StockMetricsPayload } from "@/lib/metrics/types";

function baseMetrics(
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

function baseVote(over: Partial<AgentVote> = {}): AgentVote {
  return {
    agent: "quality",
    recommendation: "BUY",
    confidence: 80,
    thesis: "x",
    key_metric: "x",
    key_risk: "r",
    ...over,
  };
}

describe("groundVote - grounded citations keep confidence", () => {
  it("quality vote citing in-family, in-snapshot, non-flagged metric passes through", () => {
    const metrics = baseMetrics({ roe_pct: 17.3 });
    const vote = baseVote({
      agent: "quality",
      thesis: "ROE 17.3% compounding",
      key_metric: "ROE 17.3%",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.confidence).toBe(80);
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeUndefined();
  });
});

describe("groundVote - ungrounded", () => {
  it("caps ungrounded citation to 55 with 'ungrounded' reason", () => {
    const metrics = baseMetrics({ price: 200 });
    const vote = baseVote({
      agent: "momentum",
      thesis: "Price target 999.9 looks stretched",
      key_metric: "target 999.9",
    });
    const out = groundVote(vote, metrics, "momentum");
    expect(out.confidence).toBe(55);
    expect(out.grounded).toBe(false);
    expect(out.capped_reason).toBeDefined();
    expect(out.capped_reason!.startsWith("ungrounded")).toBe(true);
  });
});

describe("groundVote - out-of-family", () => {
  it("quality agent citing only price (price family) is capped with 'out_of_family'", () => {
    const metrics = baseMetrics({ price: 200 });
    const vote = baseVote({
      agent: "quality",
      thesis: "Price 200 suggests fair",
      key_metric: "price 200",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.confidence).toBe(55);
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeDefined();
    expect(out.capped_reason!.startsWith("out_of_family")).toBe(true);
  });
});

describe("groundVote - hard-flagged citations", () => {
  it("reduces confidence by 25 floored at 50 and explains 'hard_flag'", () => {
    const flag: MetricFlag = {
      metric: "roe_pct",
      value: 76.87,
      severity: "hard",
      family: "fundamental",
      reason: "ROE 76.9% exceeds S&P 500 top-0.1% threshold",
    };
    const metrics = baseMetrics({ roe_pct: 76.87, metric_flags: [flag] });
    const vote = baseVote({
      agent: "quality",
      confidence: 80,
      thesis: "ROE 76.87% is exceptional",
      key_metric: "ROE 76.87%",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.confidence).toBe(Math.max(50, 80 - 25));
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeDefined();
    expect(out.capped_reason!.startsWith("hard_flag")).toBe(true);
  });

  it("applies the 50 floor when conf - 25 would be below 50", () => {
    const flag: MetricFlag = {
      metric: "roe_pct",
      value: 76.87,
      severity: "hard",
      family: "fundamental",
      reason: "ROE implausible",
    };
    const metrics = baseMetrics({ roe_pct: 76.87, metric_flags: [flag] });
    const vote = baseVote({
      agent: "quality",
      confidence: 60,
      thesis: "ROE 76.87% strong",
      key_metric: "ROE 76.87%",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.confidence).toBe(50);
  });
});

describe("groundVote - failed votes", () => {
  it("passes failed votes through untouched", () => {
    const metrics = baseMetrics();
    const vote = baseVote({
      failed: true,
      confidence: 40,
      thesis: "parse error",
      key_metric: "",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out).toBe(vote);
  });
});

describe("groundVote - tolerance", () => {
  it("counts 12.3 as grounded when real is 12.5 (rel err ~1.6%)", () => {
    const metrics = baseMetrics({ roe_pct: 12.5 });
    const vote = baseVote({
      agent: "quality",
      thesis: "ROE 12.3% steady",
      key_metric: "ROE 12.3%",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeUndefined();
  });

  it("does not count 12.0 as grounded when real is 12.5 (rel err 4%)", () => {
    const metrics = baseMetrics({ roe_pct: 12.5 });
    const vote = baseVote({
      agent: "quality",
      thesis: "ROE 12.0% steady",
      key_metric: "ROE 12.0%",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.grounded).toBe(false);
    expect(out.capped_reason).toBeDefined();
    expect(out.capped_reason!.startsWith("ungrounded")).toBe(true);
  });

  it("uses absolute tolerance (0.05) for small numbers: 0.25 matches 0.26", () => {
    const metrics = baseMetrics({ debt_to_equity: 0.26 });
    const vote = baseVote({
      agent: "quality",
      thesis: "Debt to equity 0.25 manageable",
      key_metric: "D/E 0.25",
    });
    const out = groundVote(vote, metrics, "quality");
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeUndefined();
  });
});

describe("groundVote - macro agent family policy", () => {
  it("macro citing treasury and earnings growth is in-family (macro + fundamental)", () => {
    const metrics = baseMetrics({
      treasury_10y_pct: 4.37,
      earnings_growth_consensus_pct: 12.4,
    });
    const vote = baseVote({
      agent: "macro",
      thesis: "10Y at 4.37 and growth 12.4 tighten multiples",
      key_metric: "10Y 4.37",
    });
    const out = groundVote(vote, metrics, "macro");
    expect(out.grounded).toBe(true);
    expect(out.capped_reason).toBeUndefined();
    expect(out.confidence).toBe(80);
  });
});
