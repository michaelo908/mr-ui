import Stripe from "stripe";
import { Resend } from "resend";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordSignal } from "@/lib/signals/server";
import { sanitizeAttribution } from "@/lib/signals/contracts";
import {
  describeMailchimpFailure,
  syncExistingMailchimpLifecycle,
  tagExistingMailchimpDayPassBuyer,
} from "@/lib/mailchimp";
import {
  cancellationScheduledEmail,
  dayPassAccessEmail,
  paymentFailedEmail,
  subscriptionActivationEmail,
} from "@/lib/transactional-emails";
import { calculateGraceEnd } from "@/lib/lifecycle";
import { resolveLifecycleForUserId } from "@/lib/lifecycle-server";

const SUPPORTED_EVENTS = new Set<Stripe.Event.Type>([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
]);

type ReceiptStatus = "completed" | "retryable_failed" | "terminal_failed";

class WebhookFailure extends Error {
  constructor(
    readonly category: string,
    readonly retryable = true,
  ) {
    super(category);
    this.name = "WebhookFailure";
  }
}

function safeFailure(error: unknown) {
  return error instanceof WebhookFailure
    ? { category: error.category, retryable: error.retryable }
    : { category: "unexpected_failure", retryable: true };
}

function stripeAttribution(metadata: Stripe.Metadata | null, prefix: "ft" | "lt") {
  if (!metadata) return undefined;
  return sanitizeAttribution({
    landingPath: metadata[`gravitas_${prefix}_path`],
    referrerHost: metadata[`gravitas_${prefix}_referrer`],
    utmSource: metadata[`gravitas_${prefix}_utm_source`],
    utmMedium: metadata[`gravitas_${prefix}_utm_medium`],
    utmCampaign: metadata[`gravitas_${prefix}_utm_campaign`],
    utmContent: metadata[`gravitas_${prefix}_utm_content`],
    metaCampaignId: metadata[`gravitas_${prefix}_meta_campaign`],
    metaAdSetId: metadata[`gravitas_${prefix}_meta_adset`],
    metaAdId: metadata[`gravitas_${prefix}_meta_ad`],
    creativeHypothesis: metadata[`gravitas_${prefix}_hypothesis`],
  });
}

function getResend() {
  if (!process.env.RESEND_API_KEY) throw new WebhookFailure("resend_missing_configuration");
  return new Resend(process.env.RESEND_API_KEY);
}

const GRAVITAS_DAY_PASS_PRICE_ID =
  process.env.STRIPE_DAY_PASS_PRICE_ID || "price_1TxjZXPEeaE0AI8SMYUQ1WhG";
const GRAVITAS_APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.multirrupt.ai";
const GRAVITAS_EMAIL_SENDER = GRAVITAS_APP_URL.includes("gravitas-staging.multirrupt.ai")
  ? "Gravitas Staging <support@multirrupt.ai>"
  : "Multirrupt Gravitas <support@multirrupt.ai>";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

