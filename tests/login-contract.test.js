/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("login uses Gravitas branding without the legacy white logo panel", () => {
  const page = read("app/login/page.tsx");
  assert.match(page, /gravitas-blue-logo gravitas-login-logo/);
  assert.match(page, /aria-label="Gravitas Narrative Intelligence"/);
  assert.match(page, /gravitas-shell/);
  assert.match(page, /gravitas-header/);
  assert.doesNotMatch(page, /MR_Logo1\.png|bg-white\/90/);
});

test("login keeps validated relative resume handling", () => {
  const page = read("app/login/page.tsx");
  const callback = read("app/auth/callback/route.ts");
  assert.match(page, /isValidResumeTarget\(queryTarget\)/);
  assert.match(page, /isValidResumeTarget\(storedTarget\)/);
  assert.match(callback, /isValidResumeTarget\(requestedNext\)/);
});
