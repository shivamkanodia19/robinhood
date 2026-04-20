import Anthropic from "@anthropic-ai/sdk";
import type { StockMetricsPayload } from "@/lib/metrics/types";
import type { AgentKind } from "@/lib/metrics/types";
import { buildAgentSystemPrompt } from "./prompts";
import { parseAgentOutput, parseAgentFields, type ParsedAgent } from "./parseJson";
import type { AgentVote } from "@/lib/consensus";

const KINDS: AgentKind[] = [
  "value",
  "momentum",
  "quality",
  "contrarian",
  "macro",
  "lowvol",
];

const VOTE_TOOL: Anthropic.Tool = {
  name: "submit_council_vote",
  description:
    "Submit exactly one structured vote for this ticker. Required for every response.",
  input_schema: {
    type: "object",
    properties: {
      recommendation: {
        type: "string",
        enum: ["BUY", "HOLD", "SELL"],
        description: "Committee vote using only numbers from the system prompt.",
      },
      confidence: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Integer 0–100.",
      },
      thesis: { type: "string", description: "At most 2 sentences." },
      key_metric: { type: "string" },
      key_risk: { type: "string" },
    },
    required: ["recommendation", "confidence", "thesis", "key_metric", "key_risk"],
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function failedVote(kind: AgentKind, message: string): AgentVote {
  return {
    agent: kind,
    recommendation: "HOLD",
    confidence: 0,
    thesis: "Agent unavailable for this run.",
    key_metric: "n/a",
    key_risk: message.slice(0, 200),
    failed: true,
  };
}

function extractVoteFromMessage(msg: Anthropic.Message): ParsedAgent | null {
  for (const block of msg.content) {
    if (block.type === "tool_use" && block.name === "submit_council_vote") {
      try {
        return parseAgentFields(block.input);
      } catch {
        return null;
      }
    }
  }
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!text.trim()) return null;
  try {
    return parseAgentOutput(text);
  } catch {
    return null;
  }
}

export async function runAgent(
  client: Anthropic,
  model: string,
  kind: AgentKind,
  metrics: StockMetricsPayload,
): Promise<AgentVote> {
  const system = buildAgentSystemPrompt(kind, metrics);
  const msg = await client.messages.create({
    model,
    max_tokens: 1024,
    temperature: 0,
    system,
    tools: [VOTE_TOOL],
    tool_choice: {
      type: "tool",
      name: "submit_council_vote",
      disable_parallel_tool_use: true,
    },
    messages: [
      {
        role: "user",
        content:
          "Using only the numeric facts in the system message, call submit_council_vote exactly once. Do not add prose outside the tool call.",
      },
    ],
  });
  const parsed = extractVoteFromMessage(msg);
  if (!parsed) {
    throw new Error("No valid tool output or JSON from model.");
  }
  return {
    agent: kind,
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    thesis: parsed.thesis,
    key_metric: parsed.key_metric,
    key_risk: parsed.key_risk,
    failed: false,
  };
}

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = 450;

export async function runAllAgents(
  apiKeys: string[],
  model: string,
  metrics: StockMetricsPayload,
): Promise<AgentVote[]> {
  const { votes } = await runAllAgentsWithDiagnostics(apiKeys, model, metrics);
  return votes;
}

export async function runAllAgentsWithDiagnostics(
  apiKeys: string[],
  model: string,
  metrics: StockMetricsPayload,
): Promise<{ votes: AgentVote[]; failedAgents: string[]; errors: string[] }> {
  if (!apiKeys.length) {
    return {
      votes: KINDS.map((k) => failedVote(k, "No ANTHROPIC API keys configured.")),
      failedAgents: [...KINDS],
      errors: KINDS.map((k) => `${k}: missing API key`),
    };
  }

  const errors: string[] = [];
  const failedAgents: string[] = [];
  const votes: AgentVote[] = [];

  for (let i = 0; i < KINDS.length; i++) {
    const k = KINDS[i];
    let lastErr = "Unknown error";
    let vote: AgentVote | null = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const key = apiKeys[(i + attempt) % apiKeys.length];
      const client = new Anthropic({ apiKey: key });
      try {
        vote = await runAgent(client, model, k, metrics);
        break;
      } catch (err: unknown) {
        lastErr = err instanceof Error ? err.message : String(err);
        const isRateLimited =
          lastErr.includes("429") ||
          lastErr.toLowerCase().includes("rate_limit") ||
          lastErr.toLowerCase().includes("overloaded");
        const wait = BACKOFF_MS * (attempt + 1) + (isRateLimited ? 800 : 0);
        if (attempt < MAX_ATTEMPTS - 1) {
          await sleep(wait);
        }
      }
    }

    if (vote) {
      votes.push(vote);
      await sleep(120);
      continue;
    }

    failedAgents.push(k);
    errors.push(`${k}: ${lastErr}`);
    votes.push(failedVote(k, lastErr));
    await sleep(120);
  }

  return { votes, failedAgents, errors };
}
