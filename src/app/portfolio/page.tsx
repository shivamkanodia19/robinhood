"use client";

import { SellModal, type SellFillResult } from "@/components/portfolio/SellModal";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";

type Position = {
  id: string;
  ticker: string;
  shares: string;
  cost_basis: string;
  entry_date: string;
};

type Analysis = {
  id: string;
  ticker: string;
  analysis_date: string;
  final_recommendation: string;
  consensus_confidence: number;
};

type QuoteInfo = {
  price: number | null;
  regularMarketChangePercent: number | null;
  currency: string | null;
  as_of: string;
};

function formatMoney(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export default function PortfolioPage() {
  const { status } = useSession();
  const [positions, setPositions] = useState<Position[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteInfo>>({});
  const [ticker, setTicker] = useState("NVDA");
  const [shares, setShares] = useState("10");
  const [cost, setCost] = useState("120");
  const [entry, setEntry] = useState(new Date().toISOString().slice(0, 10));
  const [msg, setMsg] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [analysisId, setAnalysisId] = useState("");
  const [action, setAction] = useState<"followed" | "ignored" | "opposite">("followed");
  const [entryPrice, setEntryPrice] = useState("");
  const [currentPrice, setCurrentPrice] = useState("");
  const [outcomeMsg, setOutcomeMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  const [sellPosition, setSellPosition] = useState<Position | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [removeBusyId, setRemoveBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/portfolio");
    const data = await res.json();
    if (res.ok) setPositions(data.positions ?? []);
    const analysesRes = await fetch("/api/analyses/recent");
    const analysesData = await analysesRes.json();
    if (analysesRes.ok) {
      setAnalyses(analysesData.analyses ?? []);
      setAnalysisId((prev) => prev || analysesData.analyses?.[0]?.id || "");
    }
  }, []);

  const tickers = useMemo(
    () => positions.map((p) => p.ticker.toUpperCase()),
    [positions],
  );

  const refreshQuotes = useCallback(async () => {
    if (!tickers.length) {
      setQuotes({});
      return;
    }
    setQuotesLoading(true);
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (res.ok && data.quotes) setQuotes(data.quotes);
    } finally {
      setQuotesLoading(false);
    }
  }, [tickers]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    queueMicrotask(() => {
      void refreshQuotes();
    });
  }, [refreshQuotes]);

  const portfolioTotals = useMemo(() => {
    let cost = 0;
    let mkt = 0;
    for (const p of positions) {
      const sh = parseFloat(p.shares) || 0;
      const cb = parseFloat(p.cost_basis) || 0;
      const q = quotes[p.ticker.toUpperCase()];
      const px = q?.price ?? cb;
      cost += sh * cb;
      mkt += sh * px;
    }
    const pnl = mkt - cost;
    const pnlPct = cost !== 0 ? (pnl / cost) * 100 : 0;
    return { cost, mkt, pnl, pnlPct };
  }, [positions, quotes]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-[var(--rh-ink-soft)]">
        Loading…
      </div>
    );
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    const res = await fetch("/api/portfolio", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker,
        shares: parseFloat(shares),
        cost_basis: parseFloat(cost),
        entry_date: entry,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Failed");
      setSaving(false);
      return;
    }
    setMsg("Saved");
    setSaving(false);
    load();
  }

  function formatSellBanner(r: SellFillResult) {
    const pnl = r.realized_pnl >= 0 ? "+" : "";
    const tail = r.closed ? " · position closed" : " · partial fill";
    return `Sold ${r.shares_sold} ${r.ticker} @ market · est. P/L ${pnl}${formatMoney(r.realized_pnl, r.currency)}${tail}`;
  }

  async function removePosition(id: string, symbol: string) {
    if (
      !confirm(
        `Remove ${symbol} from your portfolio?\n\nThis deletes the row only (no sell, no tax-lot logic). Use Sell to close at market.`,
      )
    ) {
      return;
    }
    setNotice(null);
    setRemoveBusyId(id);
    try {
      const res = await fetch(`/api/portfolio/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setNotice({
          kind: "err",
          text: data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Remove failed",
        });
        return;
      }
      setNotice({ kind: "ok", text: `${symbol} removed from portfolio.` });
      await load();
    } finally {
      setRemoveBusyId(null);
    }
  }

  async function logOutcome(e: React.FormEvent) {
    e.preventDefault();
    setOutcomeMsg(null);
    setSavingOutcome(true);
    const res = await fetch("/api/recommendation-outcomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analysis_id: analysisId,
        user_action: action,
        action_date: new Date().toISOString().slice(0, 10),
        entry_price: parseFloat(entryPrice),
        current_price: parseFloat(currentPrice),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setOutcomeMsg(data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Failed to log outcome");
      setSavingOutcome(false);
      return;
    }
    setOutcomeMsg(`Outcome saved (return ${data.return_pct}%)`);
    setSavingOutcome(false);
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--rh-border)] pb-6">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--rh-green)]">
            Positions
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-[var(--rh-ink)]">
            Investing
          </h1>
          <p className="mt-1 text-sm text-[var(--rh-ink-soft)]">
            Paper portfolio: buys add lots, sells fill at Yahoo last price, removes delete rows — not a broker.
          </p>
        </div>
        <Link
          href="/"
          className="rounded-full border-2 border-[var(--rh-ink)] bg-[var(--rh-surface)] px-4 py-2 text-sm font-bold text-[var(--rh-ink)] shadow-[var(--retro-shadow-sm)] transition hover:-translate-y-0.5"
        >
          ← Council
        </Link>
      </header>

      <section className="rounded-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)] p-6 shadow-[var(--retro-shadow)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rh-ink-soft)]">
              Total portfolio
            </p>
            <p className="mt-1 font-mono text-4xl font-bold tabular-nums text-[var(--rh-ink)]">
              {formatMoney(portfolioTotals.mkt)}
            </p>
            <p
              className={`mt-1 font-mono text-sm font-semibold ${
                portfolioTotals.pnl >= 0 ? "text-[var(--rh-positive)]" : "text-[var(--rh-negative)]"
              }`}
            >
              {portfolioTotals.pnl >= 0 ? "+" : ""}
              {formatMoney(portfolioTotals.pnl)} ({portfolioTotals.pnlPct >= 0 ? "+" : ""}
              {portfolioTotals.pnlPct.toFixed(2)}%)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshQuotes()}
            disabled={quotesLoading || !tickers.length}
            className="rounded-lg border-2 border-[var(--rh-border)] bg-[var(--rh-surface-muted)] px-4 py-2 text-sm font-bold text-[var(--rh-ink)] hover:bg-white disabled:opacity-50"
          >
            {quotesLoading ? "Refreshing…" : "Refresh quotes"}
          </button>
        </div>
      </section>

      {notice && (
        <div
          className={`rounded-xl border-2 px-4 py-3 text-sm font-medium ${
            notice.kind === "err"
              ? "border-[var(--rh-negative)] bg-red-50 text-[var(--rh-negative)]"
              : "border-[var(--rh-green)] bg-emerald-50 text-[var(--rh-ink)]"
          }`}
        >
          {notice.text}
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {positions.map((p) => {
          const t = p.ticker.toUpperCase();
          const q = quotes[t];
          const sh = parseFloat(p.shares) || 0;
          const cb = parseFloat(p.cost_basis) || 0;
          const px = q?.price ?? null;
          const posCost = sh * cb;
          const posMkt = px !== null ? sh * px : null;
          const posPnl = posMkt !== null ? posMkt - posCost : null;
          const dayChg = q?.regularMarketChangePercent;

          return (
            <li
              key={p.id}
              className="flex flex-col gap-3 rounded-2xl border-2 border-[var(--rh-border)] bg-white p-4 shadow-[var(--retro-shadow-sm)]"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--rh-surface-muted)] font-mono text-sm font-bold text-[var(--rh-ink)]">
                    {t.slice(0, 4)}
                  </div>
                  <div>
                    <p className="font-mono text-lg font-bold tracking-tight text-[var(--rh-ink)]">{t}</p>
                    <p className="text-xs text-[var(--rh-ink-soft)]">
                      {sh} shares · avg {formatMoney(cb, q?.currency ?? "USD")} · entry {p.entry_date}
                    </p>
                  </div>
                </div>
                <div className="text-right sm:text-right">
                  <p className="font-mono text-xl font-bold tabular-nums text-[var(--rh-ink)]">
                    {px !== null ? formatMoney(px, q?.currency ?? "USD") : "—"}
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--rh-ink-soft)]">Last</p>
                  <div className="mt-1 flex flex-wrap justify-end gap-2 text-xs font-medium">
                    {dayChg != null && (
                      <span className={dayChg >= 0 ? "text-[var(--rh-positive)]" : "text-[var(--rh-negative)]"}>
                        {dayChg >= 0 ? "+" : ""}
                        {dayChg.toFixed(2)}% today
                      </span>
                    )}
                    {posPnl !== null && (
                      <span
                        className={
                          posPnl >= 0 ? "text-[var(--rh-positive)]" : "text-[var(--rh-negative)]"
                        }
                      >
                        {posPnl >= 0 ? "+" : ""}
                        {formatMoney(posPnl)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-[var(--rh-border)] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setNotice(null);
                    setSellPosition(p);
                    setSellOpen(true);
                  }}
                  className="rounded-lg bg-[var(--rh-negative)] px-4 py-2 text-xs font-bold text-white hover:opacity-95"
                >
                  Sell
                </button>
                <button
                  type="button"
                  disabled={removeBusyId === p.id}
                  onClick={() => void removePosition(p.id, t)}
                  className="rounded-lg border-2 border-[var(--rh-border)] bg-[var(--rh-surface-muted)] px-4 py-2 text-xs font-bold text-[var(--rh-ink)] hover:bg-white disabled:opacity-50"
                >
                  {removeBusyId === p.id ? "Removing…" : "Remove"}
                </button>
              </div>
            </li>
          );
        })}
        {positions.length === 0 && (
          <li className="rounded-xl border-2 border-dashed border-[var(--rh-border)] bg-white/60 px-4 py-8 text-center text-sm text-[var(--rh-ink-soft)]">
            No positions yet — add one below.
          </li>
        )}
      </ul>

      <form
        onSubmit={add}
        className="rounded-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)] p-5 shadow-[var(--retro-shadow-sm)]"
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--rh-green)]">
          Add position
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--rh-ink-soft)]">
            Symbol
            <input
              className="rounded-lg border border-[var(--rh-border)] bg-[var(--rh-surface-muted)] px-3 py-2 font-mono text-sm font-bold uppercase text-[var(--rh-ink)]"
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--rh-ink-soft)]">
            Shares
            <input
              className="rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 font-mono text-sm text-[var(--rh-ink)]"
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--rh-ink-soft)]">
            Avg cost / share
            <input
              className="rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 font-mono text-sm text-[var(--rh-ink)]"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              inputMode="decimal"
              placeholder="120.00"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--rh-ink-soft)]">
            Entry date
            <input
              type="date"
              className="rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 text-sm text-[var(--rh-ink)]"
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-[var(--rh-green)] py-3 text-sm font-bold text-white shadow-[var(--retro-shadow-sm)] hover:bg-[var(--rh-green-dark)] disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add to portfolio"}
        </button>
        {msg && <p className="mt-2 text-center text-xs font-medium text-[var(--rh-ink-soft)]">{msg}</p>}
      </form>

      <form
        onSubmit={logOutcome}
        className="rounded-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface-muted)] p-5"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--rh-ink-soft)]">
          Track council outcome
        </p>
        <select
          className="mt-2 w-full rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 text-sm text-[var(--rh-ink)]"
          value={analysisId}
          onChange={(e) => setAnalysisId(e.target.value)}
        >
          {analyses.length === 0 ? (
            <option value="">No analyses yet</option>
          ) : (
            analyses.map((a) => (
              <option key={a.id} value={a.id}>
                {a.ticker} · {a.final_recommendation} ({a.consensus_confidence}%) ·{" "}
                {new Date(a.analysis_date).toLocaleDateString()}
              </option>
            ))
          )}
        </select>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            className="rounded-lg border border-[var(--rh-border)] bg-white px-2 py-2 text-sm text-[var(--rh-ink)]"
            value={action}
            onChange={(e) =>
              setAction(e.target.value as "followed" | "ignored" | "opposite")
            }
          >
            <option value="followed">Followed</option>
            <option value="ignored">Ignored</option>
            <option value="opposite">Opposite</option>
          </select>
          <input
            className="rounded-lg border border-[var(--rh-border)] bg-white px-2 py-2 font-mono text-sm"
            placeholder="Entry"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
          />
          <input
            className="rounded-lg border border-[var(--rh-border)] bg-white px-2 py-2 font-mono text-sm"
            placeholder="Current"
            value={currentPrice}
            onChange={(e) => setCurrentPrice(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={savingOutcome}
          className="mt-4 w-full rounded-xl border-2 border-[var(--rh-ink)] bg-[var(--rh-surface)] py-3 text-sm font-bold text-[var(--rh-ink)] hover:bg-white disabled:opacity-50"
        >
          {savingOutcome ? "Saving…" : "Log outcome"}
        </button>
        {outcomeMsg && (
          <p className="mt-2 text-center text-xs font-medium text-[var(--rh-ink)]">{outcomeMsg}</p>
        )}
      </form>

      <footer className="border-t border-[var(--rh-border)] pt-4 text-center text-[10px] text-[var(--rh-ink-soft)]">
        Quotes via Yahoo (unofficial). For entertainment only — not financial advice.
      </footer>

      {sellOpen && sellPosition && (
        <SellModal
          key={sellPosition.id}
          position={sellPosition}
          quote={quotes[sellPosition.ticker.toUpperCase()]}
          onClose={() => {
            setSellOpen(false);
            setSellPosition(null);
          }}
          onSold={(r) => {
            setNotice({ kind: "ok", text: formatSellBanner(r) });
            void load();
          }}
        />
      )}
    </div>
  );
}
