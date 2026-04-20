import { auth } from "@/auth";
import { hasSupabase } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const GUEST_USER_ID = "00000000-0000-0000-0000-000000000001";
const GUEST_EMAIL = "guest@local.dev";
const GUEST_PASSWORD_HASH = "temp-auth-disabled";

export async function resolveUserId(): Promise<string> {
  const session = await auth();
  return session?.user?.id || GUEST_USER_ID;
}

export async function ensureTemporaryUser(userId: string): Promise<void> {
  if (!hasSupabase()) return;
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (data?.id) return;
  await sb.from("users").insert({
    id: userId,
    email: userId === GUEST_USER_ID ? GUEST_EMAIL : `${userId}@local.dev`,
    password_hash: GUEST_PASSWORD_HASH,
    investing_profile: "balanced",
  });
}

export function isGuestUser(userId: string): boolean {
  return userId === GUEST_USER_ID;
}
