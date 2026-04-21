import type { MetricFlag, MetricFamily, StockMetricsPayload } from "./types";

// Bounds are calibrated to S&P 500 distributions so they flag hallucination,
// not legitimate outliers. "hard" = do-not-trust without external confirmation;
// "soft" = informational, agents may still act on the metric with caution.
//
// ROE %:  S&P 500 median ~15%, top decile ~30%, top 1% ~45%, top 0.1% >60%.
//   hard: value > 60 or value < -30
//   soft: value > 35 or value < 0
//   (High-leverage financials or low-equity defense firms may legitimately sit at
//    25-35%; these produce a SOFT flag that is informational, not disqualifying.)
//
// FCF / Net income: healthy 0.7-1.2x; heavy-capex 0.5-1.5x; rare SaaS up to ~1.4x.
//   hard: value < -0.5 or value > 2.0   (impossible w/o massive WC release or one-time item)
//   soft: value < 0.5 or value > 1.3
//
// Earnings growth YoY %: S&P long-run ~7%; top decile ~40%.
//   hard: value < -75 or value > 75     (M&A, restatement, or one-time)
//   soft: value < -30 or value > 50
//
// Net margin %: hard if > 60 or < -50.
// P/E trailing:  hard if < 0 or > 120;  soft if > 80.
// Beta 5y:       soft if < 0.1 or > 3.

export const METRIC_GLOSSARY: Readonly<Record<string, MetricFamily>> = {
  // fundamental
  pe_ratio: "fundamental",
  forward_pe: "fundamental",
  pb_ratio: "fundamental",
  ps_ratio: "fundamental",
  dividend_yield_pct: "fundamental",
  roe_pct: "fundamental",
  net_margin_pct: "fundamental",
  debt_to_equity: "fundamental",
  debt_to_ebitda: "fundamental",
  fcf: "fundamental",
  net_income: "fundamental",
  fcf_yield_pct: "fundamental",
  fcf_vs_earnings_ratio: "fundamental",
  revenue: "fundamental",
  cash_pct_of_assets: "fundamental",
  pe_vs_5y_avg_ratio: "fundamental",
  pe_5y_avg: "fundamental",
  div_yield_vs_5y_avg_ratio: "fundamental",
  div_yield_5y_avg_pct: "fundamental",
  analyst_downgrades_3mo: "fundamental",
  short_interest_pct: "fundamental",
  earnings_growth_consensus_pct: "fundamental",
  earnings_consensus_std_pct: "fundamental",
  earnings_volatility_coeff: "fundamental",
  insider_buys_3mo: "fundamental",
  insider_sells_3mo: "fundamental",
  news_sentiment_score: "fundamental",
  market_cap: "fundamental",
  enterprise_value: "fundamental",
  sector_pb_median_proxy: "fundamental",
  sector_roe_median_proxy: "fundamental",
  sector_short_median_proxy: "fundamental",
  // price
  price: "price",
  momentum_12m_pct: "price",
  price_vs_ma_50_pct: "price",
  price_vs_ma_200_pct: "price",
  ma_50: "price",
  ma_200: "price",
  beta: "price",
  semi_deviation_monthly: "price",
  // macro
  treasury_10y_pct: "macro",
  yield_spread_vs_treasury_pct: "macro",
};

interface Rule {
  metric: keyof StockMetricsPayload;
  check: (v: number) => { severity: "soft" | "hard"; reason: string } | null;
}

