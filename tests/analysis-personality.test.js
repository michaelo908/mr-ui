/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldShowAnalysisEasterEgg,
} = require("../lib/analysis-personality.ts");

test("shows the personality line only after a successful analysis", () => {
  assert.equal(shouldShowAnalysisEasterEgg("success"), true);
});

test("hides the personality line during active analysis and on errors", () => {
  assert.equal(shouldShowAnalysisEasterEgg(undefined), false);
  assert.equal(shouldShowAnalysisEasterEgg("error"), false);
});
