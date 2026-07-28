/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createAnalysisRunCoordinator,
} = require("../lib/analysis-run-coordinator.ts");

test("rapid repeated starts admit exactly one analysis run", () => {
  const runs = createAnalysisRunCoordinator();
  assert.equal(runs.tryStart("run-a"), true);
  assert.equal(runs.tryStart("run-b"), false);
  assert.equal(runs.isActive(), true);
});

test("stale responses cannot finish or replace the active run", () => {
  const runs = createAnalysisRunCoordinator();
  runs.tryStart("run-a");
  assert.equal(runs.isCurrent("run-b"), false);
  assert.equal(runs.finish("run-b"), false);
  assert.equal(runs.isCurrent("run-a"), true);
});

test("success or failure completion releases the gate for retry", () => {
  const runs = createAnalysisRunCoordinator();
  runs.tryStart("failed-run");
  assert.equal(runs.finish("failed-run"), true);
  assert.equal(runs.tryStart("retry-run"), true);
});
