import { describe, it, expect } from "vitest";
import { validateMetrics, METRIC_GLOSSARY } from "./validate";
import type { StockMetricsPayload } from "./types";

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

function flagFor(m: StockMetricsPayload, metric: string) {
  return m.metric_flags.find((f) => f.metric === metric);
}

function assertWellFormed(
  f: ReturnType<typeof flagFor>,
  expected: {
    metric: string;
    severity: "hard" | "soft";
    family: "fundamental" | "price" | "macro";
    value: number;
  },
) {
  expect(f).toBeDefined();
  expect(f!.metric).toBe(expected.metric);
  expect(f!.severity).toBe(expected.severity);
  expect(f!.family).toBe(expected.family);
  expect(f!.value).toBe(expected.value);
  expect(typeof f!.reason).toBe("string");
  expect(f!.reason.length).toBeGreaterThan(0);
}

describe("validateMetrics - ROE", () => {
  it("flags 76.87 as HARD fundamental (above 60 ceiling)", () => {
    const m = validateMetrics(baseMetrics({ roe_pct: 76.87 }));
    assertWellFormed(flagFor(m, "roe_pct"), {
      metric: "roe_pct",
      severity: "hard",
      family: "fundamental",
      value: 76.87,
    });
  });

  it("flags 38 as SOFT (above 35 top-decile)", () => {
    const m = validateMetrics(baseMetrics({ roe_pct: 38 }));
    assertWellFormed(flagFor(m, "roe_pct"), {
      metric: "roe_pct",
      severity: "soft",
      family: "fundamental",
      value: 38,
    });
  });

  it("does not flag 20", () => {
    const m = validateMetrics(baseMetrics({ roe_pct: 20 }));
    expect(flagFor(m, "roe_pct")).toBeUndefined();
  });

  it("flags -40 as HARD (below -30 distress)", () => {
    const m = validateMetrics(baseMetrics({ roe_pct: -40 }));
    assertWellFormed(flagFor(m, "roe_pct"), {
      metric: "roe_pct",
      severity: "hard",
      family: "fundamental",
      value: -40,
    });
  });
});

describe("validateMetrics - FCF/NI ratio", () => {
  it("flags 3.93 as HARD (above 2.0 ceiling)", () => {
    const m = validateMetrics(baseMetrics({ fcf_vs_earnings_ratio: 3.93 }));
    assertWellFormed(flagFor(m, "fcf_vs_earnings_ratio"), {
      metric: "fcf_vs_earnings_ratio",
      severity: "hard",
      family: "fundamental",
      value: 3.93,
    });
  });

  it("does not flag 1.03 (healthy mid-band)", () => {
    const m = validateMetrics(baseMetrics({ fcf_vs_earnings_ratio: 1.03 }));
    expect(flagFor(m, "fcf_vs_earnings_ratio")).toBeUndefined();
  });

  it("flags 0.4 as SOFT (below 0.5 cash conversion concern)", () => {
    const m = validateMetrics(baseMetrics({ fcf_vs_earnings_ratio: 0.4 }));
    assertWellFormed(flagFor(m, "fcf_vs_earnings_ratio"), {
      metric: "fcf_vs_earnings_ratio",
      severity: "soft",
      family: "fundamental",
      value: 0.4,
    });
  });

  it("flags -1.2 as HARD (implausibly negative)", () => {
    const m = validateMetrics(baseMetrics({ fcf_vs_earnings_ratio: -1.2 }));
    assertWellFormed(flagFor(m, "fcf_vs_earnings_ratio"), {
      metric: "fcf_vs_earnings_ratio",
      severity: "hard",
      family: "fundamental",
      value: -1.2,
    });
  });
});