const RULES: Rule[] = [
  {
    metric: "roe_pct",
    check: (v) => {
      if (v > 60)
        return {
          severity: "hard",
          reason: `ROE ${v.toFixed(1)}% exceeds S&P 500 top-0.1% threshold (60); likely TTM miscalc or accounting artifact`,
        };
      if (v < -30)
        return {
          severity: "hard",
          reason: `ROE ${v.toFixed(1)}% indicates severe distress; verify against 10-K`,
        };
      if (v > 35)
        return {
          severity: "soft",
          reason: `ROE ${v.toFixed(1)}% is top-decile; legitimate for banks/defense, but verify sustainability`,
        };
      if (v < 0)
        return {
          severity: "soft",
          reason: `Negative ROE ${v.toFixed(1)}%; verify loss is ongoing vs one-time`,
        };
      return null;
    },
  },
  {
    metric: "fcf_vs_earnings_ratio",
    check: (v) => {
      if (v < -0.5)
        return {
          severity: "hard",
          reason: `FCF/NI ${v.toFixed(2)}x is implausibly negative; likely denominator sign flip or one-time loss`,
        };
      if (v > 2.0)
        return {
          severity: "hard",
          reason: `FCF/NI ${v.toFixed(2)}x exceeds 2.0 ceiling; requires massive WC release or one-time item to be real`,
        };
      if (v < 0.5)
        return {
          severity: "soft",
          reason: `FCF/NI ${v.toFixed(2)}x below 0.5 suggests cash conversion issues or heavy capex; verify`,
        };
      if (v > 1.3)
        return {
          severity: "soft",
          reason: `FCF/NI ${v.toFixed(2)}x above 1.3 is unusual outside rare SaaS profiles; verify non-recurring items`,
        };
      return null;
    },
  },
  {
    metric: "earnings_growth_consensus_pct",
    check: (v) => {
      if (v > 75)
        return {
          severity: "hard",
          reason: `Earnings growth ${v.toFixed(1)}% exceeds 75% ceiling; likely M&A, restatement, or one-time event`,
        };
      if (v < -75)
        return {
          severity: "hard",
          reason: `Earnings growth ${v.toFixed(1)}% below -75% implies collapse; verify against filings`,
        };
      if (v > 50)
        return {
          severity: "soft",
          reason: `Earnings growth ${v.toFixed(1)}% is well above top-decile (~40%); verify sustainability`,
        };
      if (v < -30)
        return {
          severity: "soft",
          reason: `Earnings growth ${v.toFixed(1)}% is a steep decline; verify cause`,
        };
      return null;
    },
  },
  {
    metric: "net_margin_pct",
    check: (v) => {
      if (v > 60)
        return {
          severity: "hard",
          reason: `Net margin ${v.toFixed(1)}% exceeds 60% ceiling; implausible outside licensing/royalty-pure businesses`,
        };
      if (v < -50)
        return {
          severity: "hard",
          reason: `Net margin ${v.toFixed(1)}% below -50% indicates severe distress or one-time impairment`,
        };
      return null;
    },
  },
  {
    metric: "pe_ratio",
    check: (v) => {
      if (v < 0)
        return {
          severity: "hard",
          reason: `Trailing P/E ${v.toFixed(1)} is negative; earnings are negative and P/E is not meaningful`,
        };
      if (v > 120)
        return {
          severity: "hard",
          reason: `Trailing P/E ${v.toFixed(1)} exceeds 120; likely near-zero earnings denominator`,
        };
      if (v > 80)
        return {
          severity: "soft",
          reason: `Trailing P/E ${v.toFixed(1)} is extreme; verify earnings base is not suppressed by one-time items`,
        };
      return null;
    },
  },
  {
    metric: "beta",
    check: (v) => {
      if (v < 0.1)
        return {
          severity: "soft",
          reason: `Beta ${v.toFixed(2)} is implausibly low for an active equity; verify regression window`,
        };
      if (v > 3)
        return {
          severity: "soft",
          reason: `Beta ${v.toFixed(2)} is extreme; position sizing should account for tail risk`,
        };
      return null;
    },
  },
];

export function validateMetrics(m: StockMetricsPayload): StockMetricsPayload {
  const flags: MetricFlag[] = [];
  for (const rule of RULES) {
    const value = m[rule.metric];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    const hit = rule.check(value);
    if (!hit) continue;
    const family = METRIC_GLOSSARY[rule.metric as string] ?? "fundamental";
    flags.push({
      metric: rule.metric as string,
      value,
      severity: hit.severity,
      family,
      reason: hit.reason,
    });
  }
  return { ...m, metric_flags: flags };
}
