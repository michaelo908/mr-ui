/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("unauthenticated Jump In work is preserved, but analysis and URL capture are blocked before sign-in", () => {
  const page = read("app/jump-in/page.tsx");
  const app = read("components/GravitasApp.tsx");
  const analysis = read("app/api/jump-in/mr/route.ts");
  const source = read("app/api/jump-in/sources/url/route.ts");

  assert.match(page, /requireAuthBeforeAnalysis/);
  assert.match(app, /isJumpIn && requireAuthBeforeAnalysis && !jumpInAuthenticated/);
  assert.match(app, /persistJumpInWorkspace\(\)/);
  assert.match(app, /const HOMEPAGE_JUMP_IN_RESUME_TARGET = GRAVITAS_RESUME_TARGET/);
  assert.doesNotMatch(app, /HOMEPAGE_JUMP_IN_RESUME_TARGET = "\/?\?resume=jump-in#jump-in"/);
  assert.match(app, /router\.push\(`\/login\?next=/);
  assert.match(analysis, /hasAuthenticatedJumpInUser/);
  assert.match(analysis, /status: 401/);
  assert.ok(analysis.indexOf("if (!(await hasAuthenticatedJumpInUser()))") < analysis.indexOf("const response = await handleMrRequest"));
  assert.match(source, /hasAuthenticatedJumpInUser/);
  assert.match(source, /status: 401/);
  assert.ok(source.indexOf("if (!(await hasAuthenticatedJumpInUser()))") < source.indexOf("return handleUrlSourceRequest"));
});
