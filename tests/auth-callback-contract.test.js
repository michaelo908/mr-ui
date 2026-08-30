/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("PKCE callback exchanges a code and writes session cookies onto the success redirect", () => {
  const callback = read("app/auth/callback/route.ts");

  assert.match(callback, /const response = NextResponse\.redirect\(new URL\(nextTarget, origin\)\)/);
  assert.match(callback, /response\.cookies\.set\(name, value, options\)/);
  assert.match(callback, /const \{ error \} = await supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /return error \? redirectToLogin\(origin, nextTarget\) : response/);
});

test("callback failures are bounded, preserve only safe relative destinations, and do not expose credentials", () => {
  const callback = read("app/auth/callback/route.ts");
  const login = read("app/login/page.tsx");

  assert.match(callback, /isValidResumeTarget\(requestedNext\)/);
  assert.match(callback, /loginUrl\.searchParams\.set\("error", "auth_callback"\)/);
  assert.match(callback, /const \{ error \} = await supabase\.auth\.verifyOtp/);
  assert.doesNotMatch(callback, /error\.message|console\.(log|warn|error)/);
  assert.match(login, /This login link could not be completed\. Request a new link and open it in the same browser\./);
});
