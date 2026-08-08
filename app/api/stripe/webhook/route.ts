import crypto from "crypto";
import Stripe from "stripe";
import { Resend } from "resend";
import { headers } from "next/headers";
import { after, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { recordSignal } from "@/lib/signals/server";
import { sanitizeAttribution } from "@/lib/signals/contracts";

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
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

async function addToMailchimp(
  email: string,
  firstName?: string,
  lastName?: string
) {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const serverPrefix = process.env.MAILCHIMP_SERVER_PREFIX;

  if (!apiKey || !audienceId || !serverPrefix) {
    console.error("Missing Mailchimp environment variables");
    return;
  }

  const subscriberHash = crypto
    .createHash("md5")
    .update(email.toLowerCase())
    .digest("hex");

  const auth = Buffer.from(`anystring:${apiKey}`).toString("base64");

  const memberResponse = await fetch(
    `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email_address: email,
        status_if_new: "subscribed",
        merge_fields: {
          FNAME: firstName || "",
          LNAME: lastName || "",
        },
      }),
    }
  );

  if (!memberResponse.ok) {
    console.error("Mailchimp member error:", await memberResponse.text());
    return;
  }

  const tagResponse = await fetch(
    `https://${serverPrefix}.api.mailchimp.com/3.0/lists/${audienceId}/members/${subscriberHash}/tags`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        tags: [{ name: "gravitas-day-pass-buyer", status: "active" }],
      }),
    }
  );

  if (!tagResponse.ok) {
    console.error("Mailchimp tag error:", await tagResponse.text());
    return;
  }

  console.log("Added Gravitas Day Pass buyer to Mailchimp", email);
}

const GRAVITAS_DAY_PASS_PRICE_ID =
  process.env.STRIPE_DAY_PASS_PRICE_ID || "price_1TxjZXPEeaE0AI8SMYUQ1WhG";
const GRAVITAS_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://www.multirrupt.ai";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2026-02-25.clover",
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const signature = headersList.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe signature" },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error("Invalid webhook signature:", err);
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const signalIdentity = {
        visitorId: session.metadata?.gravitas_visitor_id || null,
        sessionId: session.metadata?.gravitas_session_id || null,
        userId: session.metadata?.user_id || null,
        surface: session.metadata?.gravitas_surface === "jump-in" ? "jump-in" as const : "paid" as const,
        verified: true,
        isTest: !event.livemode,
        firstTouch: stripeAttribution(session.metadata, "ft"),
        lastTouch: stripeAttribution(session.metadata, "lt"),
      };

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 10,
      });

      const isDayPassPurchase = lineItems.data.some(
        (item) => item.price?.id === GRAVITAS_DAY_PASS_PRICE_ID
      );

      if (isDayPassPurchase) {
        const email = session.customer_details?.email;

        const fullName = session.customer_details?.name || "";
        const [firstName, ...rest] = fullName.trim().split(" ");
        const lastName = rest.join(" ");

        console.log("Gravitas Day Pass purchase detected", email);
        after(() => recordSignal("purchase.day_pass_completed", {
          ...signalIdentity,
          dedupeKey: `stripe:${event.id}:day-pass`,
          properties: {
            amount_total: session.amount_total ?? 0,
            currency: session.currency ?? "unknown",
          },
        }));

        if (email) {
          const { data: usersData, error: usersError } =
            await supabase.auth.admin.listUsers();

          if (usersError) {
            console.error("Unable to list Supabase users", usersError);
          }

          const existingUser = usersData?.users.find(
            (user) => user.email?.toLowerCase() === email.toLowerCase()
          );

          let userId = existingUser?.id;

          if (!userId) {
            const { data: newUserData, error: createUserError } =
              await supabase.auth.admin.createUser({
                email,
                email_confirm: true,
              });

            if (createUserError) {
              console.error("Unable to create Supabase user", createUserError);
            }

            userId = newUserData?.user?.id;
          }

          if (userId) {
            const trialStartDate = new Date();
            const trialEndDate = new Date();
            trialEndDate.setHours(trialEndDate.getHours() + 48);

            const { error: profileError } = await supabase
              .from("profiles")
              .upsert(
                {
                  id: userId,
                  access_level: "trial",
                  trial_start_date: trialStartDate.toISOString(),
                  trial_end_date: trialEndDate.toISOString(),
                },
                { onConflict: "id" }
              );

            if (profileError) {
              console.error("Unable to grant Day Pass access", profileError);
            }

            const { error: emailError } = await getResend().emails.send({
              from: "Multirrupt Gravitas <support@multirrupt.ai>",
              to: email,
              subject: "Your Gravitas Day Pass is ready",
              html: `
                <p>Hi,</p>

                <p>Thanks for purchasing the <strong>Gravitas Day Pass</strong>.</p>

                <p>Your 48-hour Gravitas access is now ready.</p>

                <p>
                <strong>Access Gravitas:</strong><br />
                <a href="${GRAVITAS_APP_URL}/login">Login to Gravitas</a>
                </p>

                <p>
                 Use the same email address you used at checkout. Gravitas will send you a magic login link.
                </p>

                <p>
                   Your Day Pass runs for 48 hours from purchase.
                </p>

                 <p>
                  Need help?<br />
                  <a href="mailto:support@multirrupt.ai">support@multirrupt.ai</a>
                 </p>

                 <p>
                  Enjoy,<br />
                   Michael
                 </p>
              `,
            });

            if (emailError) {
              console.error("Unable to send Day Pass email", emailError);
            } else {
              await addToMailchimp(email, firstName, lastName);
            }
          }
        }
      }

      const userId = session.metadata?.user_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : null;

      if (userId) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: userId,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: "active",
          },
          { onConflict: "user_id" }
        );
      }

      after(() => recordSignal("purchase.checkout_completed", {
        ...signalIdentity,
        dedupeKey: `stripe:${event.id}:checkout`,
        properties: {
          purchase_type: isDayPassPurchase ? "day_pass" : "subscription",
          amount_total: session.amount_total ?? 0,
          currency: session.currency ?? "unknown",
          payment_status: session.payment_status,
        },
      }));
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;

      await supabase
        .from("subscriptions")
        .update({ status: subscription.status })
        .eq("stripe_subscription_id", subscription.id);
      after(() => recordSignal("purchase.subscription_updated", {
        surface: "paid",
        verified: true,
        isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-updated`,
        properties: { status: subscription.status },
      }));
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", subscription.id);
      after(() => recordSignal("purchase.subscription_cancelled", {
        surface: "paid",
        verified: true,
        isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:subscription-cancelled`,
        properties: { status: subscription.status },
      }));
    }

    if (event.type === "checkout.session.async_payment_failed") {
      const session = event.data.object as Stripe.Checkout.Session;
      after(() => recordSignal("purchase.checkout_failed", {
        visitorId: session.metadata?.gravitas_visitor_id || null,
        sessionId: session.metadata?.gravitas_session_id || null,
        userId: session.metadata?.user_id || null,
        surface: session.metadata?.gravitas_surface === "jump-in" ? "jump-in" : "paid",
        firstTouch: stripeAttribution(session.metadata, "ft"),
        lastTouch: stripeAttribution(session.metadata, "lt"),
        verified: true,
        isTest: !event.livemode,
        dedupeKey: `stripe:${event.id}:checkout-failed`,
        properties: { failure_stage: "async_payment" },
      }));
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("Webhook error:", err);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}
