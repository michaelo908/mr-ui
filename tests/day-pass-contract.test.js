/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Day Pass fulfilment grants only 48-hour Gravitas access", () => {
  const webhook = read("app/api/stripe/webhook/route.ts");
  const lifecycleMigration = read("supabase/migrations/202608220002_simplified_lifecycle.sql");

  assert.match(webhook, /process\.env\.STRIPE_DAY_PASS_PRICE_ID/);
  assert.match(webhook, /process\.env\.NEXT_PUBLIC_APP_URL/);
  assert.match(lifecycleMigration, /interval '48 hours'/);
  assert.match(webhook, /dayPassAccessEmail\(GRAVITAS_APP_URL, entitlement\.expiresAt\)/);
  assert.match(webhook, /getResend\(\)\.emails\.send/);
  assert.match(webhook, /Gravitas Staging <support@multirrupt\.ai>/);
  assert.match(webhook, /from: GRAVITAS_EMAIL_SENDER/);
  assert.match(webhook, /communicationErrors/);
  assert.doesNotMatch(webhook, /Hidden Campaign/i);
  assert.doesNotMatch(webhook, /hidden-campaign\.pdf/i);
});

test("Day Pass UI promises US$19 for 48 hours without a bundled asset", () => {
  const app = read("components/GravitasApp.tsx");
  const entitlement = read("lib/jump-in.ts");

  assert.match(app, /Get the US\$19 48-Hour Day Pass/);
  assert.match(app, /48 hours of full Gravitas access/);
  assert.doesNotMatch(app, /Hidden Campaign/i);
  assert.match(entitlement, /process\.env\.NEXT_PUBLIC_DAY_PASS_URL/);
});

test("Jump In and paid renewal share the configured Day Pass destination", () => {
  const app = read("components/GravitasApp.tsx");

  assert.match(app, /href=\{JUMP_IN_DAY_PASS_URL\}/);
  assert.match(app, /window\.location\.assign\(JUMP_IN_DAY_PASS_URL\)/);
  assert.match(
    app,
    /new 48-hour Day Pass here:\\n\\n\$\{JUMP_IN_DAY_PASS_URL\}/
  );
  assert.doesNotMatch(app, /https:\/\/multirrupt\.com\/day-pass/);
});

test("The Hidden Campaign remains independently available to Gravitas analysis", () => {
  const analysisRoute = read("app/api/mr/route.ts");
  assert.match(analysisRoute, /hidden campaign/i);
});
