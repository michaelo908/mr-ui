/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(root, "lib/gravitas-active-workspace.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const moduleUnderTest = { exports: {} };
vm.runInNewContext(compiled, {
  module: moduleUnderTest,
  exports: moduleUnderTest.exports,
  require: () => ({}),
  Blob,
  Date,
});

const {
  activeWorkspaceFromPending,
  activeWorkspaceIdForPending,
  chooseActiveWorkspaceForSave,
  hasActiveWorkspaceContent,
  isValidActivePointer,
  isValidActiveWorkspace,
} = moduleUnderTest.exports;

const now = 1_800_000_000_000;
const userId = "user-a";
const sessionId = "jump-session-a";
const viewport = {
  id: "viewport-2",
  src: "data:image/png;base64,second-analysis",
  title: "Viewport 2",
  altText: "Second analysis capture",
};

function pending(overrides = {}) {
  return {
    version: 1,
    state: "pending",
    sessionId,
    createdAt: now - 100,
    updatedAt: now - 10,
    expiresAt: now + 1000,
    inputMode: "url",
    draft: "",
    urlDraft: "https://example.com/source",
    importedUrl: null,
    uploadedFiles: [],
    selectedGraviton: "Narrative & Story",
    cadence: "sustained",
    messages: [
      {
        role: "user",
        content: "Source identity",
        runId: "run-2",
        sourceIdentity: { type: "url", title: "Source", canonicalUrl: "https://example.com/source" },
        sourceImages: [viewport],
      },
      {
        role: "assistant",
        content: "Completed analysis",
        runId: "run-2",
        analysisStatus: "success",
        graviton: "Narrative & Story",
        cadence: "sustained",
        completedAt: now - 5,
        rewrites: [
          { id: "rewrite-1", label: "Initial rewrite", content: "First", copyFormat: "word" },
          { id: "rewrite-2", label: "Rewrite", content: "Second", copyFormat: "word" },
        ],
      },
    ],
    ...overrides,
  };
}

test("pending handoff promotes into an exact versioned user-owned active workspace", () => {
  const active = activeWorkspaceFromPending(pending(), userId, undefined, now);
  assert.equal(active.version, 1);
  assert.equal(active.workspaceId, activeWorkspaceIdForPending(sessionId));
  assert.equal(active.ownerUserId, userId);
  assert.equal(active.originatingJumpInSessionId, sessionId);
  assert.equal(active.selectedGraviton, "Narrative & Story");
  assert.equal(active.cadence, "sustained");
  assert.equal(active.messages[0].sourceImages[0].id, "viewport-2");
  assert.equal(active.messages[1].rewrites.length, 2);
  assert.equal(active.handoff.kind, "jump-in");
  assert.equal(isValidActiveWorkspace(active, userId, active.workspaceId), true);
});

test("active workspace validation rejects another user and incomplete analysis", () => {
  const active = activeWorkspaceFromPending(pending(), userId, undefined, now);
  assert.equal(isValidActiveWorkspace(active, "user-b", active.workspaceId), false);
  const thinking = structuredClone(active);
  thinking.messages[1].content = "__MR_THINKING__";
  assert.equal(isValidActiveWorkspace(thinking, userId, active.workspaceId), false);
});

test("empty or stale saves cannot destroy durable paid work or rewrites", () => {
  const active = activeWorkspaceFromPending(pending(), userId, undefined, now);
  const empty = { ...active, draft: "", urlDraft: "", importedUrl: null, uploadedFiles: [], messages: [] };
  assert.equal(chooseActiveWorkspaceForSave(active, empty), active);
  assert.equal(hasActiveWorkspaceContent(active), true);

  const stale = structuredClone(active);
  stale.messages[1].rewrites = [];
  const selected = chooseActiveWorkspaceForSave(active, stale);
  assert.equal(selected.messages[1].rewrites.length, 2);
  assert.equal(selected.createdAt, active.createdAt);

  const laterRun = structuredClone(active);
  laterRun.messages = laterRun.messages.map((message) => ({ ...message, runId: "run-3" }));
  laterRun.messages[1].content = "Later completed analysis";
  const durable = { ...active, messages: [...active.messages, ...laterRun.messages] };
  const staleWithoutLaterRun = chooseActiveWorkspaceForSave(durable, active);
  assert.equal(staleWithoutLaterRun.messages.length, 4);
  assert.equal(staleWithoutLaterRun.messages[3].content, "Later completed analysis");
});

test("active pointers are keyed and validated by Supabase user ID", () => {
  const pointer = { version: 1, userId, workspaceId: "workspace-a", updatedAt: now };
  assert.equal(isValidActivePointer(pointer, userId), true);
  assert.equal(isValidActivePointer(pointer, "user-b"), false);
});

test("a distinct workspace ID preserves the previous record instead of selecting it for overwrite", () => {
  const active = activeWorkspaceFromPending(pending(), userId, "workspace-a", now);
  const distinct = { ...active, workspaceId: "workspace-b", updatedAt: now + 1 };
  assert.equal(chooseActiveWorkspaceForSave(active, distinct), distinct);
  assert.notEqual(active.workspaceId, distinct.workspaceId);
});
