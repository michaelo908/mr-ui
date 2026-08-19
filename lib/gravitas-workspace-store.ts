import {
  chooseWorkspaceSnapshotForSave,
  migrateWorkspaceSnapshot,
  type GravitasWorkspaceSnapshot,
} from "@/lib/gravitas-workspace";

export const DATABASE_NAME = "gravitas-workspaces";
export const DATABASE_VERSION = 2;
export const PENDING_WORKSPACE_STORE = "pending-workspaces";
export const ACTIVE_WORKSPACE_STORE = "active-paid-workspaces";
export const ACTIVE_WORKSPACE_POINTER_STORE = "active-paid-workspace-pointers";

export function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PENDING_WORKSPACE_STORE)) {
        database.createObjectStore(PENDING_WORKSPACE_STORE, { keyPath: "sessionId" });
      }
      if (!database.objectStoreNames.contains(ACTIVE_WORKSPACE_STORE)) {
        database.createObjectStore(ACTIVE_WORKSPACE_STORE, { keyPath: "workspaceId" });
      }
      if (!database.objectStoreNames.contains(ACTIVE_WORKSPACE_POINTER_STORE)) {
        database.createObjectStore(ACTIVE_WORKSPACE_POINTER_STORE, { keyPath: "userId" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Workspace storage unavailable"));
  });
}

function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore, resolve: (value: T) => void, reject: (reason?: unknown) => void) => void
): Promise<T> {
  return openWorkspaceDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(PENDING_WORKSPACE_STORE, mode);
        const store = transaction.objectStore(PENDING_WORKSPACE_STORE);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("Workspace storage failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Workspace storage aborted"));
        operation(store, resolve, reject);
      })
  );
}

export async function saveWorkspaceSnapshotSafely(
  snapshot: GravitasWorkspaceSnapshot,
  now = Date.now()
) {
  return transact<GravitasWorkspaceSnapshot>("readwrite", (store, resolve, reject) => {
    const readRequest = store.get(snapshot.sessionId);
    readRequest.onerror = () => reject(readRequest.error);
    readRequest.onsuccess = () => {
      const selected = chooseWorkspaceSnapshotForSave(
        readRequest.result,
        snapshot,
        now
      );
      if (selected === readRequest.result) {
        resolve(selected);
        return;
      }

      const writeRequest = store.put(selected);
      writeRequest.onsuccess = () => resolve(selected);
      writeRequest.onerror = () => reject(writeRequest.error);
    };
  });
}

export async function loadWorkspaceSnapshot(sessionId: string, now = Date.now()) {
  const value = await transact<unknown>("readonly", (store, resolve, reject) => {
    const request = store.get(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (
    value &&
    typeof value === "object" &&
    (value as Partial<GravitasWorkspaceSnapshot>).sessionId === sessionId &&
    (value as Partial<GravitasWorkspaceSnapshot>).state === "consumed"
  ) {
    return null;
  }

  const migrated = migrateWorkspaceSnapshot(value, sessionId, now);
  if (!migrated) {
    if (value !== undefined) await deleteWorkspaceSnapshot(sessionId).catch(() => undefined);
    return null;
  }
  if (migrated !== value) {
    await transact<void>("readwrite", (store, resolve, reject) => {
      const request = store.put(migrated);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  return migrated;
}

export async function consumeWorkspaceSnapshot(sessionId: string, consumedAt = Date.now()) {
  const snapshot = await loadWorkspaceSnapshot(sessionId, consumedAt);
  if (!snapshot) return false;
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put({ ...snapshot, state: "consumed", consumedAt });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  return true;
}

export async function deleteWorkspaceSnapshot(sessionId: string) {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.delete(sessionId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function isStorageQuotaError(error: unknown) {
  return error instanceof DOMException &&
    (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED");
}
