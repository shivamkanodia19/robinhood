import type { StockMetricsPayload } from "@/lib/metrics/types";

export interface RegressionCase {
  label: string;
  ticker: string;
  metrics: StockMetricsPayload;
  expected: {
    hard_flag_metrics: string[];
    soft_flag_metrics: string[];
    final_recommendation: "BUY" | "HOLD" | "SELL";
    data_quality_penalty_min: number;
    note_contains?: string[];
  };
}

// Middle-of-road baseline. Every fixture spreads this and overrides only the
// fields that matter for its scenario. Values are chosen so that, absent any
// overrides, validateMetrics emits zero flags and ruleBasedVotes returns six
// HOLD votes (so overrides, not defaults, drive rule-branch selection).
function base(
  ticker: string,
  over: Partial<StockMetricsPayload>,
): StockMetricsPayload {
  return {
    ticker,
    currency: "USD",
    as_of: "2026-04-20T12:00:00Z",
    price: 100,
    market_cap: 1e11,
    enterprise_value: 1.2e11,
    pe_ratio: 20,
    forward_pe: 18,
    pb_ratio: 3,
    ps_ratio: 3,
    dividend_yield_pct: 1.5,
    beta: 1.0,
    roe_pct: 15,
    net_margin_pct: 10,
    debt_to_equity: 0.5,
    debt_to_ebitda: 2,
    fcf: 1e9,
    net_income: 1e9,
    fcf_yield_pct: 4,
    fcf_vs_earnings_ratio: 1.0,
    revenue: 2e10,
    cash_pct_of_assets: 10,
    momentum_12m_pct: 5,
    price_vs_ma_50_pct: 2,
    price_vs_ma_200_pct: 3,
    ma_50: 98,
    ma_200: 97,
    insider_buys_3mo: 0,
    insider_sells_3mo: 0,
    news_sentiment_score: 50,
    earnings_volatility_coeff: 0.3,
    semi_deviation_monthly: 3,
    pe_vs_5y_avg_ratio: 1.0,
    pe_5y_avg: 20,
    div_yield_vs_5y_avg_ratio: 1.0,
    div_yield_5y_avg_pct: 1.5,
    analyst_downgrades_3mo: 0,
    short_interest_pct: 2,
    sector_pb_median_proxy: 3,
    sector_roe_median_proxy: 15,
    sector_short_median_proxy: 2,
    treasury_10y_pct: 4.2,
    yield_spread_vs_treasury_pct: -2.5,
    earnings_growth_consensus_pct: 10,
    earnings_consensus_std_pct: 5,
    data_warnings: [],
    metric_flags: [],
    ...over,
  };
}

