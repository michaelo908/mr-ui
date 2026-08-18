/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("snapshot retains source, analyses, per-run viewports, rewrites and run metadata", () => {
  const model = read("lib/gravitas-workspace.ts");
  for (const field of [
    "inputMode",
    "draft",
    "urlDraft",
    "importedUrl",
    "uploadedFiles",
    "selectedGraviton",
    "cadence",
    "messages",
    "sourceImages",
    "sourceIdentity",
    "completedAt",
    "sessionId",
    "runId",
    "rewrites",
  ]) {
    assert.match(model, new RegExp(`${field}[?:]`));
  }
});

test("only completed analyses are persisted and restoration does not call analysis or analytics", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /message\.analysisStatus === "success"/);
  assert.match(app, /completedRunIds\.has\(message\.runId\)/);
  assert.match(app, /setMessages\(restoredMessages\)/);
  assert.match(app, /setCompletedAnalysisRuns\(restoredCompletedRuns\)/);

  const restoration = app.slice(
    app.indexOf("const resumeTarget = window.localStorage.getItem"),
    app.indexOf("function startJumpInSession")
  );
  assert.doesNotMatch(restoration, /fetch\(|emitSignal\(|setAnalysisBoost|setRewriteBoost|onSend\(/);
});

test("rewrites are parent-owned and restored with their original cadence", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /initialRewrites=\{m\.rewrites\}/);
  assert.match(app, /onRewritesChange=\{\(nextRewrites\)/);
  assert.match(app, /message\.rewrites \?\? \[\]/);
  assert.match(app, /cadence=\{m\.cadence \?\? cadence\}/);
  assert.match(app, /setMessages\(nextMessages\);[\s\S]*persistJumpInWorkspace\(nextMessages\)/);
  assert.match(app, /rewritesInitializedRef[\s\S]*if \(rewrites\.length === 0\) return/);
  assert.doesNotMatch(app, /Conversion Rewrite|Authority Rewrite|Concise Rewrite/);
});

test("entitlement gates restoration and consumed state follows successful reconstruction", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /!accessResolved/);
  assert.match(app, /\(!isSubscribed && !isBookTrial\)/);
  assert.match(app, /setMessages\(restoredMessages\)[\s\S]*consumeWorkspaceSnapshot\(snapshot\.sessionId\)/);
  assert.match(app, /Jump In work restored\./);
});

test("checkout preparation warns on quota and cancelled checkout cannot consume work", () => {
  const app = read("components/GravitasApp.tsx");
  const store = read("lib/gravitas-workspace-store.ts");
  const checkout = read("app/api/stripe/checkout/route.ts");
  assert.match(app, /const workspaceReady = await persistJumpInWorkspace\(\)/);
  assert.match(app, /if \(!workspaceReady\) return/);
  assert.match(app, /not have enough storage/);
  assert.match(store, /QuotaExceededError/);
  assert.match(checkout, /cancel_url: new URL\(resumeTarget/);
  assert.doesNotMatch(checkout, /consumeWorkspaceSnapshot|deleteWorkspaceSnapshot/);
});

test("clear removes visible and persisted work", () => {
  const app = read("components/GravitasApp.tsx");
  const clearStart = app.indexOf("function onClear()");
  const clearEnd = app.indexOf("async function onSend()", clearStart);
  const clear = app.slice(clearStart, clearEnd);
  assert.match(clear, /deleteWorkspaceSnapshot\(workspaceSessionId\)/);
  assert.match(clear, /setMessages\(\[\]\)/);
  assert.match(clear, /removeItem\(GRAVITAS_RESUME_MARKER_KEY\)/);
  assert.match(clear, /workspacePersistencePausedRef\.current = true/);
});

test("Jump In hydration gates autosave and storage independently rejects empty replacement", () => {
  const app = read("components/GravitasApp.tsx");
  const model = read("lib/gravitas-workspace.ts");
  const store = read("lib/gravitas-workspace-store.ts");
  assert.match(app, /useState<WorkspaceHydrationState>/);
  assert.match(model, /"pending" \| "hydrating" \| "ready" \| "failed"/);
  assert.match(app, /loadWorkspaceSnapshot\(jumpInSessionId\)/);
  assert.match(app, /setMessages\(restoredMessages\)[\s\S]*setWorkspaceHydration\("ready"\)/);
  assert.match(app, /canAutosaveWorkspace\(workspaceHydration\)/);
  assert.match(store, /chooseWorkspaceSnapshotForSave/);
  assert.match(model, /hasWorkspaceContent\(existing\)[\s\S]*!hasWorkspaceContent\(incoming\)/);
  assert.match(model, /retained\.rewrites[\s\S]*message\.rewrites/);
});

test("resume intent is validated and contains no source content", () => {
  const model = read("lib/gravitas-workspace.ts");
  const app = read("components/GravitasApp.tsx");
  const checkout = read("app/api/stripe/checkout/route.ts");
  const login = read("app/login/page.tsx");
  const callback = read("app/auth/callback/route.ts");
  assert.match(model, /value === GRAVITAS_RESUME_TARGET/);
  assert.match(checkout, /isValidResumeTarget\(requestBody\?\.resumeTarget\)/);
  assert.match(login, /getValidatedNextTarget/);
  assert.match(callback, /isValidResumeTarget\(requestedNext\)/);
  const checkoutMetadata = checkout.slice(
    checkout.indexOf("metadata:"),
    checkout.indexOf("after(() =>", checkout.indexOf("metadata:"))
  );
  assert.doesNotMatch(checkoutMetadata, /draft|source|analysis|rewrite|image|viewport/i);
  assert.doesNotMatch(app, /console\.log\("FINAL INPUT|console\.log\("Images selected/);
});

test("newest run is rendered first and earlier runs retain original message indexes", () => {
  const app = read("components/GravitasApp.tsx");
  assert.match(app, /runs\.reverse\(\)\.flatMap/);
  assert.match(app, /Earlier Work/);
  assert.match(app, /index: i/);
  assert.match(app, /messages\[i - 1\]\.sourceImages/);
});
