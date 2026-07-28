/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getActiveSourceKey,
  getAnalysisRunKey,
  hasCompletedAnalysis,
} = require("../lib/graviton-runs.ts");

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
