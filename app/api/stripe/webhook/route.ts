import Stripe from "stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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
    return NextResponse.json(
      { error: "Invalid webhook signature" },
      { status: 400 }
    );
  }

  try {
    // ✅ CHECKOUT COMPLETED (new subscription)
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
      const trialEndDate = new Date();
      trialEndDate.setDate(trialEndDate.getDate() + 30);

      await supabase.from("profiles").upsert(
        {
          id: userId,
          access_level: "trial",
          trial_start_date: new Date().toISOString(),
          trial_end_date: trialEndDate.toISOString(),
        },
        { onConflict: "id" }
      );
    }
  }
}
      const userID = session.metadata?.user_id;
      const customerId =
        typeof session.customer === "string" ? session.customer : null;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : null;

      if (userID) {
        await supabase.from("subscriptions").upsert(
          {
            user_id: userID,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            status: "active",
          },
          { onConflict: "user_id" }
        );
      }
    }

    // ✅ SUBSCRIPTION UPDATED (status changes)
    if (event.type === "customer.subscription.updated") {
      const subscription = event.data.object as Stripe.Subscription;

      const subscriptionId = subscription.id;
      const status = subscription.status;

      await supabase
        .from("subscriptions")
        .update({ status })
        .eq("stripe_subscription_id", subscriptionId);
    }

    // ✅ SUBSCRIPTION CANCELLED / DELETED
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;

      const subscriptionId = subscription.id;

      await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("stripe_subscription_id", subscriptionId);
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