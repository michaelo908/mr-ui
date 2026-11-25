/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { jumpInPurchaseUrl, readJumpInPurchaseReference } = require("../lib/signals/jump-in-purchase.ts");
const identity = { visitorId: "123e4567-e89b-42d3-a456-426614174000", sessionId: "123e4567-e89b-42d3-a456-426614174001" };
test("anonymous Day Pass checkout preserves journey IDs without personal information", () => {
  const url = new URL(jumpInPurchaseUrl("https://buy.stripe.com/example?locale=en", identity));
  assert.equal(url.searchParams.get("locale"), "en");
  assert.deepEqual(readJumpInPurchaseReference(url.searchParams.get("client_reference_id")), { ...identity, surface: "jump-in" });
});
test("unrelated, missing or malformed purchase references remain unlinked", () => {
  for (const value of [null, undefined, "", "customer_123", "ji_invalid", "person@example.com"]) assert.equal(readJumpInPurchaseReference(value), null);
  assert.equal(jumpInPurchaseUrl("https://buy.stripe.com/example", { visitorId: "bad", sessionId: "bad" }), "https://buy.stripe.com/example");
});