async function claimEvent(event: Stripe.Event) {
  const { data, error } = await supabase.rpc("claim_stripe_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  if (error || typeof data !== "string") throw new WebhookFailure("receipt_claim_failed");
  return data as "claimed" | "processing" | ReceiptStatus;
}

async function finishEvent(eventId: string, status: ReceiptStatus, category?: string) {
  const { error } = await supabase.rpc("finish_stripe_webhook_event", {
    p_event_id: eventId,
    p_status: status,
    p_failure_category: category || null,
  });
  if (error) throw new WebhookFailure("receipt_finish_failed");
}

async function runSideEffect(
  eventId: string,
  effectKey: string,
  operation: () => Promise<void>,
) {
  const { data, error } = await supabase.rpc("claim_stripe_webhook_side_effect", {
    p_event_id: eventId,
    p_effect_key: effectKey,
  });
  if (error || typeof data !== "boolean") throw new WebhookFailure("side_effect_claim_failed");
  if (!data) return;
  try {
    await operation();
    const { error: finishError } = await supabase.rpc("finish_stripe_webhook_side_effect", {
      p_effect_key: effectKey,
      p_status: "completed",
    });
    if (finishError) throw new WebhookFailure("side_effect_finish_failed");
  } catch (error) {
    await supabase.rpc("finish_stripe_webhook_side_effect", {
      p_effect_key: effectKey,
      p_status: "retryable_failed",
    });
    throw error;
  }
}

async function findOrCreateUser(email: string) {
  const normalized = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new WebhookFailure("auth_user_lookup_failed");
  const existing = data.users.find((user) => user.email?.toLowerCase() === normalized);
  if (existing) return existing.id;
  const created = await supabase.auth.admin.createUser({ email: normalized, email_confirm: true });
  if (created.error || !created.data.user) throw new WebhookFailure("auth_user_create_failed");
  return created.data.user.id;
}

async function grantDayPass(userId: string, event: Stripe.Event) {
  const { data, error } = await supabase.rpc("grant_gravitas_day_pass", {
    p_user_id: userId,
    p_event_id: event.id,
    p_purchase_time: new Date(event.created * 1000).toISOString(),
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row || typeof row.expires_at !== "string") {
    throw new WebhookFailure("day_pass_entitlement_write_failed");
  }
  return { applied: Boolean(row.applied), expiresAt: row.expires_at as string };
}

async function upsertSubscription(input: {
  userId: string | null;
  customerId: string | null;
  subscriptionId: string;
  status: string;
  paidThrough: string | null;
  graceEndsAt: string | null;
  cancelAtPeriodEnd: boolean;
  eventCreatedAt: number;
}) {
  const { data, error } = await supabase.rpc("upsert_gravitas_subscription", {
    p_user_id: input.userId,
    p_customer_id: input.customerId,
    p_subscription_id: input.subscriptionId,
    p_status: input.status,
    p_paid_through: input.paidThrough,
    p_grace_ends_at: input.graceEndsAt,
    p_cancel_at_period_end: input.cancelAtPeriodEnd,
    p_event_created_at: new Date(input.eventCreatedAt * 1000).toISOString(),
  });
  if (error || typeof data !== "boolean") throw new WebhookFailure("subscription_entitlement_write_failed");
  return data;
}

async function sendTransactionalEmail(input: {
  eventId: string;
  effect: "day-pass" | "subscription-activation" | "payment-failed" | "cancellation-scheduled";
  to: string;
  email: { subject: string; html: string; text: string };
}) {
  const { error } = await getResend().emails.send({
    from: GRAVITAS_EMAIL_SENDER,
    replyTo: "support@multirrupt.ai",
    to: input.to,
    subject: input.email.subject,
    html: input.email.html,
    text: input.email.text,
  }, { idempotencyKey: `stripe-${input.eventId}-${input.effect}` });
  if (error) throw new WebhookFailure("resend_delivery_failed");
}

async function syncDayPassMarketing(email: string) {
  try {
    return await tagExistingMailchimpDayPassBuyer({ email });
  } catch (error) {
    const failure = describeMailchimpFailure(error);
    console.warn("Stripe Mailchimp synchronization failed", {
      provider: "mailchimp",
      category: failure.category,
      providerStatus: failure.providerStatus,
      retryable: failure.category !== "member_rejected",
    });
    throw new WebhookFailure(`mailchimp_${failure.category}`);
  }
}

async function syncLifecycleMarketing(
  email: string,
  state: "jump_in" | "day_pass" | "subscriber",
  permanentTags: string[] = [],
  authoritative = false,
) {
  try {
    await syncExistingMailchimpLifecycle({ email, state, permanentTags, authoritative });
  } catch (error) {
    const failure = describeMailchimpFailure(error);
    console.warn("Stripe Mailchimp lifecycle synchronization failed", {
      provider: "mailchimp",
      category: failure.category,
      providerStatus: failure.providerStatus,
      retryable: failure.category !== "member_rejected",
    });
    throw new WebhookFailure(`mailchimp_${failure.category}`);
  }
}

async function fulfilDayPass(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email;
  if (!email) throw new WebhookFailure("checkout_email_missing", false);
  const userId = await findOrCreateUser(email);
  const entitlement = await grantDayPass(userId, event);

  const communicationErrors: WebhookFailure[] = [];
  try {
    await runSideEffect(event.id, `email:day-pass:${event.id}`, async () => {
      await sendTransactionalEmail({
        eventId: event.id,
        effect: "day-pass",
        to: email,
        email: dayPassAccessEmail(GRAVITAS_APP_URL, entitlement.expiresAt),
      });
    });
  } catch (error) {
    communicationErrors.push(error instanceof WebhookFailure ? error : new WebhookFailure("resend_delivery_failed"));
  }
  try {
    await runSideEffect(event.id, `mailchimp:day-pass:${event.id}`, async () => {
      await syncDayPassMarketing(email);
    });
  } catch (error) {
    communicationErrors.push(error instanceof WebhookFailure ? error : new WebhookFailure("mailchimp_sync_failed"));
  }
  if (communicationErrors.length) throw communicationErrors[0];
}

async function sendSubscriptionActivation(
  event: Stripe.Event,
  subscriptionId: string,
  email: string | null,
) {
  if (!email) throw new WebhookFailure("subscription_email_missing", false);
  await runSideEffect(event.id, `email:subscription-activation:${subscriptionId}`, async () => {
    await sendTransactionalEmail({
      eventId: subscriptionId,
      effect: "subscription-activation",
      to: email,
      email: subscriptionActivationEmail(GRAVITAS_APP_URL),
    });
  });
}

async function checkoutLineItems(sessionId: string) {
  return stripe.checkout.sessions.listLineItems(sessionId, { limit: 10 });
}

async function processCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const lineItems = await checkoutLineItems(session.id);
  const isDayPass = lineItems.data.some((item) => item.price?.id === GRAVITAS_DAY_PASS_PRICE_ID);
  if (isDayPass) {
    await fulfilDayPass(event, session);
    after(() => recordSignal("purchase.day_pass_completed", {
      visitorId: session.metadata?.gravitas_visitor_id || null,
      sessionId: session.metadata?.gravitas_session_id || null,
      surface: session.metadata?.gravitas_surface === "jump-in" ? "jump-in" : "paid",
      verified: true,
      isTest: !event.livemode,
      dedupeKey: `stripe:${event.id}:day-pass`,
      properties: { amount_total: session.amount_total ?? 0, currency: session.currency ?? "unknown" },
    }));
  } else {
    const userId = session.metadata?.user_id;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;
    if (userId && subscriptionId) {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await processSubscriptionCreated(event, subscription, userId);
    }
  }
  after(() => recordSignal("purchase.checkout_completed", {
    visitorId: session.metadata?.gravitas_visitor_id || null,
    sessionId: session.metadata?.gravitas_session_id || null,
    userId: session.metadata?.user_id || null,
    surface: session.metadata?.gravitas_surface === "jump-in" ? "jump-in" : "paid",
    verified: true,
    isTest: !event.livemode,
    firstTouch: stripeAttribution(session.metadata, "ft"),
    lastTouch: stripeAttribution(session.metadata, "lt"),
    dedupeKey: `stripe:${event.id}:checkout`,
    properties: { purchase_type: isDayPass ? "day_pass" : "subscription" },
  }));
}

async function subscriptionEmail(subscription: Stripe.Subscription) {
  if (typeof subscription.customer !== "string") return null;
  const customer = await stripe.customers.retrieve(subscription.customer);
  return !customer.deleted ? customer.email : null;
}

function stripeTime(value: number | null | undefined) {
  return typeof value === "number" ? new Date(value * 1000).toISOString() : null;
}

function subscriptionPaidThrough(subscription: Stripe.Subscription) {
  const itemEnds = subscription.items.data
    .map((item) => item.current_period_end)
    .filter((value): value is number => typeof value === "number");
  const paidThrough = itemEnds.length ? Math.max(...itemEnds) : subscription.cancel_at;
  return stripeTime(paidThrough);
}

async function processSubscriptionCreated(
  event: Stripe.Event,
  subscription: Stripe.Subscription,
  suppliedUserId?: string,
) {
  const userId = suppliedUserId || subscription.metadata.user_id;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!userId) throw new WebhookFailure("subscription_user_missing", false);
  const updated = await upsertSubscription({
    userId,
    customerId,
    subscriptionId: subscription.id,
    status: subscription.status,
    paidThrough: subscriptionPaidThrough(subscription),
    graceEndsAt: null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    eventCreatedAt: event.created,
  });
  if (!updated) return;
  const email = await subscriptionEmail(subscription);
  const communicationErrors: unknown[] = [];
  try {
    await sendSubscriptionActivation(event, subscription.id, email);
  } catch (error) {
    communicationErrors.push(error);
  }
  if (email) {
    try {
      await runSideEffect(event.id, `mailchimp:subscriber:${subscription.id}`, async () => {
        await syncLifecycleMarketing(email, "subscriber");
      });
    } catch (error) {
      communicationErrors.push(error);
    }
  }
  if (communicationErrors.length) throw communicationErrors[0];
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id || null;
}