describe("validateMetrics - earnings growth", () => {
  it("flags 161 as HARD (above 75 ceiling)", () => {
    const m = validateMetrics(
      baseMetrics({ earnings_growth_consensus_pct: 161 }),
    );
    assertWellFormed(flagFor(m, "earnings_growth_consensus_pct"), {
      metric: "earnings_growth_consensus_pct",
      severity: "hard",
      family: "fundamental",
      value: 161,
    });
  });

  it("flags 55 as SOFT (above 50 top-decile)", () => {
    const m = validateMetrics(
      baseMetrics({ earnings_growth_consensus_pct: 55 }),
    );
    assertWellFormed(flagFor(m, "earnings_growth_consensus_pct"), {
      metric: "earnings_growth_consensus_pct",
      severity: "soft",
      family: "fundamental",
      value: 55,
    });
  });

  it("does not flag 8 (typical S&P long-run)", () => {
    const m = validateMetrics(
      baseMetrics({ earnings_growth_consensus_pct: 8 }),
    );
    expect(flagFor(m, "earnings_growth_consensus_pct")).toBeUndefined();
  });
});

describe("validateMetrics - P/E", () => {
  it("does not flag 27 (normal range)", () => {
    const m = validateMetrics(baseMetrics({ pe_ratio: 27 }));
    expect(flagFor(m, "pe_ratio")).toBeUndefined();
  });

  it("flags 150 as HARD", () => {
    const m = validateMetrics(baseMetrics({ pe_ratio: 150 }));
    assertWellFormed(flagFor(m, "pe_ratio"), {
      metric: "pe_ratio",
      severity: "hard",
      family: "fundamental",
      value: 150,
    });
  });

  it("flags 90 as SOFT", () => {
    const m = validateMetrics(baseMetrics({ pe_ratio: 90 }));
    assertWellFormed(flagFor(m, "pe_ratio"), {
      metric: "pe_ratio",
      severity: "soft",
      family: "fundamental",
      value: 90,
    });
  });

  it("flags -10 as HARD (negative earnings)", () => {
    const m = validateMetrics(baseMetrics({ pe_ratio: -10 }));
    assertWellFormed(flagFor(m, "pe_ratio"), {
      metric: "pe_ratio",
      severity: "hard",
      family: "fundamental",
      value: -10,
    });
  });
});

describe("validateMetrics - beta", () => {
  it("flags 0.05 as SOFT (implausibly low)", () => {
    const m = validateMetrics(baseMetrics({ beta: 0.05 }));
    assertWellFormed(flagFor(m, "beta"), {
      metric: "beta",
      severity: "soft",
      family: "price",
      value: 0.05,
    });
  });

  it("flags 3.5 as SOFT (extreme)", () => {
    const m = validateMetrics(baseMetrics({ beta: 3.5 }));
    assertWellFormed(flagFor(m, "beta"), {
      metric: "beta",
      severity: "soft",
      family: "price",
      value: 3.5,
    });
  });

  it("does not flag 0.85", () => {
    const m = validateMetrics(baseMetrics({ beta: 0.85 }));
    expect(flagFor(m, "beta")).toBeUndefined();
  });
});

describe("validateMetrics - sentinel values", () => {
  it("handles all-null metrics without crashing or flagging", () => {
    const m = validateMetrics(baseMetrics());
    expect(m.metric_flags).toEqual([]);
  });

  it("handles NaN values without crashing or flagging", () => {
    const m = validateMetrics(
      baseMetrics({
        roe_pct: Number.NaN,
        pe_ratio: Number.NaN,
        beta: Number.NaN,
        fcf_vs_earnings_ratio: Number.NaN,
        earnings_growth_consensus_pct: Number.NaN,
        net_margin_pct: Number.NaN,
      }),
    );
    expect(m.metric_flags).toEqual([]);
  });

  it("handles undefined fields (cast from loose inputs) without crashing", () => {
    const loose = {
      ...baseMetrics(),
      roe_pct: undefined,
      pe_ratio: undefined,
      beta: undefined,
    } as unknown as StockMetricsPayload;
    const m = validateMetrics(loose);
    expect(m.metric_flags).toEqual([]);
  });

  it("family assignment always comes from METRIC_GLOSSARY", () => {
    const m = validateMetrics(
      baseMetrics({
        roe_pct: 76.87,
        beta: 0.05,
        earnings_growth_consensus_pct: 161,
      }),
    );
    for (const f of m.metric_flags) {
      expect(METRIC_GLOSSARY[f.metric]).toBeDefined();
      expect(f.family).toBe(METRIC_GLOSSARY[f.metric]);
    }
  });
});
