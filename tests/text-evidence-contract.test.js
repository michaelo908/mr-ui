/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("analysis contract gives text recommendations and notes one evidence numbering system", () => {
  const route = read("app/api/mr/route.ts");
  assert.match(route, /Evidence: \*\*N · N\*\*/);
  assert.match(route, /\[\[Evidence: N\]\]/);
  assert.match(route, /same block numbering/);
  assert.match(route, /Do not use paragraph numbers/);
});

test("Narrative Performance and Editor's Notes consume canonical text evidence", () => {
  const app = read("components/GravitasApp.tsx");
  const panel = read("components/NarrativePerformancePanel.tsx");

  assert.match(app, /parseTextEvidenceBlocks\(depth\)/);
  assert.match(app, /textEvidenceBlocks=\{/);
  assert.match(panel, /extractTextEvidenceNumbers/);
  assert.match(panel, /buildTextEvidenceLaunch/);
  assert.match(app, /textEvidenceRefs\.current\.set\(block\.number, element\)/);
});

test("text evidence navigation expands, scrolls, focuses, and highlights once", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /setIsDepthOpen\(true\)/);
  assert.match(app, /scrollIntoView\(\{/);
  assert.match(app, /behavior: reduceMotion \? "auto" : "smooth"/);
  assert.match(app, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(app, /gravitas-text-evidence-highlight/);
  assert.match(app, /setTimeout\(\(\) => \{\s*setHighlightedTextEvidence\(null\)/);
});
