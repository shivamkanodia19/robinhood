import { z } from "zod";

const agentSchema = z.object({
  recommendation: z.enum(["BUY", "HOLD", "SELL"]),
  confidence: z.number().int().min(0).max(100),
  thesis: z.string(),
  key_metric: z.string(),
  key_risk: z.string(),
});

export type ParsedAgent = z.infer<typeof agentSchema>;

export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1] : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in model output.");
  }
  return JSON.parse(body.slice(start, end + 1));
}

export function parseAgentOutput(raw: string): ParsedAgent {
  const obj = extractJsonObject(raw);
  return agentSchema.parse(obj);
}
