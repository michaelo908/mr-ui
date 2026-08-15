/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("three curated funnel foundations are configured", () => {
  const config = read("lib/acquisition-funnels.ts");
  for (const slug of ["email", "proposal", "landing-page"]) assert.match(config, new RegExp(`slug: "${slug}"`));
  assert.match(config, /viewport by viewport/i);
  assert.match(config, /natural environment/i);
});

test("Mailchimp activation is explicitly gated", () => {
  const mailchimp = read("lib/mailchimp.ts");
  assert.match(mailchimp, /MAILCHIMP_SIGNUP_MODE !== "live"/);
  assert.match(mailchimp, /status_if_new: "subscribed"/);
});

test("signup tracks funnel without placing identity in Signals", () => {
  const signup = read("app/api/acquisition/signup/route.ts");
  assert.match(signup, /acquisition\.signup_completed/);
  assert.match(signup, /properties: \{ funnel: funnel\.slug/);
  assert.doesNotMatch(signup, /properties: \{[^}]*email/s);
});

test("funnel handoff preserves the existing Jump-In", () => {
  const page = read("app/jump-in/page.tsx");
  const app = read("components/GravitasApp.tsx");
  assert.match(page, /experience="jump-in"/);
  assert.match(page, /firstName/);
  assert.match(app, /funnel\?\.preferredSource/);
});

test("acquisition routes are public while the paid app stays protected", () => {
  const proxy = read("proxy.ts");
  assert.match(proxy, /"\/check"/);
  assert.match(proxy, /"\/api\/acquisition"/);
});

test("the database contract accepts acquisition signals and surfaces", () => {
  const migration = read("supabase/migrations/202608150001_gravitas_acquisition_signals.sql");
  assert.match(migration, /'acquisition','discovery'/);
  assert.match(migration, /'acquisition','jump-in'/);
});
