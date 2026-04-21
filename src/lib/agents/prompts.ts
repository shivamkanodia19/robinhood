import type { AgentKind } from "@/lib/metrics/types";
import type { StockMetricsPayload } from "@/lib/metrics/types";

function fmt(n: number | null | undefined, suffix = "", digits = 2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "N/A";
  return `${n.toFixed(digits)}${suffix}`;
}

function dataPreamble(m: StockMetricsPayload): string {
  const note =
    m.data_freshness_note ??
    "Figures are from Yahoo Finance; prices can be delayed ~15 minutes depending on exchange.";
  return `DATA SNAPSHOT for ${m.ticker}: assembled at ${m.as_of} (UTC). ${note}

`;
}

/**
 * Full canonical snapshot of every numeric field any agent may cite.
 * Every persona sees the same SHARED FACTS so they can cross-reference.
 * Field order groups related metrics; lines use canonical field names so agents
 * can echo them back for Phase 4 grounding.
 */
export function sharedFacts(m: StockMetricsPayload): string {
  const lines: string[] = [
    "SHARED FACTS (canonical field names; cite these verbatim):",
    // Valuation
    `- pe_ratio (trailing): ${fmt(m.pe_ratio)}`,
    `- forward_pe: ${fmt(m.forward_pe)}`,
    `- pb_ratio: ${fmt(m.pb_ratio)}`,
    `- ps_ratio: ${fmt(m.ps_ratio)}`,
    `- pe_vs_5y_avg_ratio: ${fmt(m.pe_vs_5y_avg_ratio)}`,
    `- pe_5y_avg: ${fmt(m.pe_5y_avg)}`,
    // Quality
    `- roe_pct: ${fmt(m.roe_pct, "%")}`,
    `- net_margin_pct: ${fmt(m.net_margin_pct, "%")}`,
    `- debt_to_equity: ${fmt(m.debt_to_equity)}`,
    `- debt_to_ebitda: ${fmt(m.debt_to_ebitda)}`,
    `- earnings_volatility_coeff: ${fmt(m.earnings_volatility_coeff)}`,
    // Cash
    `- fcf: ${fmt(m.fcf)}`,
    `- net_income: ${fmt(m.net_income)}`,
    `- fcf_yield_pct: ${fmt(m.fcf_yield_pct, "%")}`,
    `- fcf_vs_earnings_ratio: ${fmt(m.fcf_vs_earnings_ratio)}`,
    `- revenue: ${fmt(m.revenue)}`,
    `- cash_pct_of_assets: ${fmt(m.cash_pct_of_assets, "%")}`,
    // Price
    `- price: ${fmt(m.price)}`,
    `- momentum_12m_pct: ${fmt(m.momentum_12m_pct, "%")}`,
    `- price_vs_ma_50_pct: ${fmt(m.price_vs_ma_50_pct, "%")}`,
    `- price_vs_ma_200_pct: ${fmt(m.price_vs_ma_200_pct, "%")}`,
    `- ma_50: ${fmt(m.ma_50)}`,
    `- ma_200: ${fmt(m.ma_200)}`,
    `- beta: ${fmt(m.beta)}`,
    `- semi_deviation_monthly: ${fmt(m.semi_deviation_monthly)}`,
    // Income
    `- dividend_yield_pct: ${fmt(m.dividend_yield_pct, "%")}`,
    `- div_yield_5y_avg_pct: ${fmt(m.div_yield_5y_avg_pct, "%")}`,
    `- div_yield_vs_5y_avg_ratio: ${fmt(m.div_yield_vs_5y_avg_ratio)}`,
    // Macro
    `- treasury_10y_pct: ${fmt(m.treasury_10y_pct, "%")}`,
    `- yield_spread_vs_treasury_pct: ${fmt(m.yield_spread_vs_treasury_pct, "%")}`,
    // Growth
    `- earnings_growth_consensus_pct: ${fmt(m.earnings_growth_consensus_pct, "%")}`,
    `- earnings_consensus_std_pct: ${fmt(m.earnings_consensus_std_pct, "%")}`,
    // Analyst / Short
    `- analyst_downgrades_3mo: ${m.analyst_downgrades_3mo ?? "N/A"}`,
    `- short_interest_pct: ${fmt(m.short_interest_pct, "%")}`,
    // Sector proxies (labeled as proxy, not live)
    `- sector_pb_median_proxy (proxy, not live): ${fmt(m.sector_pb_median_proxy)}`,
    `- sector_roe_median_proxy (proxy, not live): ${fmt(m.sector_roe_median_proxy, "%")}`,
    `- sector_short_median_proxy (proxy, not live): ${fmt(m.sector_short_median_proxy, "%")}`,
  ];
  return lines.join("\n");
}

