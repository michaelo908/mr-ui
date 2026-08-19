import {
  hasValidWorkspaceFiles,
  hasValidWorkspaceMessages,
  type GravitasMessageSnapshot,
  type GravitasUploadedFileSnapshot,
  type GravitasWorkspaceSnapshot,
} from "@/lib/gravitas-workspace";
import type { CadenceMode } from "@/lib/cadence";
import type { UrlSource } from "@/lib/sources";

export const GRAVITAS_ACTIVE_WORKSPACE_VERSION = 2 as const;
export const GRAVITAS_ACTIVE_POINTER_VERSION = 1 as const;
const JUMP_IN_WORKSPACE_PREFIX = "jump-in:";

export type GravitasActiveWorkspace = {
  version: typeof GRAVITAS_ACTIVE_WORKSPACE_VERSION;
  revision: number;
  workspaceId: string;
  ownerUserId: string;
  originatingJumpInSessionId: string | null;
  inputMode: "text" | "url" | "images";
  draft: string;
  urlDraft: string;
  importedUrl: { requestedUrl: string; source: UrlSource } | null;
  uploadedFiles: GravitasUploadedFileSnapshot[];
  selectedGraviton: string;
  cadence: CadenceMode;
  messages: GravitasMessageSnapshot[];
  createdAt: number;
  updatedAt: number;
  handoff: {
    kind: "jump-in" | "paid";
    pendingSnapshotVersion: number | null;
    importedAt: number | null;
  };
};

export type GravitasActiveWorkspacePointer = {
  version: typeof GRAVITAS_ACTIVE_POINTER_VERSION;
  userId: string;
  workspaceId: string;
  updatedAt: number;
};

export function isValidActiveWorkspace(
  value: unknown,
  expectedUserId?: string,
  expectedWorkspaceId?: string
): value is GravitasActiveWorkspace {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<GravitasActiveWorkspace>;
  const baseIsValid = Boolean(
    record.version === GRAVITAS_ACTIVE_WORKSPACE_VERSION &&
      typeof record.workspaceId === "string" &&
      Number.isSafeInteger(record.revision) &&
      (record.revision ?? 0) >= 0 &&
      (!expectedWorkspaceId || record.workspaceId === expectedWorkspaceId) &&
      typeof record.ownerUserId === "string" &&
      (!expectedUserId || record.ownerUserId === expectedUserId) &&
      (record.originatingJumpInSessionId === null || typeof record.originatingJumpInSessionId === "string") &&
      ["text", "url", "images"].includes(record.inputMode ?? "") &&
      typeof record.draft === "string" &&
      typeof record.urlDraft === "string" &&
      Array.isArray(record.uploadedFiles) &&
      typeof record.selectedGraviton === "string" &&
      (record.cadence === "dynamic" || record.cadence === "sustained") &&
      Array.isArray(record.messages) &&
      typeof record.createdAt === "number" &&
      typeof record.updatedAt === "number" &&
      (record.handoff?.kind === "jump-in" || record.handoff?.kind === "paid") &&
      (record.handoff.pendingSnapshotVersion === null || typeof record.handoff.pendingSnapshotVersion === "number") &&
      (record.handoff.importedAt === null || typeof record.handoff.importedAt === "number")
  );
  if (!baseIsValid) return false;
  return hasValidWorkspaceFiles(record.uploadedFiles!) &&
    hasValidWorkspaceMessages(record.messages!);
}

export function isValidActivePointer(
  value: unknown,
  expectedUserId: string
): value is GravitasActiveWorkspacePointer {
  if (!value || typeof value !== "object") return false;
  const pointer = value as Partial<GravitasActiveWorkspacePointer>;
  return pointer.version === GRAVITAS_ACTIVE_POINTER_VERSION &&
    pointer.userId === expectedUserId &&
    typeof pointer.workspaceId === "string" &&
    typeof pointer.updatedAt === "number";
}

export function activeWorkspaceFromPending(
  snapshot: GravitasWorkspaceSnapshot,
  ownerUserId: string,
  workspaceId = activeWorkspaceIdForPending(snapshot.sessionId),
  now = Date.now()
): GravitasActiveWorkspace {
  return {
    version: GRAVITAS_ACTIVE_WORKSPACE_VERSION,
    revision: snapshot.revision,
    workspaceId,
    ownerUserId,
    originatingJumpInSessionId: snapshot.sessionId,
    inputMode: snapshot.inputMode,
    draft: snapshot.draft,
    urlDraft: snapshot.urlDraft,
    importedUrl: snapshot.importedUrl,
    uploadedFiles: snapshot.uploadedFiles,
    selectedGraviton: snapshot.selectedGraviton,
    cadence: snapshot.cadence,
    messages: snapshot.messages,
    createdAt: now,
    updatedAt: now,
    handoff: {
      kind: "jump-in",
      pendingSnapshotVersion: snapshot.version,
      importedAt: now,
    },
  };
}

export function activeWorkspaceIdForPending(sessionId: string) {
  return `${JUMP_IN_WORKSPACE_PREFIX}${sessionId}`;
}

export function hasActiveWorkspaceContent(record: GravitasActiveWorkspace) {
  return Boolean(
    record.draft.trim() || record.urlDraft.trim() || record.importedUrl ||
    record.uploadedFiles.length || record.messages.length
  );
}

export function chooseActiveWorkspaceForSave(
  existing: unknown,
  incoming: GravitasActiveWorkspace
) {
  const current = migrateActiveWorkspace(existing, incoming.ownerUserId, incoming.workspaceId);
  if (!current) return incoming;
  if (current.revision >= incoming.revision) return current;
  if (hasActiveWorkspaceContent(current) && !hasActiveWorkspaceContent(incoming)) return current;
  return {
    ...incoming,
    createdAt: current.createdAt,
  };
}

export function migrateActiveWorkspace(
  value: unknown,
  expectedUserId?: string,
  expectedWorkspaceId?: string
): GravitasActiveWorkspace | null {
  if (isValidActiveWorkspace(value, expectedUserId, expectedWorkspaceId)) return value;
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.version !== 1) return null;
  const migrated = {
    ...legacy,
    version: GRAVITAS_ACTIVE_WORKSPACE_VERSION,
    revision: 1,
  };
  return isValidActiveWorkspace(migrated, expectedUserId, expectedWorkspaceId)
    ? migrated
    : null;
}
