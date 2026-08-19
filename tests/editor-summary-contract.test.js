/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the shared report contract defines Editor's Summary as findings, not reasoning", () => {
  const contract = read("lib/editor-summary.ts");
  assert.match(contract, /What did Gravitas find\?/);
  assert.match(contract, /15–20 seconds/);
  assert.match(contract, /one primary observation/);
  assert.match(contract, /diagnosis, not the reasoning/i);
  assert.match(contract, /Do not explain why/);
  assert.match(contract, /Do not add a bold label/);
  assert.match(contract, /coined conceptual labels/);
});

test("text, URL, image, paid, Jump-In, and Gravitons share the same summary contract", () => {
  const route = read("app/api/mr/route.ts");
  const app = read("components/GravitasApp.tsx");
  const request = read("lib/gravitas-analysis-request.ts");
  const jumpIn = read("app/api/jump-in/mr/route.ts");

  assert.match(route, /\$\{EDITOR_SUMMARY_CONTRACT\}/);
  assert.match(route, /visualAnalysisContext/);
  assert.match(route, /renderedUrlContext/);
  assert.match(request, /Analysis Lens:/);
  assert.match(app, /buildAnalysisInput/);
  assert.match(app, /const apiEndpoint = isJumpIn \? "\/api\/jump-in\/mr" : "\/api\/mr"/);
  assert.match(jumpIn, /handleMrRequest/);
});

test("in-depth reasoning and every surrounding report layer remain intact", () => {
  const route = read("app/api/mr/route.ts");
  const cadence = read("lib/cadence.ts");

  for (const heading of [
    "## Editor's Summary",
    "## Narrative Performance",
    "## Diagnosis in Depth",
    "## Rewrite",
    "## Rewrite Debrief",
  ]) {
    assert.match(route, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(route, /comprehensive, multi-point, high-signal/);
  assert.match(route, /sole primary evidence/);
  assert.match(route, /VISUAL INPUT PRESENT/);
  assert.match(route, /MUST produce MATERIAL CHANGE/);
  assert.match(cadence, /APPLY TO REWRITE OUTPUT ONLY/);
  assert.match(cadence, /does not grant permission to compress/);
});

test("the UI keeps Editor's Summary and legacy normalization changes headings only", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, />\s*Editor’s Summary\s*</);
  assert.match(app, /Executive Summary[\s\S]*Editor’s Summary/);
  assert.match(app, /parsed\.sections\.summary\.trim\(\)/);
  assert.doesNotMatch(app, /Editor’s Findings/);
});

test("alternate rewrites bypass summary generation and output validation", () => {
  const route = read("app/api/mr/route.ts");
  assert.match(route, /alternateRewrite \|\| continuation/);
  assert.match(route, /if \(!alternateRewrite && typeof json\?\.output === "string"\)/);
});