export function flagsSection(m: StockMetricsPayload): string {
  if (!m.metric_flags || m.metric_flags.length === 0) {
    return "FLAGS: none";
  }
  const rendered = m.metric_flags
    .map((f) => {
      const valueStr = f.value === null || f.value === undefined ? "N/A" : String(f.value);
      return `- [${f.severity.toUpperCase()}] ${f.metric} = ${valueStr}: ${f.reason}`;
    })
    .join("\n");
  return `FLAGS:\n${rendered}`;
}

const FLAG_HANDLING = `FLAG HANDLING:
- If a HARD-flagged metric is your PRIMARY signal, reduce your confidence by 25 points (floor 50).
- You may still vote BUY or SELL on a hard-flagged primary signal ONLY if you can cite at least 2 independent, non-flagged metrics in your thesis that support the same direction. Otherwise default to HOLD with confidence ≤ 50 and explain in key_risk.
- SOFT flags should temper conviction (-10 confidence) but do not force HOLD.
- Always reference metrics using their canonical field names from SHARED FACTS (e.g. roe_pct, not "ROE").
- key_risk must name which flagged metrics you relied on, if any.`;

const OUTPUT_INSTRUCTION = `OUTPUT:
Return strict JSON only with keys: recommendation (BUY|HOLD|SELL), confidence (0-100 integer), thesis (string, max 2 sentences), key_metric (string — cite a canonical field name from SHARED FACTS), key_risk (string).
Temperature 0 discipline: same numbers => same recommendation class.`;

interface PersonaSpec {
  lens: string;
  focus: string[];
  rules: string;
}

