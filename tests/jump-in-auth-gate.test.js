/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("a first anonymous Jump In analysis is previewed, then gated before full access", () => {
  const page = read("app/jump-in/page.tsx");
  const app = read("components/GravitasApp.tsx");
  const analysis = read("app/api/jump-in/mr/route.ts");
  const start = read("app/api/jump-in/start/route.ts");
  const source = read("app/api/jump-in/sources/url/route.ts");

  assert.match(page, /requireAuthBeforeAnalysis/);
  assert.match(app, /const supabase = useMemo\(\(\) => createClient\(\), \[\]\)/);
  assert.match(app, /supabase\.auth\.onAuthStateChange/);
  assert.match(app, /const \[previewUnlockRequired, setPreviewUnlockRequired\]/);
  assert.match(app, /res\.headers\.get\("X-Jump-In-Preview"\)/);
  assert.match(app, /setPreviewUnlockRequired\(true\)/);
  assert.match(app, /const rewriteRequired = !isAnonymousPreview && rewriteCapable/);
  assert.match(
    app,
    /first anonymous analysis is intentionally covered by the sign-in[\s\S]*?usable rewrite must survive that handoff/
  );
  assert.match(
    app,
    /const initialRewrites = initialRewriteContent[\s\S]*?\? \[makeRewriteVariant\(initialRewriteContent, 0\)\]/
  );
  assert.match(app, /async function unlockPreviewAnalysis\(\)/);
  assert.match(app, /persistJumpInWorkspace\(\)/);
  assert.match(app, /const HOMEPAGE_JUMP_IN_RESUME_TARGET = GRAVITAS_RESUME_TARGET/);
  assert.doesNotMatch(app, /HOMEPAGE_JUMP_IN_RESUME_TARGET = "\/?\?resume=jump-in#jump-in"/);
  assert.match(app, /router\.push\(`\/login\?next=/);
  assert.match(analysis, /hasAuthenticatedJumpInUser/);
  assert.match(analysis, /JUMP_IN_PREVIEW_COOKIE_NAME/);
  assert.match(analysis, /if \(!authenticated\)/);
  assert.match(analysis, /X-Jump-In-Preview/);
  assert.match(analysis, /previewLocked: true/);
  assert.match(analysis, /const response = await handleMrRequest/);
  assert.match(app, /fetch\("\/api\/jump-in\/start"/);
  assert.match(app, /previewTimerStartRequestedRef/);
  assert.match(start, /hasAuthenticatedJumpInUser/);
  assert.match(start, /X-Jump-In-Started-At/);
  assert.match(source, /hasAuthenticatedJumpInUser/);
  assert.match(source, /status: 401/);
  assert.ok(source.indexOf("if (!(await hasAuthenticatedJumpInUser()))") < source.indexOf("return handleUrlSourceRequest"));
});
