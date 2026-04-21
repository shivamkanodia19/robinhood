export type AgentKind =
  | "value"
  | "momentum"
  | "quality"
  | "contrarian"
  | "macro"
  | "lowvol";

export type MetricFamily = "fundamental" | "price" | "macro";

export interface MetricFlag {
  /** Field name from StockMetricsPayload, e.g. "roe_pct" */
  metric: string;
  value: number | null;
  severity: "soft" | "hard";
  family: MetricFamily;
  /** Human-readable rationale for the flag */
  reason: string;
}

export interface StockMetricsPayload {
  ticker: string;
  currency: string | null;
  /** ISO timestamp for when underlying Yahoo data was assembled (quote row may refresh this) */
  as_of: string;
  /** Human-readable note on data freshness (Yahoo delayed quotes, etc.) */
  data_freshness_note?: string;
  price: number | null;
  market_cap: number | null;
  enterprise_value: number | null;
  pe_ratio: number | null;
  forward_pe: number | null;
  pb_ratio: number | null;
  ps_ratio: number | null;
  dividend_yield_pct: number | null;
  beta: number | null;
  roe_pct: number | null;
  net_margin_pct: number | null;
  debt_to_equity: number | null;
  debt_to_ebitda: number | null;
  fcf: number | null;
  net_income: number | null;
  fcf_yield_pct: number | null;
  fcf_vs_earnings_ratio: number | null;
  revenue: number | null;
  cash_pct_of_assets: number | null;
  momentum_12m_pct: number | null;
  price_vs_ma_50_pct: number | null;
  price_vs_ma_200_pct: number | null;
  ma_50: number | null;
  ma_200: number | null;
  insider_buys_3mo: number | null;
  insider_sells_3mo: number | null;
  news_sentiment_score: number | null;
  earnings_volatility_coeff: number | null;
  semi_deviation_monthly: number | null;
  pe_vs_5y_avg_ratio: number | null;
  pe_5y_avg: number | null;
  div_yield_vs_5y_avg_ratio: number | null;
  div_yield_5y_avg_pct: number | null;
  analyst_downgrades_3mo: number | null;
  short_interest_pct: number | null;
  sector_pb_median_proxy: number | null;
  sector_roe_median_proxy: number | null;
  sector_short_median_proxy: number | null;
  treasury_10y_pct: number | null;
  yield_spread_vs_treasury_pct: number | null;
  earnings_growth_consensus_pct: number | null;
  earnings_consensus_std_pct: number | null;
  data_warnings: string[];
  metric_flags: MetricFlag[];
}
