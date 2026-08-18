import type { GravitasMessageSnapshot, GravitasUploadedFileSnapshot, GravitasWorkspaceSnapshot } from "@/lib/gravitas-workspace";
import type { CadenceMode } from "@/lib/cadence";
import type { UrlSource } from "@/lib/sources";

export const GRAVITAS_ACTIVE_WORKSPACE_VERSION = 1 as const;
export const GRAVITAS_ACTIVE_POINTER_VERSION = 1 as const;
const JUMP_IN_WORKSPACE_PREFIX = "jump-in:";

export type GravitasActiveWorkspace = {
  version: typeof GRAVITAS_ACTIVE_WORKSPACE_VERSION;
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
  const filesAreValid = record.uploadedFiles!.every(
    (file) =>
      file && typeof file.name === "string" && typeof file.type === "string" &&
      typeof file.lastModified === "number" && typeof Blob !== "undefined" &&
      file.blob instanceof Blob
  );
  if (!filesAreValid) return false;
  return record.messages!.every((message) => {
    if (!message || (message.role !== "user" && message.role !== "assistant")) return false;
    if (typeof message.content !== "string" || message.content === "__MR_THINKING__") return false;
    if (typeof message.runId !== "string") return false;
    if (message.cadence !== undefined && message.cadence !== "dynamic" && message.cadence !== "sustained") return false;
    if (message.role === "assistant" &&
      (message.analysisStatus !== "success" || typeof message.completedAt !== "number" ||
        typeof message.graviton !== "string" ||
        (message.cadence !== "dynamic" && message.cadence !== "sustained"))) return false;
    return message.rewrites === undefined || (Array.isArray(message.rewrites) && message.rewrites.every(
      (rewrite) => rewrite && typeof rewrite.id === "string" && typeof rewrite.label === "string" &&
        typeof rewrite.content === "string" && (rewrite.copyFormat === "email" || rewrite.copyFormat === "word")
    ));
  });
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
  if (!isValidActiveWorkspace(existing, incoming.ownerUserId, incoming.workspaceId)) return incoming;
  if (hasActiveWorkspaceContent(existing) && !hasActiveWorkspaceContent(incoming)) return existing;
  const existingByRunId = new Map(existing.messages.map((message) => [message.runId, message]));
  const incomingRunIds = new Set(incoming.messages.map((message) => message.runId));
  const retainedCompletedWork = existing.messages.filter(
    (message) => !incomingRunIds.has(message.runId)
  );
  return {
    ...incoming,
    createdAt: existing.createdAt,
    messages: [
      ...incoming.messages.map((message) => {
        const retained = existingByRunId.get(message.runId);
        if (message.role === "assistant" && retained?.role === "assistant" &&
          (retained.rewrites?.length ?? 0) > (message.rewrites?.length ?? 0)) {
          return { ...message, rewrites: retained.rewrites };
        }
        return message;
      }),
      ...retainedCompletedWork,
    ],
  };
}
