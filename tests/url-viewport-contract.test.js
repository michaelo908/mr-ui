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
  assert.match(capture, /page\.url\(\) === "about:blank"/);
});
