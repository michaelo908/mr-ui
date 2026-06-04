import crypto from "crypto";
import Stripe from "stripe";
import { Resend } from "resend";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error("Missing RESEND_API_KEY");
  }

  return new Resend(process.env.RESEND_API_KEY);
}

async function addToMailchimp(email: string) {
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
        tags: [{ name: "hidden-campaign-buyer", status: "active" }],
      }),
    }
  );

  if (!tagResponse.ok) {
    console.error("Mailchimp tag error:", await tagResponse.text());
    return;
  }

  console.log("Added Hidden Campaign buyer to Mailchimp", email);
}

const HIDDEN_CAMPAIGN_PRICE_ID = "price_1TdYZpPEeaE0AI8SbfKD4VG6";

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

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        limit: 10,
      });

      const isHiddenCampaignPurchase = lineItems.data.some(
        (item) => item.price?.id === HIDDEN_CAMPAIGN_PRICE_ID
      );

      if (isHiddenCampaignPurchase) {
        const email = session.customer_details?.email;

        console.log("Hidden Campaign purchase detected", email);

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
            trialEndDate.setDate(trialEndDate.getDate() + 30);

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
              console.error("Unable to grant trial access", profileError);
            }

            const { error: emailError } = await getResend().emails.send({
              from: "Multirrupt Gravitas <support@multirrupt.ai>",
              to: email,
              subject: "Your Hidden Campaign access is ready",
              html: `
                <p>Hi,</p>

                <p>Thanks for purchasing <strong>The Hidden Campaign Method</strong>.</p>

                <p>Your access is now ready.</p>

                <p>
                  <strong>Download the guide:</strong><br />
                  <a href="https://ixhbcjippdxzdhlerndj.supabase.co/storage/v1/object/public/downloads/hidden-campaign.pdf">Download The Hidden Campaign PDF</a>
                </p>

                <p>
                  <strong>Watch the companion video:</strong><br />
                  <a href="https://youtu.be/NTg_eVFycz4">Watch the companion video</a>
                </p>

                <p>
                  <strong>Access Gravitas:</strong><br />
                  <a href="https://www.multirrupt.ai">Open Gravitas</a>
                </p>

                <p>
                  Use the same email address you used to purchase the book. Gravitas will send you a magic login link.
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
              console.error("Unable to send Hidden Campaign email", emailError);
            } else {
              await addToMailchimp(email);
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
    }

    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;

      await supabase
        .from("subscriptions")
        .update({ status: subscription.status })
        .eq("stripe_subscription_id", subscription.id);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", subscription.id);
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