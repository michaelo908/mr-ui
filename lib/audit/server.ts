import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createClient as sessionClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/supabase/stripe";
import { authenticatedLifecycle } from "@/lib/lifecycle-server";
import {
  BUDGETS,
  stageBudget,
  type AuditJob,
  type AuditKind,
  type AuditSource,
} from "./contracts";
import { captureRenderedPage } from "@/lib/viewport-capture";
import { recordSignal } from "@/lib/signals/server";

export function requireAuditEnvironment() {
  const app = new URL(
    process.env.NEXT_PUBLIC_APP_URL || "https://disabled.invalid",
  );
  const backend = new URL(process.env.MR_API_URL || "https://disabled.invalid");
  if (
    process.env.AUDIT_ENABLED !== "true" ||
    app.hostname !== "gravitas-staging.multirrupt.ai" ||
    backend.hostname !== "multirrupt-api-staging-staging.up.railway.app" ||
    !process.env.STRIPE_SECRET_KEY?.startsWith("sk_test_") ||
    new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || "https://disabled.invalid")
      .hostname !== "gglalhqmdnbdygcxasyd.supabase.co"
  )
    throw new Error("Audit is not enabled in this environment.");
}
export function auditAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || origin !== new URL(req.url).origin)
    throw new Error("Request origin not permitted.");
}
export async function identity(create = false) {
  const client = await sessionClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  const jar = await cookies();
  let token = jar.get("mr_audit_owner")?.value;
  if (create && !token) {
    token = randomBytes(32).toString("hex");
    jar.set("mr_audit_owner", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  const hash =
    token && /^[a-f0-9]{64}$/.test(token)
      ? createHash("sha256").update(token).digest("hex")
      : null;
  return { user, hash };
}
export async function ownedAudit(id: string): Promise<AuditJob> {
  if (!/^[\da-f-]{36}$/i.test(id)) throw new Error("Audit not found.");
  const actor = await identity();
  const { data, error } = await auditAdmin()
    .from("reader_audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (
    error ||
    !data ||
    !(data.user_id
      ? data.user_id === actor.user?.id
      : data.anonymous_hash && data.anonymous_hash === actor.hash)
  )
    throw new Error("Audit not found.");
  return data;
}
export function publicAudit(job: AuditJob) {
  const {
    id,
    kind,
    urls,
    status,
    step,
    reports,
    result,
    failure,
    created_at,
    parent_id,
    source_audit_id,
    attempts,
  } = job;
  return {
    id,
    kind,
    urls,
    status,
    step,
    reports,
    result,
    failure,
    created_at,
    parent_id,
    source_audit_id,
    attempts,
  };
}
export function auditVisitor(hash: string | null) {
  if (!hash) return null;
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function auditSignal(
  name:
    | "audit.started"
    | "audit.completed"
    | "audit.failed"
    | "audit.remediation_opened"
    | "audit.purchased",
  job: Pick<AuditJob, "id" | "kind" | "user_id"> & {
    anonymous_hash?: string | null;
  },
  extra: Record<string, string | number | boolean> = {},
) {
  await recordSignal(name, {
    userId: job.user_id,
    visitorId:
      typeof extra.visitor_id === "string"
        ? extra.visitor_id
        : auditVisitor(job.anonymous_hash || null),
    dedupeKey: ["audit.started", "audit.purchased"].includes(name)
      ? `${job.id}:${name}`
      : undefined,
    surface: job.kind === "mini" ? "acquisition" : "paid",
    verified: true,
    isTest: true,
    properties: { audit_id: job.id, audit_kind: job.kind, ...extra },
  });
}
export function rateBuckets(
  req: Request,
  user: string | null,
  hash: string | null,
  kind: AuditKind,
) {
  const secret = process.env.SIGNALS_RATE_LIMIT_SECRET;
  if (!secret) throw new Error("Audit limits are not configured.");
  const day = new Date().toISOString().slice(0, 10);
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown";
  // Preserve free-tier buckets; a free allowance must not block a purchased assessment.
  const prefix = kind === "mini" ? "" : `${kind}:`;
  return [`ip:${ip}`, `owner:${user || hash}`].map((s) =>
    createHmac("sha256", secret).update(`${day}:${prefix}${s}`).digest("hex"),
  );
}
export async function entitlementDetails(
  userId: string,
  kind: AuditKind,
  checkout?: string,
): Promise<{ key: string; sourceAuditId: string | null }> {
  const db = auditAdmin();
  if (checkout) {
    const { data } = await db
      .from("reader_audit_entitlements")
      .select("entitlement_key,source_audit_id")
      .eq("entitlement_key", `checkout:${checkout}`)
      .eq("user_id", userId)
      .eq("kind", kind)
      .is("consumed_at", null)
      .maybeSingle();
    if (!data)
      throw new Error(
        "Payment is still being confirmed. Please try again shortly.",
      );
    return { key: data.entitlement_key, sourceAuditId: data.source_audit_id };
  }
  if (kind !== "comprehensive")
    throw new Error(kind === "mini" ? "Purchase a homepage audit to continue." : "Purchase AI Answer Readiness to continue.");
  const access = await authenticatedLifecycle();
  if (
    !access ||
    access.user.id !== userId ||
    access.lifecycle.state !== "subscriber"
  )
    throw new Error(
      "Purchase an audit or use an active subscription allowance.",
    );
  const { data } = await db
    .from("subscriptions")
    .select("stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.stripe_subscription_id)
    throw new Error(
      "A billing-period subscription is required for the included audit.",
    );
  const sub = await stripe.subscriptions.retrieve(data.stripe_subscription_id);
  const item = sub.items.data.find(
    (i) => i.price.id === process.env.STRIPE_PRICE_ID,
  );
  if (
    sub.livemode ||
    sub.status !== "active" ||
    !item ||
    item.current_period_end * 1000 <= Date.now() ||
    Date.parse(access.lifecycle.subscriptionPaidThrough || "") <
      item.current_period_end * 1000 ||
    !Number.isFinite(Date.parse(access.lifecycle.subscriptionPaidThrough || ""))
  )
    throw new Error("No current paid billing period is available.");
  const key = `subscription:${sub.id}:${item.current_period_start}:${item.current_period_end}`;
  const { error } = await db
    .from("reader_audit_entitlements")
    .upsert(
      {
        entitlement_key: key,
        user_id: userId,
        kind: "comprehensive",
        period_end: new Date(item.current_period_end * 1000).toISOString(),
      },
      { onConflict: "entitlement_key", ignoreDuplicates: true },
    );
  if (error) throw new Error("Could not reserve subscription allowance.");
  return { key, sourceAuditId: null };
}
export async function entitlement(
  userId: string,
  kind: AuditKind,
  checkout?: string,
) {
  return (await entitlementDetails(userId, kind, checkout)).key;
}
export async function getSource(
  job: AuditJob,
  index: number,
): Promise<AuditSource> {
  const { data, error } = await auditAdmin()
    .storage.from("reader-audit-sources")
    .download(`${job.kind === "readiness" ? job.parent_id || job.id : job.source_audit_id && index === 0 ? job.source_audit_id : job.id}/${index}.json`);
  if (error || !data) throw new Error("Saved source is unavailable.");
  return JSON.parse(await data.text());
}
async function sourceForPage(
  job: AuditJob,
  index: number,
  onCapture: () => void,
): Promise<AuditSource> {
  const db = auditAdmin();
  const key = `${job.id}/${index}.json`;
  const saved = await db.storage.from("reader-audit-sources").download(key);
  if (saved.data) return JSON.parse(await saved.data.text());
  onCapture();
  const rendered = await captureRenderedPage(
    new URL(job.urls[index]),
    BUDGETS[job.kind].viewports,
  );
  const source: AuditSource = {
    requestedUrl: job.urls[index],
    technicalEvidence: rendered.technicalEvidence,
    finalUrl: rendered.finalUrl.toString(),
    title: rendered.title,
    text: rendered.extractedText,
    images: rendered.images.map((i) => i.dataUrl),
    capturedAt: new Date().toISOString(),
    truncated: rendered.truncated,
    limitations: [
      "Visual coverage is limited to the first four desktop viewports; this is not a full-page or mobile audit.",
      ...(rendered.truncated
        ? ["Supporting text was truncated at the processing limit."]
        : []),
      ...(!rendered.extractedText
        ? [
            "Supporting text could not be retrieved; machine accessibility is unverified.",
          ]
        : []),
      "HTML text and rendered images are separate observations; dynamic or personalised content may differ.",
    ],
  };
  const { error } = await db.storage
    .from("reader-audit-sources")
    .upload(key, JSON.stringify(source), {
      contentType: "application/json",
      upsert: false,
    });
  if (error) throw new Error("Could not save the captured source.");
  return source;
}
export async function advance(job: AuditJob) {
  const db = auditAdmin();
  const synthesis =
    job.kind === "comprehensive" && job.step === job.urls.length;
  const budget = stageBudget(job.kind, job.urls.length, synthesis);
  const maximumCost =
    budget.input * 10 +
    budget.output * 50 +
    (job.kind !== "readiness" && !synthesis ? 18000 : 0);
  const dailyLimit = Number(process.env.AUDIT_DAILY_USD || "25");
  if (!Number.isFinite(dailyLimit) || dailyLimit <= 0 || dailyLimit > 100) throw new Error("Invalid daily processing limit.");
  const lease = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db.rpc(
    "claim_reader_audit_step",
    { p_id: job.id, p_lease: lease, p_cost: maximumCost, p_step: job.step },
  );
  if (claimError) throw new Error(claimError.message);
  if (!claimed || claimed.blocked) return;
  // Use the locked version: another tab may have advanced after the initial read.
  job = claimed;
  let actual: number | null = null;
  let captureAllowance = 0;
  let providerStarted = false;
  let metrics: Record<string, unknown> = {};
  let report = null;
  let failure: string | null = null;
  const started = Date.now();
  const keys = [...job.source_keys];
  try {
    const all = job.kind === "readiness" || synthesis;
    const sources = all
      ? await Promise.all(job.urls.map((_, i) => getSource(job, i)))
      : [await sourceForPage(job, job.step, () => { captureAllowance = 18000; })];
    if (!all) keys[job.step] = `${job.id}/${job.step}.json`;
    const api = new URL("/v1/audit", process.env.MR_API_URL!);
    providerStarted = true;
    const response = await fetch(api, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.MR_API_KEY!,
      },
      body: JSON.stringify({
        kind: job.kind,
        stage:
          job.kind === "readiness"
            ? "readiness"
            : synthesis
              ? "synthesis"
              : "page",
        sources: sources.map((s, i) => ({
          page: all ? i + 1 : job.step + 1,
          url: s.finalUrl,
          context: job.page_contexts?.[all ? i : job.step] || "",
          text: synthesis
            ? Array.from(
                new Set(
                  job.reports.flatMap((r) =>
                    r.findings.flatMap((f) =>
                      f.evidence
                        .filter((e) => e.page === i + 1 && e.quote)
                        .map((e) => e.quote),
                    ),
                  ),
                ),
              ).join("\n")
            : job.kind === "readiness" ? `${s.text.slice(0,24000)}\n\n${(s.technicalEvidence || "Technical HTML evidence was not captured.").slice(0,3800)}` : s.text,
          images: job.kind === "readiness" ? [] : s.images,
          limitations: job.kind === "readiness" && s.text.length > 24000 ? [...s.limitations,"Readiness supporting text is limited to 24,000 characters per page."] : s.limitations,
        })),
        reports: synthesis ? job.reports : [],
        input_limit: budget.input,
        output_limit: budget.output,
      }),
      signal: AbortSignal.timeout(180000),
    });
    const payload = await response.json();
    if (payload.usage) {
      metrics = payload.usage;
      const input = payload.usage.input_tokens;
      const output = payload.usage.output_tokens;
      if (
        !Number.isSafeInteger(input) ||
        !Number.isSafeInteger(output) ||
        input < 0 ||
        output < 0
      )
        throw new Error("Invalid provider usage.");
      actual = input * 10 + output * 50 + captureAllowance;
      if (actual > maximumCost) {
        actual = null;
        throw new Error("Provider exceeded the reserved processing allowance.");
      }
    }
    if (!response.ok || payload.error || !payload.report)
      throw new Error(
        payload.error || payload.detail || "Audit analysis did not complete.",
      );
    report = payload.report;
  } catch (error) {
    if (!providerStarted) actual = captureAllowance;
    failure =
      error instanceof Error
        ? error.message.slice(0, 240)
        : "Audit did not complete.";
  }
  const complete = job.kind !== "comprehensive" || synthesis;
  const { data: finished, error } = await db.rpc("finish_reader_audit_step", {
    p_id: job.id,
    p_lease: lease,
    p_report: report,
    p_sources: keys,
    p_complete: complete,
    p_error: failure,
    p_actual: actual,
    p_metrics: {
      ...metrics,
      duration_ms: Date.now() - started,
      cost_basis:
        actual === null
          ? "reserved_unknown"
          : "measured_tokens_capture_ceiling",
    },
  });
  if (error || !finished)
    throw new Error(
      "Could not save this processing step. Reload to check its status before retrying.",
    );
  if (failure || complete)
    await auditSignal(failure ? "audit.failed" : "audit.completed", job, {
      duration_ms: Date.now() - started,
      cost_microusd: actual ?? maximumCost,
    });
}
