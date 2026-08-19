import {
  ACTIVE_WORKSPACE_POINTER_STORE,
  ACTIVE_WORKSPACE_STORE,
  openWorkspaceDatabase,
} from "@/lib/gravitas-workspace-store";
import {
  chooseActiveWorkspaceForSave,
  GRAVITAS_ACTIVE_POINTER_VERSION,
  isValidActivePointer,
  isValidActiveWorkspace,
  migrateActiveWorkspace,
  type GravitasActiveWorkspace,
  type GravitasActiveWorkspacePointer,
} from "@/lib/gravitas-active-workspace";

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("Active workspace transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("Active workspace transaction aborted"));
  });
}

export async function loadActiveWorkspaceForUser(userId: string) {
  const database = await openWorkspaceDatabase();
  try {
    const transaction = database.transaction(
      [ACTIVE_WORKSPACE_POINTER_STORE, ACTIVE_WORKSPACE_STORE],
      "readwrite"
    );
    const pointer = await requestValue(
      transaction.objectStore(ACTIVE_WORKSPACE_POINTER_STORE).get(userId)
    );
    if (!isValidActivePointer(pointer, userId)) return null;
    const workspace = await requestValue(
      transaction.objectStore(ACTIVE_WORKSPACE_STORE).get(pointer.workspaceId)
    );
    const migrated = migrateActiveWorkspace(workspace, userId, pointer.workspaceId);
    if (migrated && workspace !== migrated) {
      await requestValue(
        transaction.objectStore(ACTIVE_WORKSPACE_STORE).put(migrated)
      );
    }
    await waitForTransaction(transaction);
    return migrated;
  } finally {
    database.close();
  }
}

export async function promotePendingToActive(
  record: GravitasActiveWorkspace
) {
  const database = await openWorkspaceDatabase();
  try {
    return await new Promise<GravitasActiveWorkspace>((resolve, reject) => {
      const transaction = database.transaction(
        [ACTIVE_WORKSPACE_STORE, ACTIVE_WORKSPACE_POINTER_STORE],
        "readwrite"
      );
      const activeStore = transaction.objectStore(ACTIVE_WORKSPACE_STORE);
      const pointerStore = transaction.objectStore(ACTIVE_WORKSPACE_POINTER_STORE);
      let verified: GravitasActiveWorkspace | null = null;
      transaction.oncomplete = () => verified ? resolve(verified) : reject(new Error("Active workspace verification failed"));
      transaction.onerror = () => reject(transaction.error ?? new Error("Active workspace promotion failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("Active workspace promotion aborted"));

      const existingRead = activeStore.get(record.workspaceId);
      existingRead.onerror = () => transaction.abort();
      existingRead.onsuccess = () => {
        if (
          existingRead.result !== undefined &&
          !migrateActiveWorkspace(existingRead.result, record.ownerUserId, record.workspaceId)
        ) {
          transaction.abort();
          return;
        }
        const selected = chooseActiveWorkspaceForSave(existingRead.result, record);
        const write = activeStore.put(selected);
        write.onerror = () => transaction.abort();
        write.onsuccess = () => {
          const readBack = activeStore.get(record.workspaceId);
          readBack.onerror = () => transaction.abort();
          readBack.onsuccess = () => {
            if (!isValidActiveWorkspace(readBack.result, record.ownerUserId, record.workspaceId)) {
              transaction.abort();
              return;
            }
            verified = readBack.result;
            const pointer: GravitasActiveWorkspacePointer = {
              version: GRAVITAS_ACTIVE_POINTER_VERSION,
              userId: record.ownerUserId,
              workspaceId: record.workspaceId,
              updatedAt: record.updatedAt,
            };
            const pointerWrite = pointerStore.put(pointer);
            pointerWrite.onerror = () => transaction.abort();
          };
        };
      };
    });
  } finally {
    database.close();
  }
}

export async function saveActiveWorkspaceSafely(record: GravitasActiveWorkspace) {
  const database = await openWorkspaceDatabase();
  try {
    const transaction = database.transaction(ACTIVE_WORKSPACE_STORE, "readwrite");
    const completion = waitForTransaction(transaction);
    const store = transaction.objectStore(ACTIVE_WORKSPACE_STORE);
    const existing = await requestValue(store.get(record.workspaceId));
    const selected = chooseActiveWorkspaceForSave(existing, record);
    await requestValue(store.put(selected));
    await completion;
    return selected;
  } finally {
    database.close();
  }
}

export async function deleteActiveWorkspaceForUser(
  userId: string,
  workspaceId?: string | null
) {
  const database = await openWorkspaceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(
        [ACTIVE_WORKSPACE_STORE, ACTIVE_WORKSPACE_POINTER_STORE],
        "readwrite"
      );
      const pointerStore = transaction.objectStore(ACTIVE_WORKSPACE_POINTER_STORE);
      const activeStore = transaction.objectStore(ACTIVE_WORKSPACE_STORE);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      const read = pointerStore.get(userId);
      read.onerror = () => transaction.abort();
      read.onsuccess = () => {
        const pointer = read.result;
        const target = workspaceId ?? (isValidActivePointer(pointer, userId) ? pointer.workspaceId : null);
        if (target) activeStore.delete(target);
        pointerStore.delete(userId);
      };
    });
  } finally {
    database.close();
  }
}
