/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("normal analysis contract places Narrative Performance after Editor's Summary", () => {
  const route = read("app/api/mr/route.ts");
  const summary = route.indexOf("## Editor's Summary");
  const performance = route.indexOf("## Narrative Performance");
  const depth = route.indexOf("## Diagnosis in Depth");

  assert.ok(summary >= 0);
  assert.ok(performance > summary);
  assert.ok(depth > performance);
  assert.match(route, /unsupported by the Editor's Summary or Diagnosis in Depth/);
  assert.match(route, /Never invent a metric or observation/);
  assert.match(route, /normally 3 concise recommendations/);
  assert.match(route, /up to 5 only for unusually complex material/);
});

test("alternate rewrites bypass the full analysis contract", () => {
  const route = read("app/api/mr/route.ts");
  const app = read("components/GravitasApp.tsx");

  assert.match(app, /requestKind:\s*"alternate-rewrite"/);
  assert.match(route, /body\?\.requestKind === "alternate-rewrite"/);
  assert.match(route, /alternateRewrite \|\| continuation/);
});

test("panel is rendered after Editor's Summary and before in-depth notes", () => {
  const app = read("components/GravitasApp.tsx");
  const summary = app.indexOf("Editor’s Summary", app.indexOf("function StructuredAssistantMessage"));
  const performance = app.indexOf("<NarrativePerformancePanel", summary);
  const depth = app.indexOf("Editor’s Notes in Depth", performance);

  assert.ok(summary >= 0);
  assert.ok(performance > summary);
  assert.ok(depth > performance);
});

test("viewport thumbnails and references share the image lightbox", () => {
  const app = read("components/GravitasApp.tsx");
  const panel = read("components/NarrativePerformancePanel.tsx");
  const lightbox = read("components/ImageLightbox.tsx");

  assert.match(app, /onOpenImage=\{openImage\}/);
  assert.match(panel, /Open viewport \$\{viewportNumber\}/);
  assert.match(lightbox, /event\.key === "Escape"/);
  assert.match(lightbox, /event\.key === "ArrowLeft"/);
  assert.match(lightbox, /event\.key === "ArrowRight"/);
  assert.match(lightbox, /event\.target === event\.currentTarget/);
});
