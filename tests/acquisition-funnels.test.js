/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("three doorway routes contain their exact approved conversion copy and assets", () => {
  const config = read("lib/acquisition-funnels.ts");
  const contracts = [
    ["email", "email-hero.png", "Before you send an important email, know how it will land.", "Start my free 20-minute email check"],
    ["proposal", "proposal-hero.png", "Before you send the proposal, find the hesitation.", "Start my free 20-minute proposal check"],
    ["landing-page", "landing-page-hero.png", "Before you spend more on traffic, see what your visitors experience.", "Start my free 20-minute landing page check"],
  ];
  for (const [slug, image, headline, cta] of contracts) {
    assert.match(config, new RegExp(`slug: "${slug}"`));
    assert.match(config, new RegExp(image.replace(".", "\\.")));
    assert.equal(fs.existsSync(path.join(root, "public", "doorways", image)), true);
    assert.ok(config.includes(headline));
    assert.ok(config.includes(cta));
  }
  assert.match(config, /gravitas_email_check_lead/);
  assert.match(config, /gravitas_proposal_check_lead/);
  assert.match(config, /gravitas_landing_page_check_lead/);
  assert.doesNotMatch(config, /No card required\. Your 20 minutes begins with your first analysis\./);
});

test("shared doorway renders one hero and no legacy explanatory sections", () => {
  const page = read("components/AcquisitionLandingPage.tsx");
  assert.match(page, /funnel\.heroImage/);
  assert.match(page, /funnel\.formHeading/);
  assert.match(page, /funnel\.formExplanation/);
  assert.doesNotMatch(page, /funnel\.eyebrow|funnel\.problemTitle|funnel\.missedTitle|funnel\.sees/);
  assert.doesNotMatch(page, /What Gravitas sees/);
});

test("doorway renders mandatory disclosure beneath the CTA without an optional checkbox", () => {
  const page = read("components/AcquisitionLandingPage.tsx");
  const config = read("lib/acquisition-funnels.ts");
  const signup = read("app/api/acquisition/signup/route.ts");
  assert.match(config, /By starting your free check, you agree to receive occasional Gravitas emails\. You can unsubscribe at any time\./);
  assert.match(page, /<button[\s\S]*?funnel\.cta[\s\S]*?<\/button>\s*<p[^>]*>\{ACQUISITION_CONSENT_DISCLOSURE\}<\/p>/);
  assert.doesNotMatch(page, /type="checkbox"/);
  assert.doesNotMatch(page, /Send me this check and a short series of useful Gravitas follow-ups/);
  assert.doesNotMatch(page, /No card required/);
  assert.match(page, /firstTouch: identity\.firstTouch/);
  assert.match(page, /lastTouch: identity\.lastTouch/);
  assert.match(page, /funnel: funnel\.slug/);
  assert.match(page, /window\.location\.assign\(`\/jump-in\?\$\{query\.toString\(\)\}`\)/);
  assert.match(signup, /!funnel \|\| !firstName \|\| !EMAIL\.test\(email\)/);
  assert.doesNotMatch(signup, /body\?\.consent/);
  assert.match(signup, /addMailchimpLead/);
});

test("Mailchimp activation requires deliberate draft or complete live configuration", () => {
  const mailchimp = read("lib/mailchimp.ts");
  assert.match(mailchimp, /mode === "draft"/);
  assert.match(mailchimp, /mode !== "live" \|\| !apiKey \|\| !audienceId \|\| !server/);
  assert.match(mailchimp, /missing_configuration/);
  assert.match(mailchimp, /status_if_new: "subscribed"/);
  assert.doesNotMatch(mailchimp, /status: "subscribed"/);
});

test("signup tracks funnel without placing identity in Signals", () => {
  const signup = read("app/api/acquisition/signup/route.ts");
  assert.match(signup, /acquisition\.signup_completed/);
  assert.match(signup, /properties: \{[\s\S]*funnel: funnel\.slug/);
  assert.match(signup, /consent_version: ACQUISITION_CONSENT_VERSION/);
  assert.match(signup, /mailchimp_failure_category/);
  assert.doesNotMatch(signup, /properties: \{[^}]*email/s);
});

test("Mailchimp failures remain observable without blocking the Jump In handoff", () => {
  const signup = read("app/api/acquisition/signup/route.ts");
  assert.match(signup, /console\.warn\("Acquisition Mailchimp capture failed"/);
  assert.match(signup, /runtime: process\.env\.VERCEL_ENV \|\| process\.env\.NODE_ENV/);
  assert.match(signup, /integration: mailchimp\?\.outcome \?\? "unavailable"/);
  assert.match(signup, /return NextResponse\.json\(\{[\s\S]*?ok: true/);
  assert.doesNotMatch(signup, /Authorization/);
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
