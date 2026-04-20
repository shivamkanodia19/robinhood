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
    failed?: boolean;
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
  BUY: "text-[var(--rh-green)]",
  HOLD: "text-amber-700",
  SELL: "text-[var(--rh-negative)]",
  MIXED: "text-violet-800",
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
  const [dataSnapshot, setDataSnapshot] = useState<{
    as_of?: string;
    data_freshness_note?: string;
  } | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openAgent, setOpenAgent] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (res.ok && data.investing_profile) {
        setProfile(data.investing_profile as InvestingProfile);
      }
    })();
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    setConsensus(null);
    setDataSnapshot(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker, mode, profile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail ? `${data.error}: ${data.detail}` : data.error ?? "Analysis failed");
        return;
      }
      if (data.metrics && typeof data.metrics === "object") {
        const m = data.metrics as { as_of?: string; data_freshness_note?: string };
        setDataSnapshot({
          as_of: m.as_of,
          data_freshness_note: m.data_freshness_note,
        });
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
      <div className="flex flex-1 items-center justify-center p-8 text-[var(--rh-ink-soft)]">
        Loading session…
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--rh-border)] pb-6">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--rh-green)]">
            Retro terminal · v1
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--rh-ink)] sm:text-3xl">
            AI Investment Council
          </h1>
          <p className="mt-1 text-sm text-[var(--rh-ink-soft)]">
            {session?.user?.email
              ? `Signed in as ${session.user.email}`
              : "Guest mode — limits are per Anthropic org; a second key only helps if it is a different org/account"}
          </p>
        </div>
        <div className="flex gap-2">
          <a
            href="/portfolio"
            className="rounded-lg border-2 border-[var(--rh-ink)] bg-[var(--rh-surface)] px-4 py-2 text-sm font-semibold text-[var(--rh-ink)] shadow-[var(--retro-shadow-sm)] transition hover:-translate-y-0.5"
          >
            Portfolio
          </a>
          {session?.user?.email && (
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="cursor-pointer rounded-lg border border-[var(--rh-border)] px-3 py-2 text-sm text-[var(--rh-ink-soft)] hover:bg-white"
            >
              Sign out
            </button>
          )}
        </div>
      </header>

      <section className="grid gap-3 rounded-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)] p-4 shadow-[var(--retro-shadow-sm)] sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--rh-ink-soft)]">
          Ticker
          <input
            className="rounded-lg border border-[var(--rh-border)] bg-[var(--rh-surface-muted)] px-3 py-2 font-mono text-sm font-semibold uppercase text-[var(--rh-ink)] outline-none focus:border-[var(--rh-green)]"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            maxLength={12}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--rh-ink-soft)]">
          Investing profile
          <select
            className="rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 text-sm text-[var(--rh-ink)]"
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
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-[var(--rh-ink-soft)]">
          View
          <select
            className="rounded-lg border border-[var(--rh-border)] bg-white px-3 py-2 text-sm text-[var(--rh-ink)]"
            value={mode}
            onChange={(e) =>
              setMode(e.target.value as "decision" | "analyst")
            }
          >
            <option value="decision">Decision — verdict first</option>
            <option value="analyst">Analyst — full detail</option>
          </select>
        </label>
        <div className="flex items-end">
          <button
            type="button"
            disabled={loading}
            onClick={run}
            className="animate-rh-pulse min-h-11 w-full cursor-pointer rounded-lg bg-[var(--rh-green)] px-5 py-2 text-sm font-bold text-white shadow-[var(--retro-shadow-sm)] hover:bg-[var(--rh-green-dark)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Run council"}
          </button>
        </div>
      </section>

      {degraded && (
        <p className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
          {degraded}
        </p>
      )}

      {error && (
        <p className="rounded-xl border-2 border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          {error}
        </p>
      )}

      {consensus && (
        <>
          <section className="rounded-2xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)] p-6 shadow-[var(--retro-shadow)]">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--rh-ink-soft)]">
              Synthesis (not financial advice)
            </p>
            {dataSnapshot?.as_of && (
              <p className="mt-1 text-xs text-[var(--rh-ink-soft)]">
                Data snapshot:{" "}
                <span className="font-mono text-[var(--rh-ink)]">
                  {new Date(dataSnapshot.as_of).toLocaleString()}
                </span>
                {dataSnapshot.data_freshness_note ? (
                  <span className="mt-1 block text-[var(--rh-ink-soft)]">{dataSnapshot.data_freshness_note}</span>
                ) : null}
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-baseline gap-3">
              <span
                className={`text-4xl font-black tracking-tight ${recColor[consensus.final_recommendation] ?? "text-[var(--rh-ink)]"}`}
              >
                {consensus.final_recommendation}
              </span>
              <span className="text-[var(--rh-ink-soft)]">
                Confidence {consensus.consensus_confidence}%
              </span>
              <span className="font-mono text-sm text-[var(--rh-ink-soft)]">
                ({consensus.vote_breakdown.buy} buy ·{" "}
                {consensus.vote_breakdown.hold} hold ·{" "}
                {consensus.vote_breakdown.sell} sell)
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-[var(--rh-ink)]">
              {consensus.final_thesis}
            </p>
            <p className="mt-3 text-xs text-[var(--rh-ink-soft)]">
              Next checkpoint: {consensus.next_checkpoint}
            </p>
            {weighted && (
              <p className="mt-2 text-xs text-[var(--rh-ink-soft)]">
                Based on your <span className="capitalize">{weighted.profile}</span> profile, weighted signal is{" "}
                <span className="font-semibold text-[var(--rh-ink)]">{weighted.final_recommendation}</span>{" "}
                ({weighted.consensus_confidence}% confidence).
              </p>
            )}
            {conviction && (
              <p className="mt-2 text-xs text-[var(--rh-ink-soft)]">
                Conviction: <span className="font-semibold text-[var(--rh-ink)]">{conviction.direction}</span>{" "}
                ({conviction.delta_score >= 0 ? "+" : ""}
                {conviction.delta_score.toFixed(3)}) — {conviction.reason}
              </p>
            )}
            {mode === "decision" && (
              <button
                type="button"
                className="mt-4 cursor-pointer text-xs font-bold text-[var(--rh-green)] hover:underline"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? "Hide detail" : "Expand analysis"} ▼
              </button>
            )}
          </section>

          {(mode === "analyst" || expanded) && (
            <>
              <section className="rounded-xl border-2 border-[var(--rh-border)] bg-white/90 p-4 shadow-[var(--retro-shadow-sm)]">
                <h2 className="text-sm font-bold text-[var(--rh-ink)]">
                  Dissent & friction
                </h2>
                <p className="mt-2 text-sm text-[var(--rh-ink-soft)]">
                  {consensus.key_disagreement}
                </p>
                {weighted && (
                  <p className="mt-2 text-xs text-[var(--rh-ink-soft)]">
                    {weighted.contrarian_footnote}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h2 className="text-sm font-bold text-[var(--rh-ink)]">
                  Agent analyses
                </h2>
                {consensus.agents.map((a) => {
                  const open = mode === "analyst" || openAgent === a.agent;
                  return (
                    <div
                      key={a.agent}
                      className="rounded-xl border-2 border-[var(--rh-border)] bg-[var(--rh-surface)]"
                    >
                      <button
                        type="button"
                        className="flex w-full cursor-pointer items-center justify-between px-4 py-3 text-left"
                        onClick={() =>
                          setOpenAgent(open ? null : a.agent)
                        }
                      >
                        <span className="font-semibold capitalize text-[var(--rh-ink)]">
                          {a.agent}
                          {a.failed ? (
                            <span className="ml-2 font-normal normal-case text-[var(--rh-negative)]">
                              (model unavailable)
                            </span>
                          ) : null}
                        </span>
                        <span
                          className={`font-mono text-sm font-bold ${recColor[a.recommendation]}`}
                        >
                          {a.recommendation}{" "}
                          <span className="font-sans font-normal text-[var(--rh-ink-soft)]">
                            ({a.confidence}%)
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-2 border-t-2 border-[var(--rh-border)] px-4 py-3 text-sm text-[var(--rh-ink-soft)]">
                          <p>{a.thesis}</p>
                          <p>
                            <span className="text-[var(--rh-ink)]">Key metric:</span>{" "}
                            {a.key_metric}
                          </p>
                          <p>
                            <span className="text-[var(--rh-ink)]">Risk:</span>{" "}
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

      <footer className="border-t border-[var(--rh-border)] pt-6 text-center text-xs text-[var(--rh-ink-soft)]">
        This tool is for informational purposes only and does not constitute
        financial, legal, or tax advice. Past performance does not guarantee
        future results. Consult a qualified professional before investing.
      </footer>
    </div>
  );
}
