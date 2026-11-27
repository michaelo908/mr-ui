import "server-only";
import { createHash } from "node:crypto";
import { stripe } from "@/lib/supabase/stripe";
import { auditAdmin } from "./server";

export function miniCouponId(key: string) {
  return `audit-mini-${createHash("sha256").update(key).digest("hex")}`;
}
export async function miniUpgradeCoupon(userId: string) {
  const { data, error } = await auditAdmin().from("reader_audit_entitlements")
    .select("entitlement_key").eq("user_id", userId).eq("kind", "mini")
    .is("upgrade_credit_used_at", null);
  if (error) throw new Error("Could not verify your homepage audit credit. Please try again.");
  for (const row of data || []) {
    const id = miniCouponId(row.entitlement_key);
    let coupon;
    try { coupon = await stripe.coupons.retrieve(id); }
    catch (error) {
      if ((error as { code?: string }).code !== "resource_missing") throw error;
      try {
        coupon = await stripe.coupons.create({ id, amount_off: 500, currency: "usd",
          duration: "once", max_redemptions: 1, name: "Homepage audit credit",
          metadata: { user_id: userId, mini_entitlement: row.entitlement_key } },
          { idempotencyKey: id });
      } catch (error) {
        // Another checkout may have created the same deterministic coupon.
        if ((error as { code?: string }).code !== "resource_already_exists") throw error;
        coupon = await stripe.coupons.retrieve(id);
      }
    }
    if (coupon.valid && !coupon.livemode && coupon.amount_off === 500 && coupon.currency === "usd"
      && coupon.max_redemptions === 1 && coupon.metadata?.user_id === userId) {
      return { key: row.entitlement_key, coupon: id };
    }
  }
  return null;
}
