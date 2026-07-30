/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const {
  haveStrictlyProgressingOffsets,
  isNearDuplicateViewport,
} = require("../lib/sources.ts");

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
  assert.match(app, /Viewport \$\{index \+ 1\} of \$\{orderedImages\.length\}/);
});

test("URL submission enters processing synchronously and scopes results by run ID", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /runCoordinatorRef\.current\.tryStart\(runId\)/);
  assert.match(app, /setIsLoading\(true\)/);
  assert.match(app, /setIsCapturingUrl\(inputMode === "url"\)/);
  assert.match(app, /msg\.runId === runId/);
  assert.match(app, /runCoordinatorRef\.current\.finish\(runId\)/);
  assert.match(app, /setUrlError\(null\)/);
});

test("URL capture progress hands off cleanly to the existing analysis progress", () => {
  const app = read("components/GravitasApp.tsx");
  const styles = read("app/globals.css");

  assert.match(app, /inputMode === "url" \? \([\s\S]*isCapturingUrl \? \(/);
  assert.match(app, /Capturing page viewports…/);
  assert.match(app, /data-url-capture-progress="true"/);
  assert.doesNotMatch(
    app,
    /inputMode === "text"[\s\S]{0,200}data-url-capture-progress/
  );
  assert.doesNotMatch(
    app,
    /inputMode === "images"[\s\S]{0,200}data-url-capture-progress/
  );
  assert.match(
    app,
    /sourceIdentity = source;\s*urlSourceImages = source\.images;\s*setIsCapturingUrl\(false\)/s
  );
  assert.match(
    app,
    /setMessages\(\(m\) => \[\s*\.\.\.m,[\s\S]*THINKING_TOKEN/s
  );
  assert.match(app, /finally \{[\s\S]*setIsCapturingUrl\(false\)/);
  assert.match(app, /setIsCapturingUrl\(false\)[\s\S]*setAnalysisProgress\(null\)/);
  assert.match(app, /sendLockRef\.current \|\| isRepeatedGraviton/);
  assert.match(app, /runCoordinatorRef\.current\.tryStart\(runId\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /\.gravitas-capture-progress/);
});

test("confirmed scroll offsets must strictly progress", () => {
  assert.equal(haveStrictlyProgressingOffsets([0, 900, 1800, 2700]), true);
  assert.equal(haveStrictlyProgressingOffsets([0, 900, 900, 1800]), false);
  assert.equal(haveStrictlyProgressingOffsets([0, 900, 925, 1800]), false);
});

test("near-duplicate viewport signatures are rejected", () => {
  const opening = ["hero", "hero", "copy", "cta", "image", "footer"];
  assert.equal(
    isNearDuplicateViewport(
      ["hero", "hero", "copy", "cta", "image", "footer"],
      [opening]
    ),
    true
  );
  assert.equal(
    isNearDuplicateViewport(
      ["section", "quote", "quote", "form", "form", "footer"],
      [opening]
    ),
    false
  );
});

test("ScreenshotOne replaces browser rendering while preserving local viewport slicing", () => {
  const capture = read("lib/viewport-capture.ts");
  const provider = read("lib/screenshotone.ts");

  assert.match(capture, /captureFullPagePng/);
  assert.match(capture, /calculateViewportPositions/);
  assert.match(capture, /\.extract\(\{ left: 0, top, width, height: sliceHeight \}\)/);
  assert.match(provider, /SCREENSHOTONE_ACCESS_KEY/);
  assert.match(provider, /"x-access-key": accessKey/);
  assert.doesNotMatch(provider, /["']access_key["']\s*:/);
  assert.match(provider, /full_page:\s*true/);
  assert.match(provider, /full_page_algorithm:\s*"by_sections"/);
  assert.match(provider, /block_cookie_banners:\s*true/);
  assert.match(provider, /block_ads:\s*true/);
  assert.match(provider, /block_trackers:\s*true/);
  assert.match(provider, /decodeURIComponent\(value\)/);
  assert.match(provider, /MAX_CAPTURE_ATTEMPTS = 2/);
  assert.match(provider, /response\.status < 500/);
});

test("server validates provider output and sanitises capture failures", () => {
  const capture = read("lib/viewport-capture.ts");
  const route = read("app/api/sources/url/route.ts");

  assert.match(capture, /metadata\.format !== "png"/);
  assert.match(capture, /width < 640 \|\| height < 240/);
  assert.match(capture, /MAX_FULL_PAGE_BYTES/);
  assert.match(capture, /MAX_FULL_PAGE_PIXELS/);
  assert.match(route, /Gravitas URL rendering failed/);
  assert.match(
    route,
    /Gravitas could not render this page\. Please try again\./
  );
  assert.doesNotMatch(route, /error instanceof Error \? error\.message/);
});

test("URL rendering retains SSRF protection and bounded provider timeouts", () => {
  const capture = read("lib/viewport-capture.ts");
  const provider = read("lib/screenshotone.ts");
  const route = read("app/api/sources/url/route.ts");

  assert.match(capture, /validatePublicBrowserUrl\(initialUrl\)/);
  assert.match(capture, /validatePublicBrowserUrl\(currentUrl\)/);
  assert.match(capture, /DESKTOP_USER_AGENT/);
  assert.match(provider, /AbortSignal\.timeout/);
  assert.match(provider, /timeout:\s*45/);
  assert.match(provider, /navigation_timeout:\s*25/);
  assert.match(route, /preferredRegion\s*=\s*"syd1"/);
});

test("supporting text remains best-effort and follows only validated redirects", () => {
  const capture = read("lib/viewport-capture.ts");

  assert.match(capture, /fetchSupportingPage/);
  assert.match(capture, /new URL\(initialUrl\.toString\(\)\)/);
  assert.match(capture, /redirect:\s*"manual"/);
  assert.match(capture, /MAX_HTML_REDIRECTS/);
  assert.match(capture, /MAX_HTML_BYTES/);
  assert.match(capture, /validatePublicBrowserUrl\(currentUrl\)/);
  assert.match(capture, /Supporting webpage text was unavailable/);
  assert.match(capture, /supporting text request returned bot verification/i);
});
