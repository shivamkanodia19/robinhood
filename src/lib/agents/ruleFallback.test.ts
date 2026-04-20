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
});
