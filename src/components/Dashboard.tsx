"use client";

import { useSession, signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

type InvestingProfile = "value" | "growth" | "momentum" | "income" | "balanced";

type Consensus = {
  final_recommendation: string;
  consensus_confidence: number;
  final_thesis: string;
  key_disagreement: string;
  next_checkpoint: string;
  vote_breakdown: { buy: number; hold: number; sell: number };
  agents: Array<{
    agent: string;
    recommendation: string;
    confidence: number;
    thesis: string;
    key_metric: string;
    key_risk: string;
  }>;
};

type WeightedConsensus = {
  profile: InvestingProfile;
  weighted_score: number;
  final_recommendation: "BUY" | "HOLD" | "SELL";
  consensus_confidence: number;
  weighted_support_count: number;
  contrarian_footnote: string;
};

type ConvictionChange = {
  direction: "UP" | "DOWN" | "STABLE";
  reason: string;
  delta_score: number;
};

const recColor: Record<string, string> = {
  BUY: "text-emerald-400",
  HOLD: "text-amber-300",
  SELL: "text-rose-400",
  MIXED: "text-violet-300",
};

export function Dashboard() {
  const { data: session, status } = useSession();
  const [ticker, setTicker] = useState("AAPL");
  const [mode, setMode] = useState<"decision" | "analyst">("decision");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consensus, setConsensus] = useState<Consensus | null>(null);
  const [weighted, setWeighted] = useState<WeightedConsensus | null>(null);
  const [conviction, setConviction] = useState<ConvictionChange | null>(null);
  const [profile, setProfile] = useState<InvestingProfile>("balanced");
  const [degraded, setDegraded] = useState<string | undefined>();
  const [expanded, setExpanded] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    (async () => {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (res.ok && data.investing_profile) {
        setProfile(data.investing_profile as InvestingProfile);
      }
    })();
  }, [session]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConsensus(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, mode, profile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
        return;
      }
      setConsensus(data.consensus);
      setWeighted(data.weighted_consensus ?? null);
      setConviction(data.conviction_change ?? null);
      setDegraded(data.degraded_message);
      if (mode === "analyst") setExpanded(true);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [ticker, mode, profile]);

  if (status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-zinc-400">
        Loading session…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-6 p-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            AI Investment Council
          </h1>
          <p className="mt-2 text-sm text-zinc-400">
            Sign in to run the six-agent council on any ticker. Analysis is for
            education, not financial advice.
          </p>
        </div>
        <a
          href="/login"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-500"
        >
          Sign in
        </a>
        <a
          href="/register"
          className="text-center text-sm text-emerald-400 hover:underline"
        >
          Create account
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-white">Investment Council</h1>
          <p className="text-sm text-zinc-500">
            Signed in as {session.user.email}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/portfolio"
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-900"
          >
            Portfolio
          </a>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/" })}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Ticker
          <input
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-sm uppercase text-white outline-none focus:border-emerald-600"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={12}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          Investing profile
          <select
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={profile}
            onChange={(e) => setProfile(e.target.value as InvestingProfile)}
          >
            <option value="balanced">Balanced</option>
            <option value="value">Value</option>
            <option value="growth">Growth</option>
            <option value="momentum">Momentum</option>
            <option value="income">Income</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-zinc-500">
          View
          <select
            className="rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-white"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "decision" | "analyst")
            }
          >
            <option value="decision">Decision — verdict first</option>
            <option value="analyst">Analyst — full detail</option>
          </select>
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={run}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {loading ? "Analyzing…" : "Run council"}
        </button>
      </section>

      {degraded && (
        <p className="rounded-lg border border-amber-900/60 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          {degraded}
        </p>
      )}

      {error && (
        <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}

      {consensus && (
        <>
          <section className="rounded-xl border border-zinc-800 bg-gradient-to-b from-zinc-900 to-zinc-950 p-6 shadow-xl">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              Synthesis (not financial advice)
            </p>
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span
                className={`text-3xl font-bold ${recColor[consensus.final_recommendation] ?? "text-white"}`}
              >
                {consensus.final_recommendation}
              </span>
              <span className="text-zinc-400">
                Confidence {consensus.consensus_confidence}%
              </span>
              <span className="text-zinc-500">
                ({consensus.vote_breakdown.buy} buy ·{" "}
                {consensus.vote_breakdown.hold} hold ·{" "}
                {consensus.vote_breakdown.sell} sell)
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-zinc-300">
              {consensus.final_thesis}
            </p>
            <p className="mt-3 text-xs text-zinc-500">
              Next checkpoint: {consensus.next_checkpoint}
            </p>
            {weighted && (
              <p className="mt-2 text-xs text-zinc-500">
                Based on your <span className="capitalize">{weighted.profile}</span> profile, weighted signal is{" "}
                <span className="font-semibold text-zinc-300">{weighted.final_recommendation}</span>{" "}
                ({weighted.consensus_confidence}% confidence).
              </p>
            )}
            {conviction && (
              <p className="mt-2 text-xs text-zinc-500">
                Conviction: <span className="font-semibold text-zinc-300">{conviction.direction}</span>{" "}
                ({conviction.delta_score >= 0 ? "+" : ""}
                {conviction.delta_score.toFixed(3)}) — {conviction.reason}
              </p>
            )}
            {mode === "decision" && (
              <button
                type="button"
                className="mt-4 text-xs font-medium text-emerald-400 hover:underline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Hide detail" : "Expand analysis"} ▼
              </button>
            )}
          </section>

          {(mode === "analyst" || expanded) && (
            <>
              <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <h2 className="text-sm font-semibold text-zinc-300">
                  Dissent & friction
                </h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {consensus.key_disagreement}
                </p>
                {weighted && (
                  <p className="mt-2 text-xs text-zinc-500">
                    {weighted.contrarian_footnote}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-zinc-400">
                  Agent analyses
                </h2>
                {consensus.agents.map((a) => {
                  const open = mode === "analyst" || openAgent === a.agent;
                  return (
                    <div
                      key={a.agent}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/30"
                    >
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-3 text-left"
                        onClick={() =>
                          setOpenAgent(open ? null : a.agent)
                        }
                      >
                        <span className="font-medium capitalize text-zinc-200">
                          {a.agent}
                        </span>
                        <span
                          className={`text-sm font-semibold ${recColor[a.recommendation]}`}
                        >
                          {a.recommendation}{" "}
                          <span className="text-zinc-500">
                            ({a.confidence}%)
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-2 border-t border-zinc-800 px-4 py-3 text-sm text-zinc-400">
                          <p>{a.thesis}</p>
                          <p>
                            <span className="text-zinc-500">Key metric:</span>{" "}
                            {a.key_metric}
                          </p>
                          <p>
                            <span className="text-zinc-500">Risk:</span>{" "}
                            {a.key_risk}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </section>
            </>
          )}
        </>
      )}

      <footer className="border-t border-zinc-800 pt-6 text-center text-xs text-zinc-600">
        This tool is for informational purposes only and does not constitute
        financial, legal, or tax advice. Past performance does not guarantee
        future results. Consult a qualified professional before investing.
      </footer>
    </div>
  );
}
