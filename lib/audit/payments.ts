import "server-only";
import { miniCouponId } from "./pricing";
import type Stripe from "stripe";
import { auditAdmin, auditSignal, requireAuditEnvironment } from "./server";
export async function fulfilAuditPayment(session: Stripe.Checkout.Session) {
  const kind = session.metadata?.reader_audit_kind;
  if (kind !== "mini" && kind !== "comprehensive" && kind !== "readiness") return false;
  requireAuditEnvironment();
  const creditKey = session.metadata?.mini_credit_key;
  const amount = kind === "mini" ? 500 : kind === "comprehensive" ? (creditKey ? 5400 : 5900) : 2900;
  if (
    session.livemode ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    session.amount_total !== amount ||
    !session.metadata?.user_id
  )
    throw new Error("Invalid audit payment.");
  if (creditKey) {
    const { data: credit, error } = await auditAdmin().from("reader_audit_entitlements").select("entitlement_key").eq("entitlement_key", creditKey).eq("user_id", session.metadata.user_id).eq("kind", "mini").maybeSingle();
    const applied = session.discounts?.some(d => (typeof d.coupon === "string" ? d.coupon : d.coupon?.id) === miniCouponId(creditKey));
    if (kind !== "comprehensive" || error || !credit || !applied || session.total_details?.amount_discount !== 500) throw new Error("Invalid mini audit credit.");
  }
  const { error } = await auditAdmin()
    .from("reader_audit_entitlements")
    .upsert(
      {
        entitlement_key: `checkout:${session.id}`,
        user_id: session.metadata.user_id,
        kind,
        parent_id:
          kind === "readiness" ? session.metadata.parent_audit_id : null,
      },
      { onConflict: "entitlement_key", ignoreDuplicates: true },
    );
  if (error) throw error;
  if (creditKey) {
    const { error: creditError } = await auditAdmin().from("reader_audit_entitlements").update({ upgrade_credit_used_at: new Date().toISOString() }).eq("entitlement_key", creditKey).eq("user_id", session.metadata.user_id).is("upgrade_credit_used_at", null);
    if (creditError) throw creditError;
  }
  await auditSignal(
    "audit.purchased",
    {
      id: session.metadata.audit_request_id || session.id,
      kind,
      user_id: session.metadata.user_id,
    },
    {
      amount_total: amount,
      visitor_id: session.metadata.audit_visitor_id || "",
    },
  );
  return true;
}
