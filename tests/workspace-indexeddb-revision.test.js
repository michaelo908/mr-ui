/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
const { indexedDB, IDBKeyRange } = require("fake-indexeddb");

const root = path.resolve(__dirname, "..");
global.window = { indexedDB };

function loadTypeScriptModule(file, dependencies = {}) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const moduleUnderTest = { exports: {} };
  vm.runInNewContext(compiled, {
    module: moduleUnderTest,
    exports: moduleUnderTest.exports,
    require: (specifier) => dependencies[specifier] ?? {},
    window: global.window,
    indexedDB,
    IDBKeyRange,
    Blob,
    DOMException,
    Date,
  });
  return moduleUnderTest.exports;
}

const workspace = loadTypeScriptModule("lib/gravitas-workspace.ts");
const pendingStore = loadTypeScriptModule("lib/gravitas-workspace-store.ts", {
  "@/lib/gravitas-workspace": workspace,
});
const activeModel = loadTypeScriptModule("lib/gravitas-active-workspace.ts", {
  "@/lib/gravitas-workspace": workspace,
});
const activeStore = loadTypeScriptModule("lib/gravitas-active-workspace-store.ts", {
  "@/lib/gravitas-workspace-store": pendingStore,
  "@/lib/gravitas-active-workspace": activeModel,
});
const persistence = loadTypeScriptModule("lib/gravitas-persistence-coordinator.ts");

const now = 1_900_000_000_000;

function canonicalInput(sessionId, messages, overrides = {}) {
  return {
    sessionId,
    inputMode: "text",
    draft: "durability fixture",
    urlDraft: "",
    importedUrl: null,
    uploadedFiles: [],
    selectedGraviton: "What weakens trust?",
    cadence: "sustained",
    messages,
    ...overrides,
  };
}

function analysis(runId, rewriteCount, viewportCount = 0) {
  const rewrites = Array.from({ length: rewriteCount }, (_, index) => ({
    id: `${runId}:rewrite:${index}`,
    label: `Version ${String.fromCharCode(65 + index)}`,
    content: `rewrite-${index}`,
    copyFormat: "email",
  }));
  return [
    {
      role: "user",
      content: "source identity",
      runId,
      cadence: "sustained",
      sourceIdentity: { type: viewportCount ? "url" : "text", title: "Fixture" },
      sourceImages: Array.from({ length: viewportCount }, (_, index) => ({
        id: `${runId}:viewport:${index + 1}`,
        type: "webpage-viewport",
        title: `Viewport ${index + 1}`,
        dataUrl: "data:image/png;base64,fixture",
        order: index,
      })),
    },
    {
      role: "assistant",
      content: "completed analysis",
      runId,
      analysisStatus: "success",
      graviton: "What weakens trust?",
      cadence: "sustained",
      completedAt: now,
      rewrites,
    },
  ];
}

test("actual IndexedDB keeps the highest complete revision through rewrites, viewports and remounts", async () => {
  const sessionId = `revision-${crypto.randomUUID()}`;
  const textMessages = analysis("text-run", 2);
  const withRewrites = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, textMessages),
    null,
    now
  );
  const storedRewrites = await pendingStore.saveWorkspaceSnapshotSafely(withRewrites, now);
  assert.equal(storedRewrites.revision, 1);
  assert.deepEqual(storedRewrites.messages[1].rewrites.map((item) => item.id), [
    "text-run:rewrite:0",
    "text-run:rewrite:1",
  ]);

  const urlMessages = [...textMessages, ...analysis("url-run", 0, 4)];
  const withViewports = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, urlMessages, {
      inputMode: "url",
      draft: "",
      urlDraft: "https://example.com/fixture",
    }),
    storedRewrites,
    now + 1
  );
  const storedViewports = await pendingStore.saveWorkspaceSnapshotSafely(withViewports, now + 1);
  assert.equal(storedViewports.revision, 2);

  const staleWithoutRewrites = {
    ...withRewrites,
    revision: 1,
    messages: analysis("text-run", 0),
    updatedAt: now + 2,
  };
  await new Promise((resolve) => setTimeout(resolve, 1));
  await pendingStore.saveWorkspaceSnapshotSafely(staleWithoutRewrites, now + 2);

  for (let remount = 0; remount < 3; remount += 1) {
    const restored = await pendingStore.loadWorkspaceSnapshot(sessionId, now + 3 + remount);
    assert.equal(restored.revision, 2);
    assert.equal(restored.messages[1].rewrites.length, 2);
    assert.equal(restored.messages[2].sourceImages.length, 4);
  }
});

