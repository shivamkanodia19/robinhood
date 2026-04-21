import { describe, it, expect } from "vitest";
import { ruleBasedVotes } from "./ruleFallback";
import type { StockMetricsPayload } from "@/lib/metrics/types";

function mockMetrics(over: Partial<StockMetricsPayload> = {}): StockMetricsPayload {
  return {
    ticker: "TEST",
    currency: "USD",
    as_of: "2026-01-01T00:00:00.000Z",
    price: 100,
    market_cap: 1e12,
    enterprise_value: 1e12,
    pe_ratio: 20,
    forward_pe: 18,
    pb_ratio: 3,
    ps_ratio: 5,
    dividend_yield_pct: 1.5,
    beta: 1,
    roe_pct: 15,
    net_margin_pct: 20,
    debt_to_equity: 0.4,
    debt_to_ebitda: 2,
    fcf: 1e10,
    net_income: 1e10,
    fcf_yield_pct: 5,
    fcf_vs_earnings_ratio: 1,
    revenue: 1e11,
    cash_pct_of_assets: 12,
    momentum_12m_pct: 10,
    price_vs_ma_50_pct: 2,
    price_vs_ma_200_pct: 5,
    ma_50: 95,
    ma_200: 90,
    insider_buys_3mo: null,
    insider_sells_3mo: null,
    news_sentiment_score: 50,
    earnings_volatility_coeff: 0.1,
    semi_deviation_monthly: 2,
    pe_vs_5y_avg_ratio: 1,
    pe_5y_avg: 20,
    div_yield_vs_5y_avg_ratio: 1,
    div_yield_5y_avg_pct: 1.5,
    analyst_downgrades_3mo: 0,
    short_interest_pct: 2,
    sector_pb_median_proxy: 3,
    sector_roe_median_proxy: 12,
    sector_short_median_proxy: 3,
    treasury_10y_pct: 4,
    yield_spread_vs_treasury_pct: -2.5,
    earnings_growth_consensus_pct: 8,
    earnings_consensus_std_pct: null,
    data_warnings: [],
    metric_flags: [],
    ...over,
  };
}

describe("ruleBasedVotes determinism", () => {
  it("returns identical votes for identical metrics (10x)", () => {
    const m = mockMetrics();
    const first = JSON.stringify(ruleBasedVotes(m));
    for (let i = 0; i < 9; i++) {
      expect(JSON.stringify(ruleBasedVotes(m))).toBe(first);
    }
  });

  it("returns 6 votes in canonical order when no flags are present", () => {
    const m = mockMetrics();
    const votes = ruleBasedVotes(m);
    expect(votes.map((v) => v.agent)).toEqual([
      "value",
      "momentum",
      "quality",
      "contrarian",
      "macro",
      "lowvol",
    ]);
  });
});

describe("ruleBasedVotes - hard flag suppression", () => {
  it("suppresses quality vote to HOLD @ 50 when roe_pct is hard-flagged", () => {
    const m = mockMetrics({
      roe_pct: 76.87,
      metric_flags: [
        {
          metric: "roe_pct",
          value: 76.87,
          severity: "hard",
          family: "fundamental",
          reason: "ROE exceeds S&P top-0.1%",
        },
      ],
    });
    const votes = ruleBasedVotes(m);
    const quality = votes.find((v) => v.agent === "quality")!;
    expect(quality.recommendation).toBe("HOLD");
    expect(quality.confidence).toBe(50);
    expect(quality.key_risk).toContain("roe_pct");
  });

  it("suppresses lowvol vote to HOLD @ 50 when beta is hard-flagged", () => {
    const m = mockMetrics({
      beta: 0.05,
      metric_flags: [
        {
          metric: "beta",
          value: 0.05,
          severity: "hard",
          family: "price",
          reason: "Beta implausibly low",
        },
      ],
    });
    const votes = ruleBasedVotes(m);
    const lowvol = votes.find((v) => v.agent === "lowvol")!;
    expect(lowvol.recommendation).toBe("HOLD");
    expect(lowvol.confidence).toBe(50);
    expect(lowvol.key_risk).toContain("beta");
  });

  it("suppresses contrarian vote to HOLD @ 50 when pe_ratio is hard-flagged", () => {
    const m = mockMetrics({
      pe_ratio: 150,
      pe_vs_5y_avg_ratio: 0.7,
      metric_flags: [
        {
          metric: "pe_ratio",
          value: 150,
          severity: "hard",
          family: "fundamental",
          reason: "P/E above 120",
        },
      ],
    });
    const votes = ruleBasedVotes(m);
    const contrarian = votes.find((v) => v.agent === "contrarian")!;
    expect(contrarian.recommendation).toBe("HOLD");
    expect(contrarian.confidence).toBe(50);
    expect(contrarian.key_risk).toContain("pe_ratio");
  });

  it("suppresses momentum vote to HOLD @ 50 when momentum_12m_pct is hard-flagged", () => {
    const m = mockMetrics({
      momentum_12m_pct: 300,
      price_vs_ma_200_pct: 60,
      metric_flags: [
        {
          metric: "momentum_12m_pct",
          value: 300,
          severity: "hard",
          family: "price",
          reason: "Momentum extreme",
        },
      ],
    });
    const votes = ruleBasedVotes(m);
    const momentum = votes.find((v) => v.agent === "momentum")!;
    expect(momentum.recommendation).toBe("HOLD");
    expect(momentum.confidence).toBe(50);
    expect(momentum.key_risk).toContain("momentum_12m_pct");
  });
});
