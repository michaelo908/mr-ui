import "server-only";
import type Stripe from "stripe";
import { auditAdmin, auditSignal, requireAuditEnvironment } from "./server";
export async function fulfilAuditPayment(session: Stripe.Checkout.Session) {
  const kind = session.metadata?.reader_audit_kind;
  if (kind !== "comprehensive" && kind !== "readiness") return false;
  requireAuditEnvironment();
  const amount = kind === "comprehensive" ? 5900 : 2900;
  if (
    session.livemode ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    session.currency !== "usd" ||
    session.amount_total !== amount ||
    !session.metadata?.user_id
  )
    throw new Error("Invalid audit payment.");
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
