/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

test("URL route renders viewports and no longer imports detached page images", () => {
  const route = read("app/api/sources/url/route.ts");
  assert.match(route, /captureRenderedPage/);
  assert.doesNotMatch(route, /extractHtmlImageCandidates|importPageImages|fetchPublicImage/);
  assert.match(route, /captureMode:\s*"rendered-viewports"/);
});

test("analysis payload explicitly marks rendered URL evidence hierarchy", () => {
  const apiRoute = read("app/api/mr/route.ts");
  assert.match(apiRoute, /sole primary evidence/i);
  assert.match(apiRoute, /supporting readability assistance only/i);
  assert.match(apiRoute, /not visible in the viewport sequence/i);
});

test("client persists captured viewports and identifies rendered URL requests", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /setImportedUrl/);
  assert.match(app, /urlSourceImages = source\.images/);
  assert.match(app, /sourceMode: sourceIdentity\?\.type === "url" \? "rendered-url"/);
  assert.match(app, /Viewport \$\{index \+ 1\} of \$\{images\.length\}/);
});
