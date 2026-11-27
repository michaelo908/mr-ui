import { NextResponse } from "next/server";
import { miniUpgradeCoupon } from "@/lib/audit/pricing";
import { stripe } from "@/lib/supabase/stripe";
import {
  auditVisitor,
  identity,
  ownedAudit,
  requireAuditEnvironment,
  sameOrigin,
} from "@/lib/audit/server";
export async function POST(req: Request) {
  try {
    requireAuditEnvironment();
    sameOrigin(req);
    const actor = await identity();
    if (!actor.user)
      return NextResponse.json(
        { error: "Sign in to purchase an audit." },
        { status: 401 },
      );
    const body = await req.json();
    const kind = body.kind;
    if (
      !["mini", "comprehensive", "readiness"].includes(kind) ||
      !/^[\da-f-]{36}$/i.test(body.requestId)
    )
      throw new Error("Invalid purchase.");
    if (kind === "readiness") {
      const parent = await ownedAudit(body.parentId);
      if (
        parent.kind !== "comprehensive" ||
        parent.status !== "completed" ||
        parent.user_id !== actor.user.id
      )
        throw new Error("Select a completed comprehensive audit.");
    }
    const credit = kind === "comprehensive" ? await miniUpgradeCoupon(actor.user.id) : null;
    const base = process.env.NEXT_PUBLIC_APP_URL!;
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        ...(credit ? { discounts: [{ coupon: credit.coupon }] } : {}),
        payment_method_types: ["card"],
        client_reference_id: actor.user.id,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: kind === "mini" ? 500 : kind === "comprehensive" ? 5900 : 2900,
              product_data: {
                name:
                  kind === "mini" ? "Multirrupt Homepage Reader Audit" : kind === "comprehensive"
                    ? "Multirrupt Reader Side Audit — up to five URLs"
                    : "Multirrupt AI Answer Readiness",
              },
            },
          },
        ],
        success_url: `${base}/audit?checkout={CHECKOUT_SESSION_ID}&kind=${kind}${kind === "readiness" ? `&parent=${encodeURIComponent(body.parentId)}` : ""}`,
        cancel_url: `${base}/audit`,
        metadata: {
          user_id: actor.user.id,
          mini_credit_key: credit?.key || "",
          audit_visitor_id: auditVisitor(actor.hash) || "",
          reader_audit_kind: kind,
          audit_request_id: body.requestId,
          parent_audit_id: body.parentId || "",
        },
      },
      { idempotencyKey: `reader-audit:${actor.user.id}:${body.requestId}` },
    );
    return NextResponse.json({ url: session.url });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Checkout unavailable.",
      },
      { status: 400 },
    );
  }
}
