/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("Editor's Notes in Depth is closed by default and exposes a prominent state-aware control", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /const \[isDepthOpen, setIsDepthOpen\] = useState\(false\)/);
  assert.match(app, /open=\{isDepthOpen\}/);
  assert.match(app, /aria-expanded=\{isDepthOpen\}/);
  assert.match(app, /isDepthOpen \? "Click to close" : "Click to expand"/);
  assert.match(app, /isDepthOpen \? "▴" : "▾"/);
});

test("Jump-In URL capture and analysis both enforce ten viewports", () => {
  const captureRoute = read("app/api/jump-in/sources/url/route.ts");
  const analysisRoute = read("app/api/jump-in/mr/route.ts");
  const app = read("components/GravitasApp.tsx");

  assert.match(
    captureRoute,
    /handleUrlSourceRequest\(req, JUMP_IN_MAX_URL_VIEWPORTS\)/
  );
  assert.match(
    analysisRoute,
    /maxUrlViewports: JUMP_IN_MAX_URL_VIEWPORTS/
  );
  assert.match(
    app,
    /isJumpIn \? "\/api\/jump-in\/sources\/url" : "\/api\/sources\/url"/
  );
});

test("Jump-In preserves 800 pasted words and a signed seven-day cooldown", () => {
  const analysisRoute = read("app/api/jump-in/mr/route.ts");
  const server = read("lib/jump-in-server.ts");
  const app = read("components/GravitasApp.tsx");

  assert.match(
    analysisRoute,
    /maxPastedTextWords: JUMP_IN_MAX_PASTED_WORDS/
  );
  assert.match(analysisRoute, /maxAge: JUMP_IN_RESET_MS \/ 1000/);
  assert.match(analysisRoute, /isJumpInTokenResetEligible/);
  assert.match(server, /token\.startedAt \+ JUMP_IN_RESET_MS/);
  assert.match(app, /isJumpInResetEligible\(parsed\.startedAt\)/);
  assert.doesNotMatch(app, /remaining analyses/i);
});
