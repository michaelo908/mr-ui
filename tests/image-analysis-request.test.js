/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  buildAnalysisInput,
  sourceAvailabilityInstruction,
} = require("../lib/gravitas-analysis-request.ts");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const visualFit = "Which images best fit the narrative and emotional context?";

test("uploaded images with Full Analysis produce an explicit image-source request", () => {
  const input = buildAnalysisInput({
    inputMode: "images",
    raw: "",
    selectedGraviton: "Full Analysis",
    imageCount: 1,
  });

  assert.match(input, /Analyse the attached image as the source material\./);
  assert.match(input, /Analysis Lens:\nFull Analysis/);
  assert.doesNotMatch(input, /Paste the email\/landing page/);
});

test("uploaded images preserve the exact Visual Fit lens", () => {
  const input = buildAnalysisInput({
    inputMode: "images",
    raw: "",
    selectedGraviton: visualFit,
    imageCount: 2,
  });

  assert.match(input, /Analyse the attached images as the source material\./);
  assert.ok(input.includes(visualFit));
  assert.doesNotMatch(input, /^Analysis Lens:/);
});

test("visual input cannot select the paste-copy intake instruction", () => {
  const context = sourceAvailabilityInstruction({
    hasUsableText: false,
    hasVisualInput: true,
  });

  assert.match(context, /Visual source material is present/);
  assert.match(context, /Never ask the user to paste/);
});

test("genuinely empty text-only input retains the intake instruction", () => {
  const context = sourceAvailabilityInstruction({
    hasUsableText: false,
    hasVisualInput: false,
  });

  assert.match(context, /No usable written or visual source material is present/);
  assert.match(context, /paste the copy they want diagnosed/);
});

test("existing text and URL request construction is unchanged", () => {
  assert.equal(
    buildAnalysisInput({
      inputMode: "text",
      raw: "Original text",
      selectedGraviton: "Full Analysis",
      imageCount: 0,
    }),
    "Original text"
  );

  assert.equal(
    buildAnalysisInput({
      inputMode: "url",
      raw: "Rendered URL source",
      selectedGraviton: "What weakens trust?",
      imageCount: 0,
    }),
    "Analysis Lens:\nWhat weakens trust?\n\n----------------------------------------\n\nRendered URL source"
  );
});

test("image payload, selected lens, and rewrite extraction stay wired", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /imageData = await Promise\.all\([\s\S]*fileToBase64/);
  assert.match(app, /buildAnalysisInput\(\{[\s\S]*selectedGraviton[\s\S]*imageCount/);
  assert.match(app, /body: JSON\.stringify\(payload\)/);
  assert.match(app, /parseStructuredMR\(normalizedOutput\)\.sections\.rewrite/);
  assert.match(app, /rewrites: initialRewrites/);
});

test("both authenticated and Jump In routes share visual-aware intake", () => {
  const route = read("app/api/mr/route.ts");
  const jumpIn = read("app/api/jump-in/mr/route.ts");

  assert.match(route, /sourceAvailabilityInstruction/);
  assert.match(route, /hasVisualInput: hasImageData/);
  assert.match(jumpIn, /handleMrRequest/);
});
