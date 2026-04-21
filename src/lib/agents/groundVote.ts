import type { AgentVote } from "@/lib/consensus";
import type {
  AgentKind,
  MetricFamily,
  StockMetricsPayload,
} from "@/lib/metrics/types";
import { METRIC_GLOSSARY } from "@/lib/metrics/validate";

export const AGENT_FAMILY_POLICY: Readonly<
  Record<AgentKind, readonly MetricFamily[]>
> = {
  value: ["fundamental"],
  quality: ["fundamental"],
  contrarian: ["fundamental"],
  macro: ["macro", "fundamental"],
  momentum: ["price", "fundamental"],
  lowvol: ["price", "fundamental"],
};

const NUMBER_REGEX = /-?\d+(?:\.\d+)?/g;
const NOISE_ABS = 0.001;
const REL_TOL = 0.02;
const ABS_TOL_SMALL = 0.05;

function extractCandidateNumbers(text: string): number[] {
  const out: number[] = [];
  const matches = text.match(NUMBER_REGEX) ?? [];
  for (const m of matches) {
    const n = Number(m);
    if (!Number.isFinite(n)) continue;
    if (Math.abs(n) < NOISE_ABS) continue;
    out.push(n);
  }
  return out;
}

function numericFieldsOf(
  metrics: StockMetricsPayload,
): Array<[keyof StockMetricsPayload, number]> {
  const pairs: Array<[keyof StockMetricsPayload, number]> = [];
  for (const key of Object.keys(metrics) as Array<keyof StockMetricsPayload>) {
    const v = metrics[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      pairs.push([key, v]);
    }
  }
  return pairs;
}

function matches(q: number, v: number): boolean {
  if (Math.abs(v) > 1) {
    return Math.abs((q - v) / v) <= REL_TOL;
  }
  return Math.abs(q - v) <= ABS_TOL_SMALL;
}

export function extractCitedMetrics(
  text: string,
  metrics: StockMetricsPayload,
): Array<keyof StockMetricsPayload> {
  const candidates = extractCandidateNumbers(text);
  if (candidates.length === 0) return [];
  const fields = numericFieldsOf(metrics);
  const cited = new Set<keyof StockMetricsPayload>();
  for (const q of candidates) {
    for (const [name, v] of fields) {
      if (matches(q, v)) {
        cited.add(name);
      }
    }
  }
  return [...cited];
}

export function groundVote(
  vote: AgentVote,
  metrics: StockMetricsPayload,
  agentKind: AgentKind,
): AgentVote {
  if (vote.failed) return vote;

  const text = `${vote.thesis} ${vote.key_metric}`;
  const citedMetrics = extractCitedMetrics(text, metrics);
  const grounded = citedMetrics.length >= 1;

  const citedFamilies = new Set<MetricFamily>(
    citedMetrics.map(
      (m) => (METRIC_GLOSSARY[m as string] ?? "fundamental") as MetricFamily,
    ),
  );
  const allowed = AGENT_FAMILY_POLICY[agentKind];
  const outOfFamilyFams = [...citedFamilies].filter(
    (fam) => !allowed.includes(fam),
  );
  const outOfFamily = outOfFamilyFams.length > 0;

  const hardFlagged = new Set(
    (metrics.metric_flags ?? [])
      .filter((f) => f.severity === "hard")
      .map((f) => f.metric),
  );
  const hardFlaggedCites = citedMetrics.filter((m) =>
    hardFlagged.has(m as string),
  );

  let confidence = vote.confidence;
  let capped_reason: string | undefined;

  if (!grounded) {
    confidence = Math.min(confidence, 55);
    capped_reason =
      "ungrounded: no numeric citation matched the validated snapshot within tolerance";
  } else if (outOfFamily) {
    confidence = Math.min(confidence, 55);
    capped_reason = `out_of_family: agent cited metrics outside its policy (families: ${[
      ...citedFamilies,
    ].join(", ")})`;
  } else if (hardFlaggedCites.length > 0) {
    confidence = Math.max(50, confidence - 25);
    capped_reason = `hard_flag: relied on hallucination-flagged metric(s): ${hardFlaggedCites.join(
      ", ",
    )}`;
  }

  return {
    ...vote,
    confidence,
    grounded,
    capped_reason,
  };
}
