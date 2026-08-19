/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("active paid workspace uses versioned IndexedDB records and user-owned pointers", () => {
  const model = read("lib/gravitas-active-workspace.ts");
  const store = read("lib/gravitas-active-workspace-store.ts");
  const database = read("lib/gravitas-workspace-store.ts");
  assert.match(model, /GRAVITAS_ACTIVE_WORKSPACE_VERSION = 2/);
  assert.match(model, /revision: number/);
  assert.match(model, /ownerUserId: string/);
  assert.match(model, /originatingJumpInSessionId/);
  assert.match(model, /handoff:/);
  assert.match(database, /active-paid-workspaces/);
  assert.match(database, /active-paid-workspace-pointers/);
  assert.match(store, /isValidActivePointer\(pointer, userId\)/);
  assert.match(store, /migrateActiveWorkspace\(workspace, userId, pointer\.workspaceId\)/);
});

test("promotion verifies the active write and pointer before pending consumption", () => {
  const app = read("components/GravitasApp.tsx");
  const store = read("lib/gravitas-active-workspace-store.ts");
  assert.match(store, /activeStore\.put\(selected\)[\s\S]*activeStore\.get\(record\.workspaceId\)/);
  assert.match(store, /isValidActiveWorkspace\(readBack\.result[\s\S]*pointerStore\.put\(pointer\)/);
  const restoration = app.slice(app.indexOf("const pending = sessionId"), app.indexOf("function startJumpInSession"));
  assert.match(restoration, /promotePendingToActive\(promoted\)[\s\S]*applyActiveWorkspace\(verified\)[\s\S]*consumeWorkspaceSnapshot\(pending\.sessionId\)/);
});

test("paid hydration precedes autosave and does not invoke model, counters, or analytics", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /paidWorkspaceHydration/);
  assert.match(app, /loadActiveWorkspaceForUser\(authenticatedUserId\)/);
  assert.match(app, /canAutosaveWorkspace\(paidWorkspaceHydration\)/);
  const hydration = app.slice(app.indexOf("const applyActiveWorkspace"), app.indexOf("function startJumpInSession"));
  assert.doesNotMatch(hydration, /fetch\(|emitSignal\(|setAnalysisBoost|setRewriteBoost/);
});

test("clear removes active and related pending state while autosave is paused", () => {
  const app = read("components/GravitasApp.tsx");
  const clear = app.slice(app.indexOf("function onClear()"), app.indexOf("async function onSend()"));
  assert.match(clear, /activeWorkspacePersistencePausedRef\.current = true/);
  assert.match(clear, /deleteActiveWorkspaceForUser\(authenticatedUserId, activeWorkspaceId\)/);
  assert.match(clear, /deleteWorkspaceSnapshot\(workspaceSessionId\)/);
  assert.match(clear, /setMessages\(\[\]\)/);
});

test("failed active persistence leaves pending handoff recoverable", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /try \{[\s\S]*const verified = await promotePendingToActive\(promoted\)[\s\S]*consumeWorkspaceSnapshot\(pending\.sessionId\)[\s\S]*\} catch \(error\) \{/);
  assert.match(app, /\} catch \(error\) \{[\s\S]*The Jump In copy remains recoverable\.[\s\S]*setPaidWorkspaceHydration\("failed"\)/);
});