const PERSONAS: Record<AgentKind, PersonaSpec> = {
  value: {
    lens: "You are a value investor. The market may misprice fundamentals; find bargains where free cash flow and earnings power exceed the market price.",
    focus: [
      "fcf_yield_pct",
      "pb_ratio",
      "ps_ratio",
      "fcf_vs_earnings_ratio",
      "debt_to_ebitda",
      "pe_ratio",
      "sector_pb_median_proxy",
    ],
    rules:
      "DECISION RULES:\n- High fcf_yield_pct (>6%) with healthy fcf_vs_earnings_ratio (0.7-1.3) and moderate debt_to_ebitda (<3) supports BUY.\n- Stretched pb_ratio or ps_ratio relative to sector_pb_median_proxy without cash-flow support argues SELL/HOLD.\n- Ignore narrative; base recommendation on the numbers.",
  },
  momentum: {
    lens: "You are a momentum trader. Trends in price and fundamentals persist over 3-12 months when they align.",
    focus: [
      "momentum_12m_pct",
      "price_vs_ma_200_pct",
      "price_vs_ma_50_pct",
      "price",
      "ma_50",
      "ma_200",
      "earnings_growth_consensus_pct",
    ],
    rules:
      "DECISION RULES:\n- Strongly positive momentum_12m_pct with price > ma_200 (positive price_vs_ma_200_pct) leans BUY unless extended.\n- Strongly negative momentum_12m_pct with price < ma_200 leans SELL.\n- Flat trend or conflicting MA signals => HOLD.",
  },
  quality: {
    lens: "You are a quality investor. Quality compounds via moat, high ROE, and predictable earnings.",
    focus: [
      "roe_pct",
      "net_margin_pct",
      "debt_to_equity",
      "earnings_volatility_coeff",
      "sector_roe_median_proxy",
      "fcf_vs_earnings_ratio",
    ],
    rules:
      "DECISION RULES:\n- Durable roe_pct above sector_roe_median_proxy with low debt_to_equity and low earnings_volatility_coeff => BUY bias.\n- Deteriorating net_margin_pct or rising debt_to_equity argues caution.\n- Weak fcf_vs_earnings_ratio (<0.6) undermines reported quality.",
  },
  contrarian: {
    lens: "You are a contrarian / mean-reversion investor. Sentiment extremes and valuation gaps revert; you look for mispricings against a stock's own history.",
    focus: [
      "pe_ratio",
      "pe_vs_5y_avg_ratio",
      "dividend_yield_pct",
      "div_yield_vs_5y_avg_ratio",
      "short_interest_pct",
      "analyst_downgrades_3mo",
    ],
    rules:
      "DECISION RULES:\n- pe_vs_5y_avg_ratio < 0.8 with div_yield_vs_5y_avg_ratio > 1.1 hints at unloved-but-cheap => BUY bias, unless fundamentals confirm a value trap.\n- Elevated short_interest_pct vs sector_short_median_proxy plus rising analyst_downgrades_3mo can still be contrarian BUY if cash-flow metrics are intact.\n- Avoid BUY when pe_ratio is extended and margins/leverage (net_margin_pct, debt_to_equity) have deteriorated.",
  },
  macro: {
    lens: "You are a macro / duration investor. Rates, beta, and yield spreads dominate the tape for long-duration cash flows.",
    focus: [
      "treasury_10y_pct",
      "beta",
      "yield_spread_vs_treasury_pct",
      "earnings_growth_consensus_pct",
      "dividend_yield_pct",
    ],
    rules:
      "DECISION RULES:\n- Rising treasury_10y_pct hurts high-beta, long-duration cash flows; trim BUY conviction on high-beta names.\n- Positive yield_spread_vs_treasury_pct with low beta is attractive for income-oriented macro BUY.\n- Weak earnings_growth_consensus_pct combined with rich valuation argues SELL/HOLD.",
  },
  lowvol: {
    lens: "You are a defensive / low-volatility investor. Your job is ballast: accept lower upside for tighter drawdowns.",
    focus: [
      "beta",
      "semi_deviation_monthly",
      "earnings_volatility_coeff",
      "cash_pct_of_assets",
      "debt_to_equity",
    ],
    rules:
      "DECISION RULES:\n- Low beta, low semi_deviation_monthly, low earnings_volatility_coeff and healthy cash_pct_of_assets => acceptable defensive ballast (BUY-leaning).\n- Elevated beta or semi_deviation_monthly with thin cash_pct_of_assets and high debt_to_equity => SELL from a defensive sleeve.\n- BUY here means 'fits a defensive sleeve', not 'high expected return'.",
  },
};

function renderPrompt(kind: AgentKind, m: StockMetricsPayload): string {
  const persona = PERSONAS[kind];
  const focusLine = `FOCUS METRICS (prioritize these, but you may cite any field from SHARED FACTS): ${persona.focus.join(", ")}`;
  return `${dataPreamble(m)}${sharedFacts(m)}

${flagsSection(m)}

AGENT LENS: ${persona.lens}

${focusLine}

${persona.rules}

${FLAG_HANDLING}

${OUTPUT_INSTRUCTION}`;
}

export function buildAgentSystemPrompt(kind: AgentKind, metrics: StockMetricsPayload): string {
  return renderPrompt(kind, metrics);
}
