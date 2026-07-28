/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getActiveSourceKey,
  getAnalysisRunKey,
  hasReadySource,
  hasCompletedAnalysis,
  isValidPublicHttpUrl,
} = require("../lib/graviton-runs.ts");

test("fresh valid public HTTP and HTTPS URLs are accepted", () => {
  assert.equal(isValidPublicHttpUrl("https://example.com/page"), true);
  assert.equal(isValidPublicHttpUrl(" http://example.com "), true);
});

test("empty, incomplete, and unsupported URLs are rejected", () => {
  assert.equal(isValidPublicHttpUrl(""), false);
  assert.equal(isValidPublicHttpUrl("example.com"), false);
  assert.equal(isValidPublicHttpUrl("ftp://example.com"), false);
  assert.equal(isValidPublicHttpUrl("not a url"), false);
});

test("switching source modes derives readiness only from the active source", () => {
  assert.equal(hasReadySource({ type: "text", text: "" }), false);
  assert.equal(
    hasReadySource({ type: "url", url: "https://example.com" }),
    true
  );
  assert.equal(hasReadySource({ type: "images", images: [] }), false);
  assert.equal(hasReadySource({ type: "text", text: "New copy" }), true);
});

test("same source and same Graviton are blocked after completion", () => {
  const sourceKey = getActiveSourceKey({ type: "text", text: "Source A" });
  const completed = new Set([
    getAnalysisRunKey(sourceKey, "Full Analysis"),
  ]);

  assert.equal(
    hasCompletedAnalysis(completed, sourceKey, "Full Analysis"),
    true
  );
});

test("same source allows a different Graviton", () => {
  const sourceKey = getActiveSourceKey({ type: "text", text: "Source A" });
  const completed = new Set([
    getAnalysisRunKey(sourceKey, "Full Analysis"),
  ]);

  assert.equal(
    hasCompletedAnalysis(completed, sourceKey, "What weakens trust?"),
    false
  );
});

test("changing text or URL resets the completed-run match", () => {
  const textA = getActiveSourceKey({ type: "text", text: "Source A" });
  const textB = getActiveSourceKey({ type: "text", text: "Source B" });
  const urlA = getActiveSourceKey({
    type: "url",
    url: "https://example.com/a",
  });
  const urlB = getActiveSourceKey({
    type: "url",
    url: "https://example.com/b",
  });
  const completed = new Set([
    getAnalysisRunKey(textA, "Full Analysis"),
    getAnalysisRunKey(urlA, "Full Analysis"),
  ]);

  assert.equal(hasCompletedAnalysis(completed, textB, "Full Analysis"), false);
  assert.equal(hasCompletedAnalysis(completed, urlB, "Full Analysis"), false);
});

test("changing an image set resets the completed-run match", () => {
  const firstSet = getActiveSourceKey({
    type: "images",
    images: [{ name: "one.jpg", size: 100, lastModified: 1 }],
  });
  const secondSet = getActiveSourceKey({
    type: "images",
    images: [{ name: "two.jpg", size: 100, lastModified: 1 }],
  });
  const completed = new Set([
    getAnalysisRunKey(firstSet, "Full Analysis"),
  ]);

  assert.equal(
    hasCompletedAnalysis(completed, secondSet, "Full Analysis"),
    false
  );
});

test("a completed Graviton stays blocked after another lens runs", () => {
  const sourceKey = getActiveSourceKey({ type: "text", text: "Source A" });
  const completed = new Set([
    getAnalysisRunKey(sourceKey, "Full Analysis"),
    getAnalysisRunKey(sourceKey, "What weakens trust?"),
  ]);

  assert.equal(
    hasCompletedAnalysis(completed, sourceKey, "Full Analysis"),
    true
  );
});

test("a failed URL render does not create a completed Source–Graviton lock", () => {
  const sourceKey = getActiveSourceKey({
    type: "url",
    url: "https://example.com/retry",
  });
  const completed = new Set();

  assert.equal(
    hasCompletedAnalysis(completed, sourceKey, "Full Analysis"),
    false
  );
});
