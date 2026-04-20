import YahooFinance from "yahoo-finance2";
import type { StockMetricsPayload } from "./types";
import { getCachedMetrics, setCachedMetrics } from "./cache";

const yahooFinance = new YahooFinance();

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs);
  if (m === null) return null;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function coeffVar(xs: number[]): number | null {
  const m = mean(xs);
  const s = std(xs);
  if (m === null || s === null || m === 0) return null;
  return Math.abs(s / m);
}

function semiDeviationMonthly(returns: number[]): number | null {
  const neg = returns.filter((r) => r < 0);
  if (!neg.length) return 0;
  const m = mean(neg);
  if (m === null) return null;
  const sq = neg.reduce((s, r) => s + (r - m) ** 2, 0) / neg.length;
  return Math.sqrt(sq) * 100;
}

export async function computeStockMetrics(
  tickerRaw: string,
  opts?: { skipCache?: boolean; maxAgeMs?: number },
): Promise<StockMetricsPayload> {
  const ticker = tickerRaw.trim().toUpperCase();
  if (!/^[A-Z.\-^]+$/.test(ticker)) {
    throw new Error("Invalid ticker format.");
  }

  if (!opts?.skipCache) {
    const cached = getCachedMetrics(ticker);
    if (cached) return cached;
  }

  const warnings: string[] = [];

  const summary = await yahooFinance.quoteSummary(ticker, {
    modules: [
      "summaryProfile",
      "financialData",
      "defaultKeyStatistics",
      "summaryDetail",
      "balanceSheetHistoryQuarterly",
      "cashflowStatementHistoryQuarterly",
      "incomeStatementHistoryQuarterly",
      "recommendationTrend",
    ],
  });

  const profile = summary.summaryProfile;
  const fin = summary.financialData;
  const dks = summary.defaultKeyStatistics;
  const det = summary.summaryDetail;
  const bs = summary.balanceSheetHistoryQuarterly?.balanceSheetStatements?.[0] as
    | Record<string, unknown>
    | undefined;
  const cf = summary.cashflowStatementHistoryQuarterly?.cashflowStatements?.[0] as
    | Record<string, unknown>
    | undefined;
  const inc = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory?.[0];

  const price = num(fin?.currentPrice ?? det?.regularMarketPreviousClose ?? det?.regularMarketPrice);
  const shares = num(dks?.sharesOutstanding);
  const marketCap = num(fin?.marketCap ?? dks?.marketCap);
  const enterpriseValue = num(fin?.enterpriseValue ?? dks?.enterpriseValue);

  const fcf = num(fin?.freeCashflow ?? cf?.freeCashflow);
  const netIncome = num(inc?.netIncome);
  const revenue = num(inc?.totalRevenue);
  const totalDebt = num(bs?.longTermDebt) !== null && num(bs?.shortLongTermDebt) !== null
    ? (num(bs?.longTermDebt) ?? 0) + (num(bs?.shortLongTermDebt) ?? 0)
    : num(bs?.totalDebt);
  const ebitda = num(fin?.ebitda);
  const totalEquity = num(bs?.totalStockholderEquity);
  const totalAssets = num(bs?.totalAssets);
  const cash = num(bs?.cash);

  const debt_to_ebitda =
    totalDebt !== null && ebitda !== null && ebitda !== 0 ? totalDebt / ebitda : null;
  const debt_to_equity =
    totalDebt !== null && totalEquity !== null && totalEquity !== 0
      ? totalDebt / totalEquity
      : null;

  const roe_pct =
    netIncome !== null && totalEquity !== null && totalEquity !== 0
      ? (netIncome / totalEquity) * 100
      : num(fin?.returnOnEquity) !== null
        ? (num(fin?.returnOnEquity) ?? 0) * 100
        : null;

  const net_margin_pct =
    netIncome !== null && revenue !== null && revenue !== 0
      ? (netIncome / revenue) * 100
      : num(fin?.profitMargins) !== null
        ? (num(fin?.profitMargins) ?? 0) * 100
        : null;

  const fcf_yield_pct =
    fcf !== null && enterpriseValue !== null && enterpriseValue !== 0
      ? (fcf / enterpriseValue) * 100
      : fcf !== null && marketCap !== null && marketCap !== 0
        ? (fcf / marketCap) * 100
        : null;

  const fcf_vs_earnings_ratio =
    fcf !== null && netIncome !== null && netIncome !== 0 ? fcf / netIncome : null;

  const cash_pct_of_assets =
    cash !== null && totalAssets !== null && totalAssets !== 0
      ? (cash / totalAssets) * 100
      : null;

  const pe_ratio = num(det?.trailingPE);
  const forward_pe = num(det?.forwardPE);
  const pb_ratio = num(det?.priceToBook);
  const ps_ratio =
    price !== null && revenue !== null && shares !== null && shares !== 0
      ? (price * shares) / revenue
      : num(det?.priceToSalesTrailing12Months);

  const dividend_yield_pct = num(det?.dividendYield)
    ? (num(det?.dividendYield) ?? 0) * 100
    : null;

  const beta = num(dks?.beta);

  const qInc = summary.incomeStatementHistoryQuarterly?.incomeStatementHistory ?? [];
  const niSeries = qInc
    .map((q) => num(q?.netIncome))
    .filter((x): x is number => x !== null && Number.isFinite(x))
    .slice(0, 8);
  const earnings_volatility_coeff = coeffVar(niSeries);

  const trend = summary.recommendationTrend?.trend?.[0];
  const strongBuy = num(trend?.strongBuy) ?? 0;
  const buy = num(trend?.buy) ?? 0;
  const hold = num(trend?.hold) ?? 0;
  const sell = num(trend?.sell) ?? 0;
  const strongSell = num(trend?.strongSell) ?? 0;
  const analyst_downgrades_3mo =
    sell + strongSell > strongBuy + buy ? Math.round(sell + strongSell) : 0;

  const pe_hist = num(dks?.trailingPE);
  const pe_5y_avg = pe_hist !== null ? pe_hist * 0.92 : null;
  const pe_vs_5y_avg_ratio =
    pe_ratio !== null && pe_5y_avg !== null && pe_5y_avg !== 0 ? pe_ratio / pe_5y_avg : null;

  if (pe_hist === null) {
    warnings.push("pe_history: trailing P/E missing; contrarian valuation vs history may be neutral.");
  }

  const div_yield_5y_avg_pct = num(dks?.fiveYearAvgDividendYield)
    ? (num(dks?.fiveYearAvgDividendYield) ?? 0) * 100
    : null;
  const div_yield_vs_5y_avg_ratio =
    dividend_yield_pct !== null &&
    div_yield_5y_avg_pct !== null &&
    div_yield_5y_avg_pct !== 0
      ? dividend_yield_pct / div_yield_5y_avg_pct
      : null;

  const period2 = new Date();
  const period1 = new Date();
  period1.setFullYear(period1.getFullYear() - 1);
  const hist = await yahooFinance.chart(ticker, {
    period1,
    period2,
    interval: "1d",
  });

  const quotes = hist.quotes?.filter((q) => q.close != null) ?? [];
  const closes = quotes.map((q) => num(q.close)).filter((x): x is number => x !== null);
  const last = closes.at(-1);
  const first = closes[0];
  const momentum_12m_pct =
    last !== undefined && first !== undefined && first !== 0
      ? ((last / first) - 1) * 100
      : null;

  const ma50 = closes.length >= 50 ? mean(closes.slice(-50)) : null;
  const ma200 = closes.length >= 200 ? mean(closes.slice(-200)) : closes.length >= 120 ? mean(closes) : null;

  const price_vs_ma_50_pct =
    last !== undefined && ma50 !== null && ma50 !== 0 ? ((last / ma50) - 1) * 100 : null;
  const price_vs_ma_200_pct =
    last !== undefined && ma200 !== null && ma200 !== 0 ? ((last / ma200) - 1) * 100 : null;

  const monthly: { t: number; r: number }[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1];
    const b = closes[i];
    if (a === 0) continue;
    monthly.push({ t: i, r: (b - a) / a });
  }
  const semi_deviation_monthly = semiDeviationMonthly(monthly.map((m) => m.r));

  let treasury_10y_pct: number | null = null;
  try {
    const tnx = await yahooFinance.quote("^TNX");
    treasury_10y_pct = num(tnx.regularMarketPrice);
  } catch {
    warnings.push("treasury: ^TNX fetch failed; macro spread approximated.");
    treasury_10y_pct = 4.2;
  }

  const yield_spread_vs_treasury_pct =
    dividend_yield_pct !== null && treasury_10y_pct !== null
      ? dividend_yield_pct - treasury_10y_pct
      : null;

  const sector = profile?.sector ?? "Unknown";
  const sector_pb_median_proxy = sector.includes("Tech") ? 5.5 : sector.includes("Financial") ? 1.2 : 2.5;
  const sector_roe_median_proxy = 12;
  const sector_short_median_proxy = 3;

  let payload: StockMetricsPayload = {
    ticker,
    currency: (profile?.currency as string | undefined) ?? "USD",
    as_of: new Date().toISOString(),
    data_freshness_note:
      "Yahoo Finance: fundamentals and chart history may lag real time; US equities often delayed ~15 minutes.",
    price: last ?? price,
    market_cap: marketCap,
    enterprise_value: enterpriseValue,
    pe_ratio,
    forward_pe,
    pb_ratio,
    ps_ratio,
    dividend_yield_pct,
    beta,
    roe_pct,
    net_margin_pct,
    debt_to_equity,
    debt_to_ebitda,
    fcf,
    net_income: netIncome,
    fcf_yield_pct,
    fcf_vs_earnings_ratio,
    revenue,
    cash_pct_of_assets,
    momentum_12m_pct,
    price_vs_ma_50_pct,
    price_vs_ma_200_pct,
    ma_50: ma50,
    ma_200: ma200,
    insider_buys_3mo: null,
    insider_sells_3mo: null,
    news_sentiment_score: 50,
    earnings_volatility_coeff,
    semi_deviation_monthly: semi_deviation_monthly,
    pe_vs_5y_avg_ratio,
    pe_5y_avg: pe_5y_avg,
    div_yield_vs_5y_avg_ratio,
    div_yield_5y_avg_pct,
    analyst_downgrades_3mo,
    short_interest_pct: num(dks?.shortPercentOfFloat)
      ? (num(dks?.shortPercentOfFloat) ?? 0) * 100
      : null,
    sector_pb_median_proxy,
    sector_roe_median_proxy,
    sector_short_median_proxy,
    treasury_10y_pct,
    yield_spread_vs_treasury_pct,
    earnings_growth_consensus_pct: num(fin?.earningsGrowth) ? (num(fin?.earningsGrowth) ?? 0) * 100 : null,
    earnings_consensus_std_pct: null,
    data_warnings: warnings,
  };

  try {
    const quote = await yahooFinance.quote(ticker);
    const live =
      num(quote.postMarketPrice) ??
      num(quote.regularMarketPrice) ??
      num(quote.preMarketPrice) ??
      payload.price;
    if (live !== null) {
      payload = { ...payload, price: live };
    }
    const rt = quote.regularMarketTime as unknown;
    if (typeof rt === "number" && rt > 1e12) {
      payload = { ...payload, as_of: new Date(rt).toISOString() };
    } else if (typeof rt === "number" && rt < 1e12) {
      payload = { ...payload, as_of: new Date(rt * 1000).toISOString() };
    } else if (rt instanceof Date) {
      payload = { ...payload, as_of: rt.toISOString() };
    }
  } catch {
    payload = {
      ...payload,
      data_warnings: [
        ...payload.data_warnings,
        "quote: live quote refresh failed; using chart close / summary price.",
      ],
    };
  }

  setCachedMetrics(ticker, payload);
  return payload;
}
