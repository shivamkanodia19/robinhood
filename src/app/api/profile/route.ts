import { NextResponse } from "next/server";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { toInvestingProfile } from "@/lib/phase2";
import { z } from "zod";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";

const schema = z.object({
  investing_profile: z.enum(["value", "growth", "momentum", "income", "balanced"]),
});

export async function GET() {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ investing_profile: "balanced" });
  }
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("users")
    .select("investing_profile")
    .eq("id", userId)
    .maybeSingle();
  return NextResponse.json({
    investing_profile: toInvestingProfile(data?.investing_profile),
  });
}

export async function POST(req: Request) {
  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  }
  const sb = getSupabaseAdmin();
  const { error } = await sb
    .from("users")
    .update({ investing_profile: parsed.data.investing_profile })
    .eq("id", userId);
  if (error) {
    return NextResponse.json({ error: "Could not update profile" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, investing_profile: parsed.data.investing_profile });
}
