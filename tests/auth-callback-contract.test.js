/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("magic-link initiation writes the PKCE verifier through a same-origin response", () => {
  const route = read("app/auth/magic-link/route.ts");
  const login = read("app/login/page.tsx");

  assert.match(route, /createServerClient/);
  assert.match(route, /const cookieStore = await cookies\(\)/);
  assert.match(route, /cookieStore\.getAll\(\)/);
  assert.match(route, /cookieStore\.set\(name, value, cookieOptions\)/);
  assert.match(route, /response\.cookies\.set\(name, value/);
  assert.match(route, /sameSite: "lax"/);
  assert.match(route, /secure: request\.nextUrl\.protocol === "https:"/);
  assert.match(route, /new URL\("\/auth\/callback", request\.nextUrl\.origin\)/);
  assert.match(route, /callbackUrl\.searchParams\.set\("next", nextTarget\)/);
  assert.match(login, /fetch\("\/auth\/magic-link"/);
  assert.doesNotMatch(login, /auth\.signInWithOtp/);
  assert.match(route, /pkceVerifierWritten/);
  assert.doesNotMatch(route, /console\.info\([^\n]*(code|token|email|cookie value)/i);
});

test("PKCE callback exchanges a code and writes session cookies onto the success redirect", () => {
  const callback = read("app/auth/callback/route.ts");

  assert.match(callback, /const response = NextResponse\.redirect\(new URL\(nextTarget, origin\)\)/);
  assert.match(callback, /response\.cookies\.set\(name, value, options\)/);
  assert.match(callback, /const \{ error \} = await supabase\.auth\.exchangeCodeForSession\(code\)/);
  assert.match(callback, /logCallbackOutcome\("authenticated"\);\s+return response/);
  assert.match(callback, /return redirectToLogin\(origin, nextTarget\)/);
});

test("callback failures are bounded, preserve only safe relative destinations, and do not expose credentials", () => {
  const callback = read("app/auth/callback/route.ts");
  const login = read("app/login/page.tsx");

  assert.match(callback, /isValidResumeTarget\(requestedNext\)/);
  assert.match(callback, /loginUrl\.searchParams\.set\("error", "auth_callback"\)/);
  assert.match(callback, /const \{ error \} = await supabase\.auth\.verifyOtp/);
  assert.match(callback, /missing_callback_credential/);
  assert.match(callback, /exchange_failed_without_verifier/);
  assert.match(callback, /exchange_failed_with_verifier/);
  assert.match(callback, /console\.info\("auth_callback", \{ outcome \}\)/);
  assert.doesNotMatch(callback, /error\.message|console\.(log|warn|error)/);
  assert.doesNotMatch(callback, /console\.info\([^\n]*(code|token|cookie|email)/i);
  assert.match(login, /This login link could not be completed\. Request a new link and open it in the same browser\./);
});
