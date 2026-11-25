/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Jump In offers three original samples, including the fictional Clearpoint sales letter", () => {
  const samples = read("lib/jump-in-samples.ts");
  assert.match(samples, /id: "client-email"/);
  assert.match(samples, /id: "landing-page"/);
  assert.match(samples, /id: "clearpoint-advisory"/);

  const proposal = samples.match(/id: "clearpoint-advisory"[\s\S]*?content: `([\s\S]*?)`,\n  },/);
  assert.ok(proposal, "Clearpoint source should be present");
  assert.doesNotMatch(proposal[1], /^#{1,6} /m);
  assert.match(proposal[1], /Your business is growing\. Why aren't your profits\?/);
  assert.match(samples, /All companies and performance figures are fictional/);
  assert.ok(proposal[1].trim().split(/\s+/).length >= 450, "proposal should support a deeper analysis");
});

test("Jump In tracks sample selection and sample-led analysis without storing its text in Signals", () => {
  const app = read("components/GravitasApp.tsx");
  const registry = read("lib/signals/registry.ts");

  assert.match(app, /Use a sample instead\.\.\./);
  assert.match(app, /emitSignal\("discovery\.sample_selected", signalSurface, \{ sample_id: sample\.id \}\)/);
  assert.ok(app.includes("...(jumpInSampleId ? { sample_id: jumpInSampleId } : {})"));
  assert.match(registry, /"discovery\.sample_selected"/);
  assert.match(registry, /sample_id: \{ type: "enum"/);
  assert.doesNotMatch(registry, /sample_content/);
});
