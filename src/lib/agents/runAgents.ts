import Anthropic from "@anthropic-ai/sdk";
import type { StockMetricsPayload } from "@/lib/metrics/types";
import type { AgentKind } from "@/lib/metrics/types";
import { buildAgentSystemPrompt } from "./prompts";
import { parseAgentOutput } from "./parseJson";
import type { AgentVote } from "@/lib/consensus";

const KINDS: AgentKind[] = [
  "value",
  "momentum",
  "quality",
  "contrarian",
  "macro",
  "lowvol",
];

export async function runAgent(
  client: Anthropic,
  model: string,
  kind: AgentKind,
  metrics: StockMetricsPayload,
): Promise<AgentVote> {
  const system = buildAgentSystemPrompt(kind, metrics);
  const msg = await client.messages.create({
    model,
    max_tokens: 512,
    temperature: 0,
    system,
    messages: [
      {
        role: "user",
        content: `Respond with JSON only for ${metrics.ticker}. No prose outside JSON.`,
      },
    ],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const parsed = parseAgentOutput(text);
  return {
    agent: kind,
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    thesis: parsed.thesis,
    key_metric: parsed.key_metric,
    key_risk: parsed.key_risk,
  };
}

export async function runAllAgents(
  apiKey: string,
  model: string,
  metrics: StockMetricsPayload,
): Promise<AgentVote[]> {
  const client = new Anthropic({ apiKey });
  const results = await Promise.all(
    KINDS.map((k) =>
      runAgent(client, model, k, metrics).catch(() => ({
        agent: k,
        recommendation: "HOLD" as const,
        confidence: 0,
        thesis: "Agent unavailable for this run.",
        key_metric: "n/a",
        key_risk: "Model timeout or parse error — excluded from conviction.",
      })),
    ),
  );
  return results;
}
