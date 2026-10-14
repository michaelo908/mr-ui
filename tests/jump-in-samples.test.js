/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Jump In offers three original samples, including one in-depth proposal", () => {
  const samples = read("lib/jump-in-samples.ts");
  assert.match(samples, /id: "client-email"/);
  assert.match(samples, /id: "landing-page"/);
  assert.match(samples, /id: "proposal-opening"/);

  const proposal = samples.match(/id: "proposal-opening"[\s\S]*?content: `([\s\S]*?)`,\n  },/);
  assert.ok(proposal, "proposal sample should be present");
  assert.ok(proposal[1].trim().split(/\s+/).length >= 450, "proposal should support a deeper analysis");
});

test("Jump In tracks sample selection and sample-led analysis without storing its text in Signals", () => {
  const app = read("components/GravitasApp.tsx");
  const registry = read("lib/signals/registry.ts");

  assert.match(app, /Nothing handy to paste\?/);
  assert.match(app, /emitSignal\("discovery\.sample_selected", signalSurface, \{ sample_id: sample\.id \}\)/);
  assert.ok(app.includes("...(jumpInSampleId ? { sample_id: jumpInSampleId } : {})"));
  assert.match(registry, /"discovery\.sample_selected"/);
  assert.match(registry, /sample_id: \{ type: "enum"/);
  assert.doesNotMatch(registry, /sample_content/);
});