async function processSubscriptionUpdated(event: Stripe.Event, subscription: Stripe.Subscription) {
  const { data: existing, error: existingError } = await supabase.from("subscriptions")
    .select("grace_ends_at")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (existingError) throw new WebhookFailure("subscription_lookup_failed");
  const updated = await upsertSubscription({
    userId: subscription.metadata.user_id || null,
    customerId: typeof subscription.customer === "string" ? subscription.customer : null,
    subscriptionId: subscription.id,
    status: subscription.status,
    paidThrough: subscriptionPaidThrough(subscription),
    graceEndsAt: subscription.status === "active" || subscription.status === "trialing"
      ? null
      : existing?.grace_ends_at ?? null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    eventCreatedAt: event.created,
  });
  if (!updated) return;
  const email = await subscriptionEmail(subscription);
  const communicationErrors: unknown[] = [];
  if (email) {
    try {
      await runSideEffect(event.id, `mailchimp:subscriber:${subscription.id}`, async () => {
        await syncLifecycleMarketing(email, "subscriber");
      });
    } catch (error) {
      communicationErrors.push(error);
    }
  }
  const paidThrough = subscriptionPaidThrough(subscription);
  if (subscription.cancel_at_period_end && paidThrough && email) {
    const cancellationVersion = subscription.canceled_at ?? event.created;
    try {
      await runSideEffect(event.id, `email:cancellation-scheduled:${subscription.id}:${cancellationVersion}`, async () => {
        await sendTransactionalEmail({
          eventId: event.id,
          effect: "cancellation-scheduled",
          to: email,
          email: cancellationScheduledEmail(GRAVITAS_APP_URL, paidThrough),
        });
      });
    } catch (error) {
      communicationErrors.push(error);
    }
  }
  if (communicationErrors.length) throw communicationErrors[0];
}

