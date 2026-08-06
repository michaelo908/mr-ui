/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isPrivacySensitivePropertyKey,
  sanitizeAttribution,
  sanitizeHostname,
  sanitizePropertiesWithRules,
  sanitizeRelativePathname,
} = require("../lib/signals/privacy.ts");
const { buildSignalRateLimitBucket } = require("../lib/signals/rate-limit.ts");

test("public properties retain only declared bounded primitives", () => {
  const rules = {
    format: { type: "enum", values: ["email", "word"] },
    evidence_number: { type: "integer", min: 1, max: 16 },
  };
  assert.deepEqual(sanitizePropertiesWithRules({ format: "word", evidence_number: 3, arbitrary: true }, rules), { format: "word", evidence_number: 3 });
  assert.deepEqual(sanitizePropertiesWithRules({ format: "pdf", evidence_number: 99 }, rules), {});
});

test("raw source, report output, images, URLs and customer fields cannot enter public properties", () => {
  const hostile = {
    email: "person@example.com", customer_name: "Person", source_text: "private source",
    generated_output: "private report", image_payload: "data:image/png", destination_url: "https://private.example/path",
  };
  assert.deepEqual(sanitizePropertiesWithRules(hostile, {}), {});
  for (const key of Object.keys(hostile)) assert.equal(isPrivacySensitivePropertyKey(key), true);
});

test("landing attribution keeps only a relative pathname and strips query and fragment", () => {
  assert.equal(sanitizeRelativePathname("/jump-in?email=private#section"), "/jump-in");
  assert.equal(sanitizeRelativePathname("https://example.com/private?token=1"), undefined);
  assert.equal(sanitizeRelativePathname("//example.com/private"), undefined);
});

test("referrers are hostname-only and campaign values are identifier-safe", () => {
  assert.equal(sanitizeHostname("Ads.Example.COM."), "ads.example.com");
  assert.equal(sanitizeHostname("https://ads.example.com/path"), undefined);
  assert.deepEqual(sanitizeAttribution({
    landingPath: "/jump-in?secret=1", referrerHost: "ads.example.com",
    utmCampaign: "founder_launch-1", metaAdId: "123456", creativeHypothesis: "pain-led-v2",
    utmContent: "not safe content",
  }), {
    landingPath: "/jump-in", referrerHost: "ads.example.com",
    utmCampaign: "founder_launch-1", metaAdId: "123456", creativeHypothesis: "pain-led-v2",
  });
});

test("rate-limit buckets are deterministic, daily rotating and never contain the raw address", () => {
  const secret = "a-secure-test-secret-with-more-than-32-characters";
  const first = buildSignalRateLimitBucket("203.0.113.42", secret, new Date("2026-08-06T00:00:00Z"));
  const same = buildSignalRateLimitBucket("203.0.113.42", secret, new Date("2026-08-06T23:59:00Z"));
  const next = buildSignalRateLimitBucket("203.0.113.42", secret, new Date("2026-08-07T00:00:00Z"));
  assert.equal(first, same);
  assert.notEqual(first, next);
  assert.equal(first.length, 64);
  assert.equal(first.includes("203.0.113.42"), false);
});
