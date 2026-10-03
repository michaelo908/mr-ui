/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Meta measurement is opt-in by deployment configuration and carries no work content", () => {
  const pixel = read("components/MetaPixel.tsx");
  const helper = read("lib/meta-pixel.ts");
  const layout = read("app/layout.tsx");

  assert.match(pixel, /NEXT_PUBLIC_META_PIXEL_ID/);
  assert.match(pixel, /if \(!pixelId\) return null/);
  assert.match(pixel, /fbq\('track','PageView'\)/);
  assert.match(layout, /<MetaPixel \/>/);
  assert.match(helper, /Deliberately accepts no payload/);
  assert.match(helper, /multirruptSignalsBrowserExcludedV1/);
  assert.match(helper, /AnalysisStarted/);
  assert.match(helper, /RewriteEngaged/);
  assert.match(helper, /window\.fbq\(standard \? "track" : "trackCustom", eventName\);/);
});

test("quality events are wired at the actual product moments", () => {
  const clientSignals = read("lib/signals/client.ts");
  const editor = read("components/GravitasApp.tsx");

  assert.match(clientSignals, /trackMetaSignal\(name\)/);
  assert.match(editor, /trackMetaEvent\("AnalysisCompleted"\)/);
});

test("server purchase measurement is authoritative and privacy-bounded", () => {
  const capi = read("lib/meta-capi.ts");
  const webhook = read("app/api/stripe/webhook/route.ts");

  assert.match(capi, /event_name: "Purchase"/);
  assert.match(capi, /event_id: input\.eventId/);
  assert.match(capi, /action_source: "website"/);
  assert.match(capi, /Deliberately excludes customer identity, submitted writing, report content/);
  assert.doesNotMatch(capi, /user_data/);
  assert.match(webhook, /eventId: `stripe-checkout:\$\{session\.id\}`/);
  assert.match(webhook, /if \(event\.livemode\)/);
});