async function processInvoice(event: Stripe.Event, invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  const email = await subscriptionEmail(subscription);

  if (event.type === "invoice.paid") {
    await upsertSubscription({
      userId: subscription.metadata.user_id || null,
      customerId,
      subscriptionId,
      status: subscription.status,
      paidThrough: subscriptionPaidThrough(subscription),
      graceEndsAt: null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      eventCreatedAt: event.created,
    });
    if (email) {
      await runSideEffect(event.id, `mailchimp:subscriber:${subscription.id}`, async () => {
        await syncLifecycleMarketing(email, "subscriber");
      });
    }
    return;
  }

  const { data: existing, error } = await supabase.from("subscriptions")
    .select("paid_through")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();
  if (error) throw new WebhookFailure("subscription_lookup_failed");
  const storedPaidThrough = existing?.paid_through ? Date.parse(existing.paid_through) : 0;
  const graceEndsAt = new Date(calculateGraceEnd(
    Number.isFinite(storedPaidThrough) && storedPaidThrough > 0 ? storedPaidThrough : null,
    event.created * 1000,
  )).toISOString();
  await upsertSubscription({
    userId: subscription.metadata.user_id || null,
    customerId,
    subscriptionId,
    status: "past_due",
    paidThrough: existing?.paid_through ?? subscriptionPaidThrough(subscription),
    graceEndsAt,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    eventCreatedAt: event.created,
  });
  if (email) {
    await runSideEffect(event.id, `email:payment-failed:${subscriptionId}:${invoice.id}`, async () => {
      await sendTransactionalEmail({
        eventId: event.id,
        effect: "payment-failed",
        to: email,
        email: paymentFailedEmail(GRAVITAS_APP_URL, graceEndsAt),
      });
    });
  }
}

