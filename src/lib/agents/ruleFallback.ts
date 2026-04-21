import type { MetricFlag, StockMetricsPayload } from "@/lib/metrics/types";
import type { AgentVote } from "@/lib/consensus";

function flagNote(kind: string, names: string[], flags: MetricFlag[]): string {
  const hits = flags.filter((f) => names.includes(f.metric) && f.severity === "hard");
  if (!hits.length) return "";
  return `Hard-flagged: ${hits.map((h) => `${h.metric} (${h.reason})`).join("; ")}. Rule-based ${kind} vote suppressed.`;
}

/** Deterministic heuristic votes from metrics only (no LLM). For tests / degraded mode. */
export function ruleBasedVotes(m: StockMetricsPayload): AgentVote[] {
  const hardFlags = new Set(
    m.metric_flags.filter((f) => f.severity === "hard").map((f) => f.metric),
  );

  const value: AgentVote = {
    agent: "value",
    recommendation: "HOLD",
    confidence: 55,
    thesis: "Rule: valuation screens from FCF yield and P/B.",
    key_metric: `FCF yield ${m.fcf_yield_pct?.toFixed(2) ?? "N/A"}%`,
    key_risk: "Accounting quality and cycle risk.",
  };
  {
    const buyDisabled =
      hardFlags.has("fcf_yield_pct") || hardFlags.has("fcf_vs_earnings_ratio");
    const sellDisabled = hardFlags.has("fcf_yield_pct") || hardFlags.has("pe_ratio");
    if (buyDisabled && sellDisabled) {
      value.confidence = 50;
      value.key_risk = flagNote(
        "value",
        ["fcf_yield_pct", "pb_ratio", "fcf_vs_earnings_ratio", "pe_ratio"],
        m.metric_flags,
      );
    } else if (
      !buyDisabled &&
      m.fcf_yield_pct !== null &&
      m.fcf_yield_pct > 6 &&
      (m.pb_ratio ?? 99) < 3
    ) {
      value.recommendation = "BUY";
      value.confidence = 72;
    } else if (
      !sellDisabled &&
      (m.fcf_yield_pct ?? 0) < 2 &&
      (m.pe_ratio ?? 0) > 35
    ) {
      value.recommendation = "SELL";
      value.confidence = 60;
    }
  }

  const momentum: AgentVote = {
    agent: "momentum",
    recommendation: "HOLD",
    confidence: 58,
    thesis: "Rule: 12m trend vs moving averages.",
    key_metric: `12m ${m.momentum_12m_pct?.toFixed(1) ?? "N/A"}%`,
    key_risk: "Trend reversal.",
  };
  {
    const disabled =
      hardFlags.has("momentum_12m_pct") || hardFlags.has("price_vs_ma_200_pct");
    if (disabled) {
      momentum.confidence = 50;
      momentum.key_risk = flagNote(
        "momentum",
        ["momentum_12m_pct", "price_vs_ma_200_pct"],
        m.metric_flags,
      );
    } else if (
      m.momentum_12m_pct !== null &&
      m.momentum_12m_pct > 15 &&
      (m.price_vs_ma_200_pct ?? -1) > 0
    ) {
      momentum.recommendation = "BUY";
      momentum.confidence = 70;
    } else if (m.momentum_12m_pct !== null && m.momentum_12m_pct < -15) {
      momentum.recommendation = "SELL";
      momentum.confidence = 65;
    }
  }

  const quality: AgentVote = {
    agent: "quality",
    recommendation: "HOLD",
    confidence: 60,
    thesis: "Rule: ROE and earnings stability.",
    key_metric: `ROE ${m.roe_pct?.toFixed(1) ?? "N/A"}%`,
    key_risk: "Moat erosion.",
  };
  if (hardFlags.has("roe_pct")) {
    quality.confidence = 50;
    quality.key_risk = flagNote(
      "quality",
      ["roe_pct", "debt_to_equity"],
      m.metric_flags,
    );
  } else if (m.roe_pct !== null && m.roe_pct > 18 && (m.debt_to_equity ?? 2) < 1) {
    quality.recommendation = "BUY";
    quality.confidence = 75;
  } else if (m.roe_pct !== null && m.roe_pct < 8) {
    quality.recommendation = "SELL";
    quality.confidence = 62;
  }

  const contrarian: AgentVote = {
    agent: "contrarian",
    recommendation: "HOLD",
    confidence: 52,
    thesis: "Rule: valuation vs anchors and yield stretch.",
    key_metric: `P/E vs anchor ${m.pe_vs_5y_avg_ratio?.toFixed(2) ?? "N/A"}`,
    key_risk: "Value trap.",
  };
  if (hardFlags.has("pe_ratio")) {
    contrarian.confidence = 50;
    contrarian.key_risk = flagNote(
      "contrarian",
      ["pe_ratio", "pe_vs_5y_avg_ratio"],
      m.metric_flags,
    );
  } else if (m.pe_vs_5y_avg_ratio !== null && m.pe_vs_5y_avg_ratio < 0.85) {
    contrarian.recommendation = "BUY";
    contrarian.confidence = 68;
  } else if (m.pe_vs_5y_avg_ratio !== null && m.pe_vs_5y_avg_ratio > 1.25) {
    contrarian.recommendation = "SELL";
    contrarian.confidence = 58;
  }

  const macro: AgentVote = {
    agent: "macro",
    recommendation: "HOLD",
    confidence: 55,
    thesis: "Rule: beta vs rate environment proxy.",
    key_metric: `Beta ${m.beta?.toFixed(2) ?? "N/A"}`,
    key_risk: "Rates and multiples.",
  };
  if (hardFlags.has("beta")) {
    macro.confidence = 50;
    macro.key_risk = flagNote(
      "macro",
      ["beta", "treasury_10y_pct", "earnings_growth_consensus_pct"],
      m.metric_flags,
    );
  } else if (hardFlags.has("earnings_growth_consensus_pct")) {
    macro.confidence = 50;
    macro.key_risk = flagNote(
      "macro",
      ["earnings_growth_consensus_pct", "treasury_10y_pct", "beta"],
      m.metric_flags,
    );
  } else if ((m.treasury_10y_pct ?? 0) < 4 && (m.beta ?? 1) > 1.2) {
    macro.recommendation = "BUY";
    macro.confidence = 62;
  } else if ((m.treasury_10y_pct ?? 0) > 5 && (m.beta ?? 0) > 1.3) {
    macro.recommendation = "SELL";
    macro.confidence = 64;
  }

  const lowvol: AgentVote = {
    agent: "lowvol",
    recommendation: "HOLD",
    confidence: 56,
    thesis: "Rule: defensive profile from beta and cash.",
    key_metric: `Beta ${m.beta?.toFixed(2) ?? "N/A"}`,
    key_risk: "Stagnation.",
  };
  if (hardFlags.has("beta")) {
    lowvol.confidence = 50;
    lowvol.key_risk = flagNote(
      "lowvol",
      ["beta", "cash_pct_of_assets"],
      m.metric_flags,
    );
  } else if ((m.beta ?? 1) < 0.85 && (m.cash_pct_of_assets ?? 0) > 8) {
    lowvol.recommendation = "BUY";
    lowvol.confidence = 66;
  } else if ((m.beta ?? 0) > 1.4) {
    lowvol.recommendation = "SELL";
    lowvol.confidence = 60;
  }

  return [value, momentum, quality, contrarian, macro, lowvol];
}
