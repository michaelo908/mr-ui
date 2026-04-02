import { NextResponse } from "next/server";
import { stripe } from "../../../../lib/supabase/stripe";
import { createClient } from "../../../../lib/supabase/server";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      billing_address_collection: "auto",
      phone_number_collection: {
        enabled: true,
      },
      custom_fields: [
        {
          key: "company_name",
          label: {
            type: "custom",
            custom: "Company name",
          },
          type: "text",
          optional: true,
        },
      ],
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}`,
      metadata: {
        user_id: user.id,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Stripe session failed" }, { status: 500 });
  }
}