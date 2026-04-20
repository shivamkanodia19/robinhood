import { z } from "zod";

const schema = z.object({
  NEXTAUTH_SECRET: z.string().min(8).default("dev-only-change-me"),
  NEXTAUTH_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY_2: z.string().optional(),
  /** Comma-separated keys; if set, overrides single-key vars for rotation */
  ANTHROPIC_API_KEYS: z.string().optional(),
  // Official alias per https://platform.claude.com/docs/en/about-claude/models/overview
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5"),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

export function getEnv(): Env {
  return schema.parse({
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_API_KEY_2: process.env.ANTHROPIC_API_KEY_2,
    ANTHROPIC_API_KEYS: process.env.ANTHROPIC_API_KEYS,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

/** Distinct Anthropic API keys for round-robin (higher combined rate limits). */
export function getAnthropicApiKeys(): string[] {
  const csv = process.env.ANTHROPIC_API_KEYS?.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  if (csv?.length) return Array.from(new Set(csv));
  const a = process.env.ANTHROPIC_API_KEY?.trim();
  const b = process.env.ANTHROPIC_API_KEY_2?.trim();
  return Array.from(new Set([a, b].filter((x): x is string => Boolean(x))));
}

export function hasAnthropic(): boolean {
  return getAnthropicApiKeys().length > 0;
}

export function hasSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}