export const FIXTURES: RegressionCase[] = [
  // 1. LMT-like hallucination case — the exact scenario that motivated phase 8.
  // Three hard fundamental flags but pe_ratio is in-range so contrarian still
  // participates normally. Rule-based votes return all HOLDs because every
  // rule branch with a "BUY" path is gated behind either a hard flag or
  // thresholds these metrics don't meet, so the final verdict is HOLD without
  // needing the consensus BUY→HOLD downgrade to fire.
  {
    label: "LMT-like hallucination (ROE 76.87, FCF/NI 3.93, EPS growth 161)",
    ticker: "LMT",
    metrics: base("LMT", {
      roe_pct: 76.87,
      fcf_vs_earnings_ratio: 3.93,
      earnings_growth_consensus_pct: 161,
      pe_ratio: 27.04,
    }),
    expected: {
      hard_flag_metrics: [
        "roe_pct",
        "fcf_vs_earnings_ratio",
        "earnings_growth_consensus_pct",
      ],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 2. Clean healthy mega-cap. No flags. Momentum and quality lean BUY; the
  // remaining four stay HOLD, so HOLD wins by plurality.
  {
    label: "Clean mega-cap (no flags, momentum+quality BUY, rest HOLD)",
    ticker: "CLEAN",
    metrics: base("CLEAN", {
      roe_pct: 28,
      fcf_vs_earnings_ratio: 1.05,
      earnings_growth_consensus_pct: 12,
      pe_ratio: 25,
      momentum_12m_pct: 18,
      price_vs_ma_200_pct: 8,
      beta: 1.1,
      debt_to_equity: 0.5,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 3. Bank / financial with legitimately high leverage. Rules don't flag
  // debt_to_equity at all; roe=14 sits in the healthy middle band so no
  // soft flag either.
  {
    label: "Bank-like (D/E 8 allowed, ROE 14, P/E 10) — no flags",
    ticker: "BANK",
    metrics: base("BANK", {
      roe_pct: 14,
      debt_to_equity: 8,
      pe_ratio: 10,
      pb_ratio: 1.2,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 4. Distressed loss-maker. Four hard flags. Quality/contrarian/macro are
  // all suppressed to HOLD; value's sell branch is disabled (pe_ratio is
  // hard-flagged). Only momentum SELLs (on -40% 12m) and lowvol SELLs
  // (beta 1.8). Plurality winner is HOLD.
  {
    label: "Distressed loss-maker (4 hard flags, momentum+lowvol SELL)",
    ticker: "DIST",
    metrics: base("DIST", {
      roe_pct: -45,
      net_margin_pct: -60,
      earnings_growth_consensus_pct: -80,
      pe_ratio: -5,
      momentum_12m_pct: -40,
      price_vs_ma_200_pct: -25,
      beta: 1.8,
      fcf_yield_pct: -3,
      fcf_vs_earnings_ratio: 0.9,
    }),
    expected: {
      hard_flag_metrics: [
        "roe_pct",
        "net_margin_pct",
        "earnings_growth_consensus_pct",
        "pe_ratio",
      ],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 5. High-growth SaaS: top-decile but plausible. Four soft flags, zero
  // hard. Value holds (fcf_yield 2.5 not <2 so SELL branch skipped, fcf_yield
  // not >6 so BUY branch skipped). Momentum & quality BUY on trend/ROE.
  // Downgrade logic does not fire (no hard fundamental flags).
  {
    label: "High-growth SaaS (4 soft flags, no hard, mom+quality BUY)",
    ticker: "SAAS",
    metrics: base("SAAS", {
      roe_pct: 38,
      fcf_vs_earnings_ratio: 1.35,
      earnings_growth_consensus_pct: 55,
      pe_ratio: 85,
      fcf_yield_pct: 2.5,
      momentum_12m_pct: 25,
      price_vs_ma_200_pct: 15,
      debt_to_equity: 0.3,
      beta: 1.3,
      pb_ratio: 10,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [
        "roe_pct",
        "fcf_vs_earnings_ratio",
        "earnings_growth_consensus_pct",
        "pe_ratio",
      ],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 6. Deep-value: value agent BUYs on fcf_yield 10 + P/B 0.8, contrarian BUYs
  // on P/E vs 5y anchor of 0.7. Remaining four vote HOLD. Plurality: HOLD.
  {
    label: "Deep value (fcf_yield 10, P/B 0.8, value+contrarian BUY)",
    ticker: "VAL",
    metrics: base("VAL", {
      pe_ratio: 8,
      pb_ratio: 0.8,
      dividend_yield_pct: 6,
      roe_pct: 12,
      fcf_yield_pct: 10,
      fcf_vs_earnings_ratio: 1.1,
      pe_vs_5y_avg_ratio: 0.7,
      momentum_12m_pct: 2,
      net_margin_pct: 8,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 7. Momentum breakout: momentum BUYs, quality BUYs on roe 22 + low D/E.
  // pe_vs_5y kept at 1.1 (not stretched enough for contrarian SELL).
  // beta 1.4 is right at lowvol SELL boundary (rule is strictly > 1.4),
  // so lowvol HOLDs.
  {
    label: "Momentum breakout (mom 45%, price vs MA200 +22%, beta 1.4)",
    ticker: "MOM",
    metrics: base("MOM", {
      momentum_12m_pct: 45,
      price_vs_ma_200_pct: 22,
      price_vs_ma_50_pct: 12,
      beta: 1.4,
      roe_pct: 22,
      pe_ratio: 32,
      pe_vs_5y_avg_ratio: 1.1,
      debt_to_equity: 0.6,
      net_margin_pct: 18,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },

  // 8. Low-vol defensive: lowvol BUYs on beta 0.3 + cash 15%. Quality holds
  // because rule requires roe > 18 strictly (we have 18). Everyone else HOLDs.
  {
    label: "Low-vol defensive (beta 0.3, cash 15%, lowvol BUY)",
    ticker: "LOW",
    metrics: base("LOW", {
      beta: 0.3,
      dividend_yield_pct: 3.5,
      momentum_12m_pct: 4,
      roe_pct: 18,
      cash_pct_of_assets: 15,
      pe_ratio: 18,
      debt_to_equity: 0.4,
      net_margin_pct: 12,
    }),
    expected: {
      hard_flag_metrics: [],
      soft_flag_metrics: [],
      final_recommendation: "HOLD",
      data_quality_penalty_min: 0,
    },
  },
];
