/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

function loadLifecycle() {
  const compiled = ts.transpileModule(read("lib/lifecycle.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require, Date });
  return mod.exports;
}

const lifecycle = loadLifecycle();
const now = Date.parse("2026-08-22T00:00:00.000Z");
const iso = (offsetMs) => new Date(now + offsetMs).toISOString();

test("subscriber outranks Day Pass and Jump In, including manual and grace access", () => {
  const active = lifecycle.resolveLifecycle({
    subscription: { status: "active", stripe_subscription_id: "sub_test", paid_through: iso(60_000) },
    dayPassExpiresAt: iso(120_000), nowMs: now,
  });
  assert.equal(active.state, "subscriber");
  const manual = lifecycle.resolveLifecycle({ subscription: { status: "active" }, nowMs: now });
  assert.equal(manual.state, "subscriber");
  const grace = lifecycle.resolveLifecycle({
    subscription: { status: "past_due", stripe_subscription_id: "sub_test", grace_ends_at: iso(60_000) },
    nowMs: now,
  });
  assert.equal(grace.state, "subscriber");
  assert.equal(grace.qualifier, "past_due_grace");
});

test("cancellation preserves paid access and final expiry falls back to Day Pass", () => {
  const scheduled = lifecycle.resolveLifecycle({
    subscription: {
      status: "active", stripe_subscription_id: "sub_test",
      paid_through: iso(60_000), cancel_at_period_end: true,
    },
    dayPassExpiresAt: iso(120_000), nowMs: now,
  });
  assert.equal(scheduled.state, "subscriber");
  assert.equal(scheduled.qualifier, "cancelled_entitled");
  const ended = lifecycle.resolveLifecycle({
    subscription: { status: "cancelled", stripe_subscription_id: "sub_test", paid_through: iso(-60_000) },
    dayPassExpiresAt: iso(120_000), nowMs: now,
  });
  assert.equal(ended.state, "day_pass");
});

test("Day Pass extension and grace calculations use the approved exact durations", () => {
  const twoDays = 48 * 60 * 60 * 1000;
  const threeDays = 3 * 24 * 60 * 60 * 1000;
  assert.equal(lifecycle.calculateDayPassExpiry(null, now), now + twoDays);
  assert.equal(lifecycle.calculateDayPassExpiry(now - 1, now), now + twoDays);
  assert.equal(lifecycle.calculateDayPassExpiry(now + 10_000, now), now + 10_000 + twoDays);
  assert.equal(lifecycle.calculateGraceEnd(null, now), now + threeDays);
  assert.equal(lifecycle.calculateGraceEnd(now + 10_000, now), now + 10_000 + threeDays);
});

test("lifecycle migration is additive, server-only, idempotent and stale-event safe", () => {
  const sql = read("supabase/migrations/202608220002_simplified_lifecycle.sql");
  assert.match(sql, /alter table public\.subscriptions[\s\S]*add column if not exists paid_through/);
  assert.match(sql, /create table if not exists public\.gravitas_day_pass_grants/);
  assert.match(sql, /event_id text primary key/);
  assert.match(sql, /recorded_expiry is not null/);
  assert.match(sql, /greatest\(coalesce\(current_expiry, p_purchase_time\), p_purchase_time\)[\s\S]*interval '48 hours'/);
  assert.match(sql, /existing_event_created_at > p_event_created_at/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.stripe_webhook_effects from public, anon, authenticated/);
  assert.doesNotMatch(sql, /delete from|truncate table|insert into public\.profiles\s*select/i);
});

test("webhook keeps access authoritative and communications independently retryable", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  assert.match(route, /grant_gravitas_day_pass/);
  assert.match(route, /claim_stripe_webhook_side_effect/);
  assert.match(route, /email:subscription-activation:\$\{subscriptionId\}/);
  assert.match(route, /email:payment-failed:/);
  assert.match(route, /email:cancellation-scheduled:/);
  assert.match(route, /const communicationErrors: unknown\[\]/);
  const fulfilment = route.slice(route.indexOf("async function fulfilDayPass"), route.indexOf("async function sendSubscriptionActivation"));
  assert.ok(fulfilment.indexOf("await grantDayPass") < fulfilment.indexOf("sendTransactionalEmail"));
  assert.match(fulfilment, /try \{[\s\S]*email:day-pass:[\s\S]*catch[\s\S]*try \{[\s\S]*mailchimp:day-pass:/);
  const invoice = route.slice(route.indexOf("async function processInvoice"), route.indexOf("async function processEvent"));
  assert.match(invoice, /event\.type === "invoice\.paid"[\s\S]*graceEndsAt: null/);
  assert.doesNotMatch(invoice, /sendSubscriptionActivation/);
  assert.match(route, /subscription\.cancel_at_period_end[\s\S]*cancellation-scheduled/);
  assert.doesNotMatch(route, /delete\(\)[\s\S]*workspace|removeActiveWorkspace/i);
});

test("signed subscription events are not replaced by an eventually stale Stripe read", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  const createdCase = route.slice(
    route.indexOf('case "customer.subscription.created"'),
    route.indexOf('case "customer.subscription.updated"'),
  );
  const updatedCase = route.slice(
    route.indexOf('case "customer.subscription.updated"'),
    route.indexOf('case "customer.subscription.deleted"'),
  );
  assert.match(createdCase, /event\.data\.object as Stripe\.Subscription/);
  assert.match(updatedCase, /event\.data\.object as Stripe\.Subscription/);
  assert.doesNotMatch(createdCase + updatedCase, /stripe\.subscriptions\.retrieve/);
});

test("Stripe cancel_at and cancel_at_period_end both normalize to scheduled cancellation", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  assert.match(route, /subscription\.cancel_at_period_end \|\| typeof subscription\.cancel_at === "number"/);
  assert.match(route, /cancelAtPeriodEnd: subscriptionCancellationScheduled\(subscription\)/);
  assert.match(route, /if \(subscriptionCancellationScheduled\(subscription\) && paidThrough && email\)/);
});

test("billing portal is authenticated, server-owned and return-path constrained", () => {
  const portal = read("app/api/stripe/portal/route.ts");
  assert.match(portal, /supabase\.auth\.getUser\(\)/);
  assert.match(portal, /\.eq\("user_id", user\.id\)/);
  assert.doesNotMatch(portal, /body\?\.customer|requestBody\?\.customer/);
  assert.match(portal, /startsWith\("\/\/"\)/);
  assert.match(portal, /billingPortal\.sessions\.create/);
  assert.doesNotMatch(portal, /console\.(?:log|warn|error)\([^\n]*(?:customer|secret|apiKey)/i);
});

test("paid model and URL operations use the canonical server-authoritative lifecycle", () => {
  const mr = read("app/api/mr/route.ts");
  const url = read("app/api/sources/url/route.ts");
  const access = read("app/api/access/route.ts");
  for (const source of [mr, url]) {
    assert.match(source, /authenticatedLifecycle\(\)/);
    assert.match(source, /lifecycle\.state === "jump_in"/);
    assert.match(source, /status: 403/);
  }
  assert.match(access, /authenticatedLifecycle\(\)/);
  assert.match(read("components/GravitasApp.tsx"), /fetch\("\/api\/access", \{ cache: "no-store" \}\)/);
});

test("doorway lifecycle lookup prevents a paid contact from being downgraded", () => {
  const signup = read("app/api/acquisition/signup/route.ts");
  const mailchimp = read("lib/mailchimp.ts");
  assert.match(signup, /resolveLifecycleForEmail\(email\)/);
  assert.match(signup, /lifecycleState/);
  assert.match(mailchimp, /higherLifecycle\(current, input\.proposed\)/);
  assert.match(mailchimp, /input\.authoritative[\s\S]*input\.proposed[\s\S]*higherLifecycle/);
  for (const tag of [
    "gravitas_email_check_lead",
    "gravitas_proposal_check_lead",
    "gravitas_landing_page_check_lead",
    "gravitas_doorway_consent_v1",
  ]) assert.match(read("lib/acquisition-funnels.ts"), new RegExp(tag));
  assert.match(mailchimp, /gravitas-day-pass-buyer/);
});

test("an authoritative subscription end may lower Mailchimp to the resolved fallback", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  const deleted = route.slice(
    route.indexOf('case "customer.subscription.deleted"'),
    route.indexOf('case "invoice.paid"'),
  );
  assert.match(deleted, /resolveLifecycleForUserId\(stored\.user_id, supabase\)/);
  assert.match(deleted, /mailchimp:subscription-ended:/);
  assert.match(deleted, /syncLifecycleMarketing\(email, lifecycle\.state, \[\], true\)/);
});

test("new lifecycle emails provide HTML, text and the protected billing destination", () => {
  const source = read("lib/transactional-emails.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require, URL, Intl, Date });
  for (const email of [
    mod.exports.paymentFailedEmail("https://gravitas-staging.multirrupt.ai", iso(60_000)),
    mod.exports.cancellationScheduledEmail("https://gravitas-staging.multirrupt.ai", iso(60_000)),
  ]) {
    assert.equal(email.billingUrl, "https://gravitas-staging.multirrupt.ai/billing");
    assert.match(email.html, /Manage billing/);
    assert.match(email.text, /https:\/\/gravitas-staging\.multirrupt\.ai\/billing/);
    assert.match(email.text, /support@multirrupt\.ai/);
    assert.doesNotMatch(email.html + email.text, /Hidden Campaign|cross-device|another browser/i);
  }
});
