export type GravitasLifecycleState = "jump_in" | "day_pass" | "subscriber";

export type SubscriptionLifecycleRecord = {
  status: string | null;
  stripe_subscription_id?: string | null;
  paid_through?: string | null;
  grace_ends_at?: string | null;
  cancel_at_period_end?: boolean | null;
};

export type LifecycleResolution = {
  state: GravitasLifecycleState;
  qualifier: "active" | "past_due_grace" | "cancelled_entitled" | "expired";
  dayPassExpiresAt: string | null;
  subscriptionPaidThrough: string | null;
  canManageBilling: boolean;
};

function timestamp(value?: string | null) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function hasSubscriberAccess(
  subscription: SubscriptionLifecycleRecord | null | undefined,
  nowMs = Date.now(),
) {
  if (!subscription) return false;
  const status = subscription.status?.toLowerCase() ?? "";
  const paidThrough = timestamp(subscription.paid_through);
  const graceEndsAt = timestamp(subscription.grace_ends_at);
  const isManual = !subscription.stripe_subscription_id && status === "active";

  if (isManual) return true;
  if ((status === "active" || status === "trialing") && (!paidThrough || paidThrough > nowMs)) {
    return true;
  }
  if ((status === "past_due" || status === "unpaid") && graceEndsAt && graceEndsAt > nowMs) {
    return true;
  }
  if ((status === "canceled" || status === "cancelled") && paidThrough && paidThrough > nowMs) {
    return true;
  }
  return false;
}

export function resolveLifecycle(input: {
  subscription?: SubscriptionLifecycleRecord | null;
  dayPassExpiresAt?: string | null;
  nowMs?: number;
}): LifecycleResolution {
  const nowMs = input.nowMs ?? Date.now();
  const subscription = input.subscription ?? null;
  const graceEndsAt = timestamp(subscription?.grace_ends_at);
  const status = subscription?.status?.toLowerCase() ?? "";
  const subscriber = hasSubscriberAccess(subscription, nowMs);

  if (subscriber) {
    const qualifier =
      (status === "past_due" || status === "unpaid") && graceEndsAt && graceEndsAt > nowMs
        ? "past_due_grace"
        : (status === "canceled" || status === "cancelled" || subscription?.cancel_at_period_end)
          ? "cancelled_entitled"
          : "active";
    return {
      state: "subscriber",
      qualifier,
      dayPassExpiresAt: input.dayPassExpiresAt ?? null,
      subscriptionPaidThrough: subscription?.paid_through ?? null,
      canManageBilling: Boolean(subscription?.stripe_subscription_id),
    };
  }

  const dayPassExpiresAt = timestamp(input.dayPassExpiresAt);
  if (dayPassExpiresAt && dayPassExpiresAt > nowMs) {
    return {
      state: "day_pass",
      qualifier: "active",
      dayPassExpiresAt: input.dayPassExpiresAt ?? null,
      subscriptionPaidThrough: subscription?.paid_through ?? null,
      canManageBilling: false,
    };
  }

  return {
    state: "jump_in",
    qualifier: subscription || dayPassExpiresAt ? "expired" : "active",
    dayPassExpiresAt: input.dayPassExpiresAt ?? null,
    subscriptionPaidThrough: subscription?.paid_through ?? null,
    canManageBilling: false,
  };
}

export function lifecycleRank(state: GravitasLifecycleState) {
  return state === "subscriber" ? 3 : state === "day_pass" ? 2 : 1;
}

export function higherLifecycle(
  current: GravitasLifecycleState | null | undefined,
  proposed: GravitasLifecycleState,
) {
  return current && lifecycleRank(current) > lifecycleRank(proposed) ? current : proposed;
}

export function calculateDayPassExpiry(currentExpiryMs: number | null, purchaseTimeMs: number) {
  return Math.max(currentExpiryMs ?? purchaseTimeMs, purchaseTimeMs) + 48 * 60 * 60 * 1000;
}

export function calculateGraceEnd(paidThroughMs: number | null, failureTimeMs: number) {
  return Math.max(paidThroughMs ?? failureTimeMs, failureTimeMs) + 3 * 24 * 60 * 60 * 1000;
}
