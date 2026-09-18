import "server-only";

import { createHash, createHmac, randomBytes, randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";
import {
  JUMP_IN_HANDOFF_TTL_MS,
  type JumpInHandoffPayload,
} from "@/lib/jump-in-handoff";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function handoffRateBucket(address: string, now = new Date()) {
  const window = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}-${Math.floor(now.getUTCMinutes() / 10)}`;
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!)
    .update(`${window}:${address}`)
    .digest("hex");
}

function splitToken(token: string) {
  const [id, secret, ...rest] = token.split(".");
  return id && secret && rest.length === 0 ? { id, secret } : null;
}

export async function createJumpInHandoff(payload: JumpInHandoffPayload, rateBucket: string) {
  const id = randomUUID();
  const secret = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + JUMP_IN_HANDOFF_TTL_MS).toISOString();
  const admin = adminClient();
  // The bridge holds pre-analysis source material. Remove expired rows whenever
  // it is used so drafts do not accumulate beyond their ten-minute lifetime.
  const { error: cleanupError } = await admin
    .from("gravitas_jump_in_handoffs")
    .delete()
    .lt("expires_at", new Date().toISOString());
  if (cleanupError) throw new Error("jump_in_handoff_store_failed");

  const { count, error: countError } = await admin
    .from("gravitas_jump_in_handoffs")
    .select("id", { count: "exact", head: true })
    .eq("rate_bucket", rateBucket)
    .gt("expires_at", new Date().toISOString());
  if (countError) throw new Error("jump_in_handoff_store_failed");
  if ((count ?? 0) >= 8) throw new Error("jump_in_handoff_limited");

  const { error } = await admin.from("gravitas_jump_in_handoffs").insert({
    id,
    secret_hash: hashSecret(secret),
    rate_bucket: rateBucket,
    payload,
    expires_at: expiresAt,
  });
  if (error) throw new Error("jump_in_handoff_store_failed");
  return `${id}.${secret}`;
}

export async function readJumpInHandoff(token: string) {
  const parsed = splitToken(token);
  if (!parsed) return null;

  const admin = adminClient();
  const { data, error } = await admin
    .from("gravitas_jump_in_handoffs")
    .select("secret_hash, payload, expires_at, consumed_at")
    .eq("id", parsed.id)
    .maybeSingle();
  if (error || !data || data.secret_hash !== hashSecret(parsed.secret)) return null;
  if (data.consumed_at || new Date(data.expires_at).getTime() <= Date.now()) return null;

  // This makes a captured hand-off token single-use. The browser immediately
  // places its payload in first-party workspace storage before sign-in.
  const { data: consumed, error: consumeError } = await admin
    .from("gravitas_jump_in_handoffs")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", parsed.id)
    .is("consumed_at", null)
    .select("id")
    .maybeSingle();
  if (consumeError) throw new Error("jump_in_handoff_consume_failed");
  if (!consumed) return null;

  return data.payload as JumpInHandoffPayload;
}