test("legacy pending records migrate without losing nested rewrites", async () => {
  const sessionId = `legacy-${crypto.randomUUID()}`;
  const current = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, analysis("legacy-run", 2)),
    null,
    now
  );
  const { workspaceId, revision, provenance, ...legacyFields } = current;
  void workspaceId;
  void revision;
  void provenance;
  const database = await pendingStore.openWorkspaceDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(pendingStore.PENDING_WORKSPACE_STORE, "readwrite");
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.objectStore(pendingStore.PENDING_WORKSPACE_STORE).put({
      ...legacyFields,
      version: 1,
    });
  });
  database.close();

  const migrated = await pendingStore.loadWorkspaceSnapshot(sessionId, now + 1);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.revision, 1);
  assert.equal(migrated.provenance.schemaMigratedFrom, 1);
  assert.equal(migrated.messages[1].rewrites.length, 2);
});

test("pending promotion verifies the same revision and nested rewrites before active hydration", async () => {
  const sessionId = `promotion-${crypto.randomUUID()}`;
  const pending = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, analysis("promotion-run", 2, 3)),
    null,
    now
  );
  await pendingStore.saveWorkspaceSnapshotSafely(pending, now);
  const active = activeModel.activeWorkspaceFromPending(pending, "user-a", undefined, now + 1);
  const verified = await activeStore.promotePendingToActive(active);
  assert.equal(verified.revision, pending.revision);
  assert.equal(verified.messages[1].rewrites.length, 2);
  assert.equal(verified.messages[0].sourceImages.length, 3);

  const hydrated = await activeStore.loadActiveWorkspaceForUser("user-a");
  assert.equal(hydrated.revision, pending.revision);
  assert.equal(hydrated.messages[1].rewrites.length, 2);
  assert.equal(await activeStore.loadActiveWorkspaceForUser("user-b"), null);
});

test("serialized persistence prevents delayed stale work from overtaking the highest revision", async () => {
  const sessionId = `serialized-${crypto.randomUUID()}`;
  const coordinator = persistence.createRevisionedPersistenceCoordinator();
  const first = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, analysis("text-run", 0)),
    null,
    now
  );
  const second = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, analysis("text-run", 2)),
    first,
    now + 1
  );
  const third = workspace.createWorkspaceSnapshot(
    canonicalInput(sessionId, [...analysis("text-run", 2), ...analysis("url-run", 0, 4)]),
    second,
    now + 2
  );

  const completionOrder = [];
  const delayedFirst = coordinator.enqueue(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    completionOrder.push(first.revision);
    return pendingStore.saveWorkspaceSnapshotSafely(first, now);
  });
  const savedSecond = coordinator.enqueue(async () => {
    completionOrder.push(second.revision);
    return pendingStore.saveWorkspaceSnapshotSafely(second, now + 1);
  });
  const savedThird = coordinator.enqueue(async () => {
    completionOrder.push(third.revision);
    return pendingStore.saveWorkspaceSnapshotSafely(third, now + 2);
  });
  await Promise.all([delayedFirst, savedSecond, savedThird]);
  await coordinator.drain();

  assert.deepEqual(completionOrder, [1, 2, 3]);
  const restored = await pendingStore.loadWorkspaceSnapshot(sessionId, now + 3);
  assert.equal(restored.revision, 3);
  assert.equal(restored.messages[1].rewrites.length, 2);
  assert.equal(restored.messages[2].sourceImages.length, 4);

  const staleArrival = { ...second, updatedAt: now + 4 };
  await pendingStore.saveWorkspaceSnapshotSafely(staleArrival, now + 4);
  const afterStaleArrival = await pendingStore.loadWorkspaceSnapshot(sessionId, now + 5);
  assert.equal(afterStaleArrival.revision, 3);
  assert.equal(afterStaleArrival.messages[1].rewrites.length, 2);
});
