import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/supabase/stripe";
import { createClient } from "@/lib/supabase/server";
import { resolveLifecycle } from "@/lib/lifecycle";

function safeReturnPath(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://return.invalid");
    return parsed.origin === "https://return.invalid" ? `${parsed.pathname}${parsed.search}${parsed.hash}` : "/";
  } catch {
    return "/";
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data: subscription, error } = await admin.from("subscriptions")
    .select("stripe_customer_id, stripe_subscription_id, status, paid_through, grace_ends_at, cancel_at_period_end")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Billing lookup failed" }, { status: 503 });
  const lifecycle = resolveLifecycle({ subscription });
  if (
    lifecycle.state !== "subscriber" ||
    !subscription?.stripe_customer_id ||
    !subscription.stripe_subscription_id
  ) {
    return NextResponse.json({ error: "No managed subscription found" }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.multirrupt.ai";
  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripe_customer_id,
      return_url: new URL(safeReturnPath(body?.returnPath), appUrl).toString(),
    });
    return NextResponse.json({ url: session.url });
  } catch {
    console.warn("Stripe billing portal creation failed", {
      provider: "stripe",
      category: "billing_portal_creation_failed",
      retryable: true,
    });
    return NextResponse.json({ error: "Billing portal unavailable" }, { status: 502 });
  }
}
