import {
  isValidWorkspaceSnapshot,
  type GravitasWorkspaceSnapshot,
} from "@/lib/gravitas-workspace";

const DATABASE_NAME = "gravitas-workspaces";
const DATABASE_VERSION = 1;
const STORE_NAME = "pending-workspaces";

function openWorkspaceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: "sessionId" });
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
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("Workspace storage failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("Workspace storage aborted"));
        operation(store, resolve, reject);
      })
  );
}

export async function saveWorkspaceSnapshot(snapshot: GravitasWorkspaceSnapshot) {
  await transact<void>("readwrite", (store, resolve, reject) => {
    const request = store.put(snapshot);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadWorkspaceSnapshot(sessionId: string, now = Date.now()) {
  const value = await transact<unknown>("readonly", (store, resolve, reject) => {
    const request = store.get(sessionId);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!isValidWorkspaceSnapshot(value, sessionId, now)) {
    if (value !== undefined) await deleteWorkspaceSnapshot(sessionId).catch(() => undefined);
    return null;
  }
  return value;
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
