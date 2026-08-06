/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("successful analyses scroll to Editor's Summary instead of the report bottom", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /data-editor-summary-anchor="true"/);
  assert.match(app, /scrollToLatestEditorSummary\(\)/);
  assert.match(app, /scrollToLatestEditorSummary\(\);[\s\S]*\} catch/);
  assert.doesNotMatch(
    app,
    /finally \{[\s\S]{0,400}scrollToBottom\(\)/
  );
});

test("the shared completion path covers every source and entitlement mode", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /const apiEndpoint = isJumpIn \? "\/api\/jump-in\/mr" : "\/api\/mr"/);
  assert.match(app, /inputMode === "url"/);
  assert.match(app, /inputMode === "images"/);
  assert.match(app, /Analysis Lens:/);
  assert.equal((app.match(/scrollToLatestEditorSummary\(\);/g) ?? []).length, 1);
});

test("layout settling receives one guarded correction without another animation", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /requestAnimationFrame[\s\S]*requestAnimationFrame/);
  assert.match(app, /positionSummary\("smooth"\)/);
  assert.match(app, /Math\.abs\(expectedTop - scroller\.scrollTop\) > 12/);
  assert.match(app, /behavior: "auto"/);
  assert.match(app, /\}, 900\)/);
});

test("completion positions both the page and the inner report pane", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /const pageTop = window\.scrollY \+ scrollerRect\.top/);
  assert.match(app, /window\.scrollTo\(\{ top: pageTop, behavior \}\)/);
  assert.match(app, /scroller\.scrollTo\(\{ top, behavior \}\)/);
  assert.match(app, /targetTop: targetRect\.top - scrollerRect\.top/);
});

test("errors and the thinking state retain bottom scrolling", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /THINKING_TOKEN[\s\S]*scrollToBottom\(\)/);
  assert.match(app, /\} catch \(err\)[\s\S]*scrollToBottom\(\)/);
});
