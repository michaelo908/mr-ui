import { NextResponse } from "next/server";
import {
  auditAdmin,
  identity,
  requireAuditEnvironment,
  sameOrigin,
} from "@/lib/audit/server";
export async function POST(req: Request) {
  try {
    requireAuditEnvironment();
    sameOrigin(req);
    const actor = await identity();
    if (!actor.user)
      return NextResponse.json({ error: "Sign in first." }, { status: 401 });
    if (actor.hash) {
      const { error } = await auditAdmin()
        .from("reader_audits")
        .update({ user_id: actor.user.id })
        .eq("anonymous_hash", actor.hash)
        .is("user_id", null);
      if (error) throw error;
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Could not save audits to your account." },
      { status: 400 },
    );
  }
}
