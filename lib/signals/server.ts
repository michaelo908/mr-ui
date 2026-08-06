import { createClient } from "@supabase/supabase-js";
import { buildSignalRateLimitBucket } from "@/lib/signals/rate-limit";
import { buildSignalEnvelope, signalCategory, type SignalEnvelope } from "@/lib/signals/contracts";
import type { SignalName } from "@/lib/signals/registry";

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function recordSignal(
  name: SignalName,
  input: Omit<Partial<SignalEnvelope>, "name" | "version"> = {}
) {
  try {
    const supabase = adminClient();
    if (!supabase) return false;
    const signal = buildSignalEnvelope(name, input);
    const { error } = await supabase.from("gravitas_signals").insert({
      signal_name: signal.name,
      signal_version: signal.version,
      category: signalCategory(signal.name),
      occurred_at: signal.occurredAt,
      visitor_id: signal.visitorId,
      session_id: signal.sessionId,
      user_id: signal.userId,
      surface: signal.surface,
      first_touch: signal.firstTouch ?? {},
      last_touch: signal.lastTouch ?? {},
      properties: signal.properties ?? {},
      is_test: signal.isTest,
      verified: signal.verified,
      dedupe_key: signal.dedupeKey,
    });
    if (error && error.code !== "23505") {
      console.warn("Gravitas signal write failed", { name, code: error.code });
      return false;
    }
    return true;
  } catch (error) {
    console.warn("Gravitas signal write failed", {
      name,
      reason: error instanceof Error ? error.message : "unknown",
    });
    return false;
  }
}

export function signalContextFromRequest(req: Request): Pick<SignalEnvelope, "visitorId" | "sessionId" | "surface" | "isTest"> {
  const visitorId = req.headers.get("x-gravitas-visitor-id");
  const sessionId = req.headers.get("x-gravitas-session-id");
  const surface = req.headers.get("x-gravitas-surface");
  const hostname = new URL(req.url).hostname;
  return {
    visitorId,
    sessionId,
    surface: surface === "jump-in" || surface === "paid" ? surface : "unknown",
    isTest:
      process.env.GRAVITAS_SIGNALS_TEST_MODE === "true" ||
      hostname === "localhost" || hostname === "127.0.0.1",
  };
}

export function getSignalsAdminClient() {
  return adminClient();
}

export type SignalRateLimitResult = "allowed" | "limited" | "unavailable";

function rateLimitAddress(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip")?.trim() || "unknown";
}

export async function consumeSignalRateLimit(req: Request): Promise<SignalRateLimitResult> {
  try {
    const secret = process.env.SIGNALS_RATE_LIMIT_SECRET;
    const supabase = adminClient();
    if (!secret || secret.length < 32 || !supabase) return "unavailable";
    const bucket = buildSignalRateLimitBucket(rateLimitAddress(req), secret, new Date());
    const { data, error } = await supabase.rpc("consume_gravitas_signal_rate_limit", {
      p_bucket_key: bucket,
      p_limit: 120,
      p_window_seconds: 60,
    });
    if (error || typeof data !== "boolean") return "unavailable";
    return data ? "allowed" : "limited";
  } catch {
    return "unavailable";
  }
}
