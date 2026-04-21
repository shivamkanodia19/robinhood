"use client";

import { useState } from "react";

type Position = {
  id: string;
  ticker: string;
  shares: string;
  cost_basis: string;
  entry_date: string;
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

export type SellFillResult = {
  closed: boolean;
  ticker: string;
  shares_sold: number;
  realized_pnl: number;
  proceeds: number;
  currency: string;
};

type Props = {
  position: Position;
  quote: QuoteInfo | undefined;
  onClose: () => void;
  onSold: (result: SellFillResult) => void;
};

export function SellModal({ position, quote, onClose, onSold }: Props) {
  const [sharesStr, setSharesStr] = useState(() => String(parseFloat(position.shares) || 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const held = parseFloat(position.shares) || 0;
  const px = quote?.price ?? null;
  const cur = quote?.currency ?? "USD";
  const avgCost = parseFloat(position.cost_basis) || 0;

  const draftQty = Math.min(held, Math.max(0, parseFloat(sharesStr) || 0));
  const estProceeds = px !== null && draftQty > 0 ? draftQty * px : null;
  const estCost = draftQty > 0 ? draftQty * avgCost : null;
  const estPnl = estProceeds !== null && estCost !== null ? estProceeds - estCost : null;

  async function submit() {
    setErr(null);
    const q = parseFloat(sharesStr);
    if (!Number.isFinite(q) || q <= 0) {
      setErr("Enter a valid share amount.");
      return;
    }
    if (q > held + 1e-9) {
      setErr(`You only hold ${held} shares.`);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/portfolio/${position.id}/sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErr(data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Sell failed");
        setBusy(false);
        return;
      }
      onSold({
        closed: Boolean(data.closed),
        ticker: String(data.ticker ?? position.ticker),
        shares_sold: Number(data.shares_sold),
        realized_pnl: Number(data.realized_pnl),
        proceeds: Number(data.proceeds),
        currency: String(data.currency ?? "USD"),
      });
      onClose();
    } catch {
      setErr("Network error");
    } finally {
      setBusy(false);
    }
  }

  const t = position.ticker.toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sell-title"
    >
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)] shadow-[var(--retro-shadow)] sm:rounded-2xl">
        <div className="border-b border-[var(--rh-border)] px-5 py-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--rh-green)]">
            Market order · paper fill
          </p>
          <h2 id="sell-title" className="mt-1 text-xl font-black text-[var(--rh-ink)]">
            Sell {t}
          </h2>
          <p className="mt-1 text-xs text-[var(--rh-ink-soft)]">
            Fills at Yahoo&apos;s last/extended price (delayed on many symbols). Not a real brokerage — for
            tracking only.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div className="flex justify-between text-sm">
            <span className="text-[var(--rh-ink-soft)]">Market price</span>
            <span className="font-mono font-bold text-[var(--rh-ink)]">
              {px !== null ? formatMoney(px, cur) : "—"}
            </span>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold uppercase text-[var(--rh-ink-soft)]">
            Shares to sell
            <div className="flex gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 font-mono text-sm text-[var(--rh-ink)]"
                value={sharesStr}
                onChange={(e) => setSharesStr(e.target.value)}
                inputMode="decimal"
              />
              <button
                type="button"
                className="shrink-0 rounded-lg border-2 border-[var(--rh-ink)] bg-[var(--rh-surface-muted)] px-3 py-2 text-xs font-bold text-[var(--rh-ink)]"
                onClick={() => setSharesStr(String(held))}
              >
                Max
              </button>
            </div>
          </label>
          <div className="rounded-xl border border-[var(--rh-border)] bg-[var(--rh-surface-muted)] px-3 py-3 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--rh-ink-soft)]">Est. credit</span>
              <span className="font-mono font-semibold text-[var(--rh-ink)]">
                {estProceeds !== null ? formatMoney(estProceeds, cur) : "—"}
              </span>
            </div>
            <div className="mt-2 flex justify-between">
              <span className="text-[var(--rh-ink-soft)]">Est. return (this slice)</span>
              <span
                className={`font-mono font-semibold ${
                  estPnl === null ? "text-[var(--rh-ink-soft)]" : estPnl >= 0 ? "text-[var(--rh-positive)]" : "text-[var(--rh-negative)]"
                }`}
              >
                {estPnl === null
                  ? "—"
                  : `${estPnl >= 0 ? "+" : ""}${formatMoney(estPnl, cur)}`}
              </span>
            </div>
          </div>
          {err && <p className="text-center text-xs font-medium text-[var(--rh-negative)]">{err}</p>}
        </div>
        <div className="flex gap-2 border-t border-[var(--rh-border)] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border-2 border-[var(--rh-border)] py-3 text-sm font-bold text-[var(--rh-ink)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || px === null}
            onClick={() => void submit()}
            className="flex-1 rounded-xl bg-[var(--rh-negative)] py-3 text-sm font-bold text-white shadow-[var(--retro-shadow-sm)] hover:opacity-95 disabled:opacity-50"
          >
            {busy ? "Selling…" : "Sell now"}
          </button>
        </div>
      </div>
    </div>
  );
}