async function processEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await processCheckout(event, event.data.object as Stripe.Checkout.Session);
      return;
    case "checkout.session.async_payment_failed":
      after(() => recordSignal("purchase.checkout_failed", {
        surface: "paid",
        verified: true,
        isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:checkout-failed`,
        properties: { failure_stage: "async_payment" },
      }));
      return;
    case "customer.subscription.created":
      await processSubscriptionCreated(
        event,
        event.data.object as Stripe.Subscription,
      );
      return;
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await processSubscriptionUpdated(event, subscription);
      after(() => recordSignal("purchase.subscription_updated", {
        surface: "paid", verified: true, isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-updated`,
        properties: { status: subscription.status },
      }));
      return;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await upsertSubscription({
        userId: subscription.metadata.user_id || null,
        customerId: typeof subscription.customer === "string" ? subscription.customer : null,
        subscriptionId: subscription.id,
        status: "cancelled",
        paidThrough: subscriptionPaidThrough(subscription),
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        eventCreatedAt: event.created,
      });
      const { data: stored, error: storedError } = await supabase.from("subscriptions")
        .select("user_id")
        .eq("stripe_subscription_id", subscription.id)
        .maybeSingle();
      if (storedError) throw new WebhookFailure("subscription_lookup_failed");
      if (stored?.user_id) {
        const [email, lifecycle] = await Promise.all([
          subscriptionEmail(subscription),
          resolveLifecycleForUserId(stored.user_id, supabase),
        ]);
        if (email) {
          await runSideEffect(event.id, `mailchimp:subscription-ended:${subscription.id}`, async () => {
            await syncLifecycleMarketing(email, lifecycle.state, [], true);
          });
        }
      }
      after(() => recordSignal("purchase.subscription_cancelled", {
        surface: "paid", verified: true, isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-cancelled`,
        properties: { status: subscription.status },
      }));
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      await processInvoice(event, event.data.object as Stripe.Invoice);
      if (event.type === "invoice.payment_failed") {
        after(() => recordSignal("purchase.checkout_failed", {
          surface: "paid", verified: true, isTest: !event.livemode,
          dedupeKey: `stripe:${event.id}:invoice-failed`,
          properties: { failure_stage: "invoice_payment" },
        }));
      }
      return;
    }
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  const signature = (await headers()).get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    console.warn("Stripe webhook rejected", { provider: "stripe", category: "invalid_signature" });
    return NextResponse.json({ error: "Invalid webhook request" }, { status: 400 });
  }

  if (!SUPPORTED_EVENTS.has(event.type)) return NextResponse.json({ received: true, ignored: true });

  try {
    const claim = await claimEvent(event);
    if (claim === "completed" || claim === "terminal_failed") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    if (claim === "processing") {
      return NextResponse.json({ error: "Webhook processing in progress" }, { status: 409 });
    }
    await processEvent(event);
    await finishEvent(event.id, "completed");
    return NextResponse.json({ received: true });
  } catch (error) {
    const failure = safeFailure(error);
    const status: ReceiptStatus = failure.retryable ? "retryable_failed" : "terminal_failed";
    try {
      await finishEvent(event.id, status, failure.category);
    } catch {
      console.warn("Stripe webhook receipt update failed", {
        provider: "supabase",
        eventType: event.type,
        eventId: event.id,
        category: "receipt_finish_failed",
        retryable: true,
      });
    }
    console.warn("Stripe webhook processing failed", {
      provider: "stripe",
      eventType: event.type,
      eventId: event.id,
      category: failure.category,
      retryable: failure.retryable,
    });
    return failure.retryable
      ? NextResponse.json({ error: "Webhook processing failed" }, { status: 500 })
      : NextResponse.json({ received: true, rejected: true });
  }
}
