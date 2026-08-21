/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("webhook supports the bounded Stripe event set and ignores unsupported events", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  for (const event of [
    "checkout.session.completed",
    "checkout.session.async_payment_succeeded",
    "checkout.session.async_payment_failed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.paid",
    "invoice.payment_failed",
  ]) assert.match(route, new RegExp(event.replaceAll(".", "\\.")));
  assert.match(route, /ignored: true/);
  assert.match(route, /"cancelled"/);
  assert.match(route, /"past_due"/);
  assert.match(route, /event\.type === "invoice\.paid" \? "active" : "past_due"/);
});

test("entitlement writes precede communication and every authoritative write is checked", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  const fulfilment = route.slice(route.indexOf("async function fulfilDayPass"), route.indexOf("async function sendSubscriptionActivation"));
  assert.ok(fulfilment.indexOf("await grantDayPass") < fulfilment.indexOf("sendTransactionalEmail"));
  assert.match(route, /grantDayPass\(userId, event\.created\)/);
  assert.match(route, /if \(error\) throw new WebhookFailure\("day_pass_entitlement_write_failed"\)/);
  assert.match(route, /if \(error\) throw new WebhookFailure\("subscription_entitlement_write_failed"\)/);
  assert.match(route, /failure\.retryable[\s\S]*status: 500[\s\S]*rejected: true/);
});

test("Resend and Mailchimp are independent and paid buyers are not force-subscribed", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  const mailchimp = read("lib/mailchimp.ts");
  assert.match(route, /const communicationErrors:[\s\S]*try \{[\s\S]*sendTransactionalEmail[\s\S]*catch[\s\S]*try \{[\s\S]*syncDayPassMarketing/);
  assert.match(mailchimp, /method: "GET"/);
  assert.match(mailchimp, /memberResponse\.status === 404/);
  assert.doesNotMatch(mailchimp.slice(mailchimp.indexOf("tagExistingMailchimpDayPassBuyer")), /status_if_new/);
  assert.match(mailchimp, /member\.status !== "subscribed"/);
});

test("receipt migration provides atomic retry and cross-event effect idempotency", () => {
  const sql = read("supabase/migrations/202608220001_stripe_webhook_receipts.sql");
  assert.match(sql, /event_id text primary key/);
  assert.match(sql, /attempt_count integer not null default 1/);
  assert.match(sql, /effect_key text unique/);
  assert.match(sql, /current_status = 'retryable_failed'/);
  assert.match(sql, /interval '5 minutes'/);
  assert.match(sql, /existing_event_id = p_event_id/);
  assert.match(sql, /for update/);
  assert.doesNotMatch(sql, /email|first_name|payload json/i);
});

test("provider calls have idempotency and operational logs contain safe metadata only", () => {
  const route = read("app/api/stripe/webhook/route.ts");
  assert.match(route, /idempotencyKey: `stripe-\$\{input\.eventId\}-\$\{input\.effect\}`/);
  assert.doesNotMatch(route, /console\.(?:log|warn|error)\([^\n]*email/i);
  assert.doesNotMatch(route, /console\.(?:log|warn|error)\([^\n]*await .*\.text\(\)/i);
  assert.doesNotMatch(route, /console\.(?:log|warn|error)\([^\n]*apiKey/i);
  assert.match(route, /eventType: event\.type/);
  assert.match(route, /category: failure\.category/);
});

test("transactional email contracts are concise and environment-specific", () => {
  const source = read("lib/transactional-emails.ts");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, require, URL });
  const dayPass = mod.exports.dayPassAccessEmail("https://gravitas-staging.multirrupt.ai");
  const subscription = mod.exports.subscriptionActivationEmail("https://gravitas-staging.multirrupt.ai");
  assert.equal(dayPass.subject, "Your Gravitas Day Pass is ready");
  assert.equal(subscription.subject, "Your Gravitas subscription is active");
  for (const email of [dayPass, subscription]) {
    assert.equal(email.loginUrl, "https://gravitas-staging.multirrupt.ai/login");
    assert.match(email.html, /Open Gravitas/);
    assert.match(email.text, /https:\/\/gravitas-staging\.multirrupt\.ai\/login/);
    assert.match(email.text, /support@multirrupt\.ai/);
    assert.doesNotMatch(email.html + email.text, /Hidden Campaign|three rewrites|cross-device/i);
  }
  assert.doesNotMatch(subscription.html + subscription.text, /Day Pass|Jump In/i);
});

test("subscription checkout propagates user ownership to the Stripe subscription", () => {
  const checkout = read("app/api/stripe/checkout/route.ts");
  assert.match(checkout, /subscription_data:\s*\{\s*metadata:\s*\{ user_id: user\.id \}/);
});
