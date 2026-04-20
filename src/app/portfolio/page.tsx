"use client";

import { useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

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

export default function PortfolioPage() {
  const { data: session, status } = useSession();
  const [positions, setPositions] = useState<Position[]>([]);
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

  useEffect(() => {
    load();
  }, [load]);

  if (status === "loading") return <p className="p-8 text-zinc-500">Loading…</p>;
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
    <div className="mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-white">Portfolio Tracker</h1>
        <a href="/" className="cursor-pointer text-sm text-zinc-400 hover:text-zinc-200">
          ← Council
        </a>
      </header>

      <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
        <p className="text-xs text-zinc-500">Manual positions (MVP)</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-sm uppercase text-white"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Ticker"
          />
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="Shares"
          />
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="Cost basis / share"
          />
          <input
            type="date"
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="min-h-11 cursor-pointer rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving..." : "Add position"}
        </button>
        {msg && <p className="text-xs text-zinc-300">{msg}</p>}
      </form>

      <form
        onSubmit={logOutcome}
        className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4"
      >
        <p className="text-xs text-zinc-500">Track recommendation outcome</p>
        <select
          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
          value={analysisId}
          onChange={(e) => setAnalysisId(e.target.value)}
        >
          {analyses.map((a) => (
            <option key={a.id} value={a.id}>
              {a.ticker} • {a.final_recommendation} ({a.consensus_confidence}%) •{" "}
              {new Date(a.analysis_date).toLocaleDateString()}
            </option>
          ))}
        </select>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
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
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
            placeholder="Entry"
            value={entryPrice}
            onChange={(e) => setEntryPrice(e.target.value)}
          />
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-white"
            placeholder="Current"
            value={currentPrice}
            onChange={(e) => setCurrentPrice(e.target.value)}
          />
        </div>
        <button
          type="submit"
          disabled={savingOutcome}
          className="min-h-11 cursor-pointer rounded-lg bg-zinc-800 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingOutcome ? "Saving..." : "Log outcome"}
        </button>
        {outcomeMsg && <p className="text-xs text-zinc-300">{outcomeMsg}</p>}
      </form>

      <ul className="grid gap-2 sm:grid-cols-2">
        {positions.map((p) => (
          <li
            key={p.id}
            className="rounded-xl border border-zinc-800 px-4 py-3 font-mono text-sm text-zinc-200"
          >
            {p.ticker} — {p.shares} sh @ $${p.cost_basis} — entry {p.entry_date}
          </li>
        ))}
        {positions.length === 0 && (
          <li className="text-sm text-zinc-500">No positions yet.</li>
        )}
      </ul>
    </div>
  );
}
