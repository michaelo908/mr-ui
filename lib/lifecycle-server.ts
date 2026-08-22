import "server-only";

import { createClient } from "@supabase/supabase-js";
import { resolveLifecycle } from "@/lib/lifecycle";
import { createClient as createSessionClient } from "@/lib/supabase/server";

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function resolveLifecycleForEmail(email: string) {
  const admin = adminClient();
  const normalized = email.trim().toLowerCase();
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error("lifecycle_user_lookup_failed");
  const user = data.users.find((candidate) => candidate.email?.toLowerCase() === normalized);
  if (!user) return resolveLifecycle({});

  return resolveLifecycleForUserId(user.id, admin);
}

export async function resolveLifecycleForUserId(
  userId: string,
  suppliedAdmin = adminClient(),
) {
  const [{ data: subscription, error: subscriptionError }, { data: profile, error: profileError }] =
    await Promise.all([
      suppliedAdmin.from("subscriptions")
        .select("status, stripe_subscription_id, paid_through, grace_ends_at, cancel_at_period_end")
        .eq("user_id", userId)
        .maybeSingle(),
      suppliedAdmin.from("profiles").select("trial_end_date").eq("id", userId).maybeSingle(),
    ]);
  if (subscriptionError || profileError) throw new Error("lifecycle_entitlement_lookup_failed");
  return resolveLifecycle({ subscription, dayPassExpiresAt: profile?.trial_end_date ?? null });
}

export async function authenticatedLifecycle() {
  const session = await createSessionClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return null;
  return { user, lifecycle: await resolveLifecycleForUserId(user.id) };
}
