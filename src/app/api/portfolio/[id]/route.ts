import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { hasSupabase } from "@/lib/env";
import { ensureTemporaryUser, resolveUserId } from "@/lib/temporaryAuth";
import { z } from "zod";

const idSchema = z.string().uuid();

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const idParsed = idSchema.safeParse(rawId);
  if (!idParsed.success) {
    return NextResponse.json({ error: "Invalid position id" }, { status: 400 });
  }
  const id = idParsed.data;

  const userId = await resolveUserId();
  await ensureTemporaryUser(userId);
  if (!hasSupabase()) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  try {
    const sb = getSupabaseAdmin();
    const { data: row, error: selErr } = await sb
      .from("portfolio_positions")
      .select("id")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (selErr) throw selErr;
    if (!row) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    const { error: delErr } = await sb.from("portfolio_positions").delete().eq("id", id).eq("user_id", userId);
    if (delErr) throw delErr;
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not remove position";
    return NextResponse.json({ error: "Could not remove position", detail: message }, { status: 500 });
  }
}
