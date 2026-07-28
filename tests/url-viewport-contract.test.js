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
  assert.match(app, /Viewport \$\{index \+ 1\} of \$\{images\.length\}/);
});

test("URL submission enters processing synchronously and scopes results by run ID", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /runCoordinatorRef\.current\.tryStart\(runId\)/);
  assert.match(app, /setIsLoading\(true\)/);
  assert.match(app, /Opening the page and capturing the reader journey/);
  assert.match(app, /msg\.runId === runId/);
  assert.match(app, /runCoordinatorRef\.current\.finish\(runId\)/);
  assert.match(app, /setUrlError\(null\)/);
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

test("renderer detects the scroll surface and guarantees opening and exit", () => {
  const capture = read("lib/viewport-capture.ts");
  assert.match(capture, /findScrollSurface/);
  assert.match(capture, /data-gravitas-scroll-container/);
  assert.match(capture, /actualOffsets\[0\] !== 0/);
  assert.match(capture, /actualOffsets\.at\(-1\).*scrollSurface\.maxScroll/s);
  assert.match(capture, /did not expose a reliable top-to-bottom scroll journey/);
  assert.match(capture, /produced too few distinct viewports/);
  assert.match(capture, /document\.getAnimations\(\)/);
  assert.match(capture, /suppressRepeatedStickyElements/);
});

test("server serialises Chromium preparation and sanitises launch failures", () => {
  const runtime = read("lib/browser-runtime.ts");
  const route = read("app/api/sources/url/route.ts");

  assert.match(runtime, /gravitas-chromium\.prepare\.lock/);
  assert.match(runtime, /open\(PREPARATION_LOCK,\s*"wx"/);
  assert.match(runtime, /executablePromise \?\?=/);
  assert.match(runtime, /MINIMUM_BROWSER_BYTES/);
  assert.match(route, /Gravitas URL rendering failed/);
  assert.match(
    route,
    /Gravitas could not render this page\. Please try again\./
  );
  assert.doesNotMatch(route, /error instanceof Error \? error\.message/);
});

test("browser launch retries transient executable-busy failures", () => {
  const runtime = read("lib/browser-runtime.ts");
  const capture = read("lib/viewport-capture.ts");

  assert.match(runtime, /ETXTBSY\|text file busy/);
  assert.match(capture, /isRetryableBrowserLaunchError/);
  assert.match(capture, /waitBeforeBrowserLaunchRetry/);
  assert.match(capture, /return launch\(\)/);
});

test("URL rendering avoids DNS exhaustion and does not wait indefinitely for scripts", () => {
  const capture = read("lib/viewport-capture.ts");
  const route = read("app/api/sources/url/route.ts");

  assert.match(capture, /publicUrlValidationCache/);
  assert.match(capture, /validations = new Map/);
  assert.match(capture, /waitUntil:\s*"commit"/);
  assert.match(capture, /waitForSelector\("body"/);
  assert.match(capture, /DOCUMENT_READY_TIMEOUT_MS/);
  assert.match(capture, /resourceType\(\) === "media"/);
  assert.match(capture, /resourceType\(\) === "font"/);
  assert.match(capture, /DESKTOP_USER_AGENT/);
  assert.match(capture, /locale:\s*"en-AU"/);
  assert.match(route, /preferredRegion\s*=\s*"syd1"/);
});

test("a navigation that cannot commit falls back to safely fetched HTML", () => {
  const capture = read("lib/viewport-capture.ts");

  assert.match(capture, /fetchPublicHtml/);
  assert.match(capture, /new URL\(initialUrl\.toString\(\)\)/);
  assert.match(capture, /redirect:\s*"manual"/);
  assert.match(capture, /MAX_HTML_REDIRECTS/);
  assert.match(capture, /MAX_HTML_BYTES/);
  assert.match(capture, /validatePublicBrowserUrl\(currentUrl\)/);
  assert.match(capture, /addDocumentBase/);
  assert.match(capture, /page\.setContent\(fallback\.html/);
  assert.match(capture, /usedHtmlFallback \? renderedUrl : new URL\(page\.url\(\)\)/);
  assert.match(capture, /target host returned bot verification/i);
});
