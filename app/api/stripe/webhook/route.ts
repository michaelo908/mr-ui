import Stripe from "stripe";
import { Resend } from "resend";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordSignal } from "@/lib/signals/server";
import { sanitizeAttribution } from "@/lib/signals/contracts";
import {
  describeMailchimpFailure,
  tagExistingMailchimpDayPassBuyer,
} from "@/lib/mailchimp";
import {
  dayPassAccessEmail,
  subscriptionActivationEmail,
} from "@/lib/transactional-emails";

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

async function claimEffect(eventId: string, effectKey: string) {
  const { data, error } = await supabase.rpc("claim_stripe_webhook_effect", {
    p_event_id: eventId,
    p_effect_key: effectKey,
  });
  if (error || typeof data !== "boolean") throw new WebhookFailure("effect_claim_failed");
  return data;
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

async function grantDayPass(userId: string, eventCreatedAt: number) {
  const trialStartDate = new Date(eventCreatedAt * 1000);
  const trialEndDate = new Date(trialStartDate.getTime() + 48 * 60 * 60 * 1000);
  const { error } = await supabase.from("profiles").upsert({
    id: userId,
    access_level: "trial",
    trial_start_date: trialStartDate.toISOString(),
    trial_end_date: trialEndDate.toISOString(),
  }, { onConflict: "id" });
  if (error) throw new WebhookFailure("day_pass_entitlement_write_failed");
}

async function upsertSubscription(input: {
  userId: string;
  customerId: string | null;
  subscriptionId: string;
  status: string;
}) {
  const { error } = await supabase.from("subscriptions").upsert({
    user_id: input.userId,
    stripe_customer_id: input.customerId,
    stripe_subscription_id: input.subscriptionId,
    status: input.status,
  }, { onConflict: "user_id" });
  if (error) throw new WebhookFailure("subscription_entitlement_write_failed");
}

async function updateSubscriptionStatus(subscriptionId: string, status: string) {
  const { data, error } = await supabase.from("subscriptions")
    .update({ status })
    .eq("stripe_subscription_id", subscriptionId)
    .select("id");
  if (error) throw new WebhookFailure("subscription_status_write_failed");
  return Array.isArray(data) && data.length > 0;
}

async function sendTransactionalEmail(input: {
  eventId: string;
  effect: "day-pass" | "subscription-activation";
  to: string;
  email: ReturnType<typeof dayPassAccessEmail>;
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

async function fulfilDayPass(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const email = session.customer_details?.email;
  if (!email) throw new WebhookFailure("checkout_email_missing", false);
  const userId = await findOrCreateUser(email);
  await grantDayPass(userId, event.created);

  const communicationErrors: WebhookFailure[] = [];
  try {
    await sendTransactionalEmail({
      eventId: event.id,
      effect: "day-pass",
      to: email,
      email: dayPassAccessEmail(GRAVITAS_APP_URL),
    });
  } catch (error) {
    communicationErrors.push(error instanceof WebhookFailure ? error : new WebhookFailure("resend_delivery_failed"));
  }
  try {
    await syncDayPassMarketing(email);
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
  const claimed = await claimEffect(event.id, `subscription-activation:${subscriptionId}`);
  if (!claimed) return;
  await sendTransactionalEmail({
    eventId: subscriptionId,
    effect: "subscription-activation",
    to: email,
    email: subscriptionActivationEmail(GRAVITAS_APP_URL),
  });
}

async function checkoutLineItems(sessionId: string) {
  return stripe.checkout.sessions.listLineItems(sessionId, { limit: 10 });
}

async function processCheckout(event: Stripe.Event, session: Stripe.Checkout.Session) {
  const lineItems = await checkoutLineItems(session.id);
  const isDayPass = lineItems.data.some((item) => item.price?.id === GRAVITAS_DAY_PASS_PRICE_ID);
  if (isDayPass) {
    if (!await claimEffect(event.id, `day-pass:${session.id}`)) return;
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
    const customerId = typeof session.customer === "string" ? session.customer : null;
    if (userId && subscriptionId) {
      await upsertSubscription({ userId, customerId, subscriptionId, status: "active" });
      await sendSubscriptionActivation(event, subscriptionId, session.customer_details?.email || null);
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

async function processSubscriptionCreated(event: Stripe.Event, subscription: Stripe.Subscription) {
  const userId = subscription.metadata.user_id;
  const customerId = typeof subscription.customer === "string" ? subscription.customer : null;
  if (!userId) throw new WebhookFailure("subscription_user_missing", false);
  await upsertSubscription({ userId, customerId, subscriptionId: subscription.id, status: subscription.status });
  await sendSubscriptionActivation(event, subscription.id, await subscriptionEmail(subscription));
}

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id || null;
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
      await processSubscriptionCreated(event, event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionStatus(subscription.id, subscription.status);
      after(() => recordSignal("purchase.subscription_updated", {
        surface: "paid", verified: true, isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-updated`,
        properties: { status: subscription.status },
      }));
      return;
    }
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionStatus(subscription.id, "cancelled");
      after(() => recordSignal("purchase.subscription_cancelled", {
        surface: "paid", verified: true, isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-cancelled`,
        properties: { status: subscription.status },
      }));
      return;
    }
    case "invoice.paid":
    case "invoice.payment_failed": {
      const subscriptionId = invoiceSubscriptionId(event.data.object as Stripe.Invoice);
      if (subscriptionId) {
        await updateSubscriptionStatus(subscriptionId, event.type === "invoice.paid" ? "active" : "past_due");
      }
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
