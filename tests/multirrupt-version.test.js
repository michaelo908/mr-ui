/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("the editor displays a calm release number and a reliable build marker", () => {
  const app = read("components/GravitasApp.tsx");
  const version = read("lib/multirrupt-version.ts");

  assert.match(version, /MULTIRRUPT_RELEASE = "1\.9"/);
  assert.match(version, /MULTIRRUPT_BUILD = "2026\.09\.27\.1"/);
  assert.match(app, /Multirrupt \{MULTIRRUPT_RELEASE\} · build \{MULTIRRUPT_BUILD\}/);
});
