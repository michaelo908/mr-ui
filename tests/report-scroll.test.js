/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateEditorSummaryScrollTop,
} = require("../lib/report-scroll.ts");

test("desktop reports place Editor's Summary near the preferred browser offset", () => {
  const top = calculateEditorSummaryScrollTop({
    currentScrollTop: 600,
    scrollerTop: 80,
    targetTop: 780,
    viewportHeight: 1000,
  });
  assert.equal(top, 1260);
  assert.equal(80 + (600 + 780 - 80 - top), 120);
});

test("mobile reports retain a comfortable inset when the report starts lower", () => {
  const top = calculateEditorSummaryScrollTop({
    currentScrollTop: 320,
    scrollerTop: 150,
    targetTop: 620,
    viewportHeight: 720,
  });
  assert.equal(top, 770);
  assert.equal(320 + 620 - 150 - top, 20);
});

test("short reports never request negative scroll positions", () => {
  assert.equal(
    calculateEditorSummaryScrollTop({
      currentScrollTop: 0,
      scrollerTop: 180,
      targetTop: 190,
      viewportHeight: 900,
    }),
    0
  );
});

test("long reports use target geometry rather than report length", () => {
  const common = {
    currentScrollTop: 5000,
    scrollerTop: 100,
    targetTop: 900,
    viewportHeight: 1200,
  };
  assert.equal(calculateEditorSummaryScrollTop(common), 5756);
});
