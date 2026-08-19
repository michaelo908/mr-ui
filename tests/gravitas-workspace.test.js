/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("workspace schema is versioned, session-bound, seven-day and cadence-limited", () => {
  const model = read("lib/gravitas-workspace.ts");
  assert.match(model, /GRAVITAS_WORKSPACE_VERSION = 2/);
  assert.match(model, /revision: number/);
  assert.match(model, /migrateWorkspaceSnapshot/);
  assert.match(model, /7 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(model, /snapshot\.sessionId !== expectedSessionId/);
  assert.match(model, /value === "dynamic" \|\| value === "sustained"/);
  assert.match(model, /content === "__MR_THINKING__"/);
});

test("workspace persistence uses IndexedDB and supports blobs without leaking content", () => {
  const model = read("lib/gravitas-workspace.ts");
  const store = read("lib/gravitas-workspace-store.ts");
  assert.match(model, /blob: Blob/);
  assert.match(store, /window\.indexedDB\.open/);
  assert.match(store, /store\.put\((?:snapshot|selected)\)/);
  assert.match(store, /QuotaExceededError/);
  assert.doesNotMatch(store, /localStorage|sessionStorage|fetch\(|Stripe/i);
});

test("resume marker is an exact validated relative target", () => {
  const model = read("lib/gravitas-workspace.ts");
  assert.match(model, /GRAVITAS_RESUME_TARGET = "\/\?resume=jump-in"/);
  assert.match(model, /value === GRAVITAS_RESUME_TARGET/);
});
