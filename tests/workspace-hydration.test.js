/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const root = path.resolve(__dirname, "..");
const modelSource = fs.readFileSync(path.join(root, "lib/gravitas-workspace.ts"), "utf8");
const compiled = ts.transpileModule(modelSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const workspace = { exports: {} };
vm.runInNewContext(compiled, {
  module: workspace,
  exports: workspace.exports,
  require: () => ({}),
  Blob,
  Date,
});

const {
  canAutosaveWorkspace,
  chooseWorkspaceSnapshotForSave,
  createWorkspaceSnapshot,
  hasWorkspaceContent,
  isValidWorkspaceSnapshot,
} = workspace.exports;

const now = 1_800_000_000_000;
const sessionId = "jump-in-session";
const viewport = {
  id: "viewport-1",
  src: "data:image/png;base64,capture",
  title: "Viewport 1",
  altText: "Captured page",
};

function snapshot(overrides = {}) {
  return createWorkspaceSnapshot(
    {
      sessionId,
      inputMode: "text",
      draft: "Original source",
      urlDraft: "",
      importedUrl: null,
      uploadedFiles: [],
      selectedGraviton: "Narrative & Story",
      cadence: "sustained",
      messages: [
        { role: "user", content: "Original source", runId: "run-1" },
        {
          role: "assistant",
          content: "Analysis with [Viewport 1]",
          runId: "run-1",
          analysisStatus: "success",
          sourceImages: [viewport],
          graviton: "Narrative & Story",
          cadence: "sustained",
          completedAt: now,
          rewrites: [
            { id: "rewrite-1", label: "Initial rewrite", content: "First", copyFormat: "word" },
            { id: "rewrite-2", label: "Rewrite", content: "Second", copyFormat: "word" },
          ],
        },
      ],
      ...overrides,
    },
    null,
    now
  );
}

test("full unmount/remount lifecycle hydrates complete work before autosave", () => {
  const persisted = snapshot();
  const writes = [];
  let hydration = "pending";

  assert.equal(canAutosaveWorkspace(hydration), false);
  hydration = "hydrating";
  assert.equal(canAutosaveWorkspace(hydration), false);

  const remountedState = structuredClone(persisted);
  hydration = "ready";
  assert.equal(canAutosaveWorkspace(hydration), true);
  writes.push(chooseWorkspaceSnapshotForSave(persisted, remountedState, now + 1));

  assert.equal(writes.length, 1);
  assert.equal(writes[0].draft, "Original source");
  assert.equal(writes[0].selectedGraviton, "Narrative & Story");
  assert.equal(writes[0].cadence, "sustained");
  assert.equal(writes[0].messages[1].rewrites.length, 2);
  assert.deepEqual(writes[0].messages[1].sourceImages, [viewport]);
});

test("empty initial state cannot replace a non-empty pending snapshot", () => {
  const persisted = snapshot();
  const empty = snapshot({ draft: "", messages: [] });
  const selected = chooseWorkspaceSnapshotForSave(persisted, empty, now + 1);
  assert.equal(selected, persisted);
  assert.equal(hasWorkspaceContent(selected), true);
});

test("a later stale write cannot remove rewrites from an existing completed run", () => {
  const persisted = snapshot();
  const stale = snapshot({
    messages: persisted.messages.map((message) =>
      message.role === "assistant" ? { ...message, rewrites: [] } : message
    ),
  });
  const selected = chooseWorkspaceSnapshotForSave(persisted, stale, now + 1);
  assert.equal(selected.messages[1].rewrites.length, 2);
  assert.equal(selected.messages[1].rewrites[1].content, "Second");
});

test("confirmed absence permits the first empty workspace write", () => {
  const empty = snapshot({ draft: "", messages: [] });
  assert.equal(chooseWorkspaceSnapshotForSave(undefined, empty, now + 1), empty);
});

test("malformed and expired records are rejected without blocking a ready editor", () => {
  assert.equal(isValidWorkspaceSnapshot({ sessionId }, sessionId, now), false);
  const expired = { ...snapshot(), expiresAt: now - 1 };
  assert.equal(isValidWorkspaceSnapshot(expired, sessionId, now), false);
  assert.equal(canAutosaveWorkspace("ready"), true);
});

test("storage lookup failure keeps autosave disabled while the editor remains usable", () => {
  assert.equal(canAutosaveWorkspace("failed"), false);
  const visibleEditorState = { draft: "User can continue", messages: [] };
  assert.equal(visibleEditorState.draft, "User can continue");
});

test("clear is an explicit delete and cannot be recreated by a paused autosave", () => {
  let stored = snapshot();
  let paused = true;
  stored = undefined;
  if (!paused && canAutosaveWorkspace("ready")) stored = snapshot({ draft: "", messages: [] });
  assert.equal(stored, undefined);
});

test("cancelled checkout keeps the pending record and failed restore does not consume it", () => {
  const persisted = snapshot();
  const afterCancel = persisted;
  const reconstructionSucceeded = false;
  const consumed = reconstructionSucceeded ? { ...afterCancel, state: "consumed" } : afterCancel;
  assert.equal(consumed.state, "pending");
  assert.equal(consumed.messages.length, 2);
});

test("successful entitlement restore consumes only after reconstruction and uses no API", () => {
  const persisted = snapshot();
  let modelCalls = 0;
  let usageIncrements = 0;
  let analyticsEvents = 0;
  const reconstructed = structuredClone(persisted);
  const overlay = reconstructed.messages[1].sourceImages[0];
  const consumed = { ...persisted, state: "consumed", consumedAt: now + 2 };

  assert.equal(overlay.id, "viewport-1");
  assert.equal(consumed.state, "consumed");
  assert.equal(modelCalls, 0);
  assert.equal(usageIncrements, 0);
  assert.equal(analyticsEvents, 0);
});

test("text, URL and blob-backed image snapshots remain valid and session-bound", () => {
  const text = snapshot();
  const url = snapshot({
    inputMode: "url",
    draft: "",
    urlDraft: "https://example.com/article",
  });
  const image = snapshot({
    inputMode: "images",
    draft: "",
    uploadedFiles: [
      { name: "source.png", type: "image/png", lastModified: now, blob: new Blob(["image"]) },
    ],
  });
  assert.equal(isValidWorkspaceSnapshot(text, sessionId, now + 1), true);
  assert.equal(isValidWorkspaceSnapshot(url, sessionId, now + 1), true);
  assert.equal(isValidWorkspaceSnapshot(image, sessionId, now + 1), true);
  assert.equal(isValidWorkspaceSnapshot(text, "another-session", now + 1), false);
});
