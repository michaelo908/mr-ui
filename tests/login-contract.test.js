/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("login uses Multirrupt Narrative Intelligence branding without the legacy white logo panel", () => {
  const page = read("app/login/page.tsx");
  const css = read("app/globals.css");
  assert.match(page, /gravitas-blue-logo gravitas-login-logo/);
  assert.match(page, /aria-label="Multirrupt Narrative Intelligence"/);
  assert.match(css, /multirrupt-narrative-intelligence-logo\.png/);
  assert.doesNotMatch(css, /gravitas-logo-white\.png/);
  assert.match(page, /gravitas-shell/);
  assert.match(page, /gravitas-header/);
  assert.doesNotMatch(page, /MR_Logo1\.png|bg-white\/90/);
});

test("login keeps validated relative resume handling", () => {
  const page = read("app/login/page.tsx");
  const callback = read("app/auth/callback/route.ts");
  const verifyCode = read("app/auth/verify-code/route.ts");
  assert.match(page, /isValidResumeTarget\(queryTarget\)/);
  assert.match(page, /isValidResumeTarget\(storedTarget\)/);
  assert.match(page, /fetch\("\/auth\/verify-code"/);
  assert.match(verifyCode, /supabase\.auth\.verifyOtp/);
  assert.match(verifyCode, /response\.cookies\.set/);
  assert.match(callback, /isValidResumeTarget\(requestedNext\)/);
});
