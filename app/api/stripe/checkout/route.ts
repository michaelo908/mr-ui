import { after, NextResponse } from "next/server";
import { stripe } from "../../../../lib/supabase/stripe";
import { createClient } from "../../../../lib/supabase/server";
import { recordSignal, signalContextFromRequest } from "@/lib/signals/server";
import { sanitizeAttribution, type SignalAttribution } from "@/lib/signals/contracts";

function attributionMetadata(prefix: "ft" | "lt", attribution?: SignalAttribution) {
  if (!attribution) return {};
  const values = {
    [`gravitas_${prefix}_path`]: attribution.landingPath,
    [`gravitas_${prefix}_referrer`]: attribution.referrerHost,
    [`gravitas_${prefix}_utm_source`]: attribution.utmSource,
    [`gravitas_${prefix}_utm_medium`]: attribution.utmMedium,
    [`gravitas_${prefix}_utm_campaign`]: attribution.utmCampaign,
    [`gravitas_${prefix}_utm_content`]: attribution.utmContent,
    [`gravitas_${prefix}_meta_campaign`]: attribution.metaCampaignId,
    [`gravitas_${prefix}_meta_adset`]: attribution.metaAdSetId,
    [`gravitas_${prefix}_meta_ad`]: attribution.metaAdId,
    [`gravitas_${prefix}_hypothesis`]: attribution.creativeHypothesis,
  };
  return Object.fromEntries(Object.entries(values).filter((entry): entry is [string, string] => Boolean(entry[1])));
}

export async function POST(req: Request) {
  const signalContext = signalContextFromRequest(req);
  try {
    const requestBody = await req.json().catch(() => ({}));
    const firstTouch = sanitizeAttribution(requestBody?.firstTouch);
    const lastTouch = sanitizeAttribution(requestBody?.lastTouch);
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
        ...(signalContext.visitorId ? { gravitas_visitor_id: signalContext.visitorId } : {}),
        ...(signalContext.sessionId ? { gravitas_session_id: signalContext.sessionId } : {}),
        gravitas_surface: signalContext.surface,
        ...attributionMetadata("ft", firstTouch),
        ...attributionMetadata("lt", lastTouch),
      },
    });

    after(() => recordSignal("purchase.checkout_started", {
      ...signalContext,
      userId: user.id,
      verified: true,
      dedupeKey: `checkout:${session.id}:started`,
      properties: { checkout_session_id: session.id, purchase_type: "subscription" },
      firstTouch,
      lastTouch,
    }));

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error(error);
    after(() => recordSignal("purchase.checkout_failed", {
      ...signalContext,
      verified: true,
      properties: { failure_stage: "checkout_creation" },
    }));
    return NextResponse.json({ error: "Stripe session failed" }, { status: 500 });
  }
}
