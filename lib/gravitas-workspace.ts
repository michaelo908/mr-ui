import type { CadenceMode } from "@/lib/cadence";
import type { SourceIdentity, SourceImage, UrlSource } from "@/lib/sources";

export const GRAVITAS_WORKSPACE_VERSION = 2 as const;
export const GRAVITAS_WORKSPACE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const GRAVITAS_RESUME_MARKER_KEY = "gravitasResumeMarkerV1";
export const GRAVITAS_RESUME_TARGET = "/?resume=jump-in";

export type WorkspaceHydrationState = "pending" | "hydrating" | "ready" | "failed";

export type GravitasRewriteSnapshot = {
  id: string;
  label: string;
  content: string;
  copyFormat: "email" | "word";
};

export type GravitasMessageSnapshot = {
  role: "user" | "assistant";
  content: string;
  runId?: string;
  analysisStatus?: "success" | "error";
  sourceContent?: string;
  imageData?: string[];
  sourceImages?: SourceImage[];
  sourceIdentity?: SourceIdentity;
  graviton?: string;
  cadence?: CadenceMode;
  completedAt?: number;
  rewrites?: GravitasRewriteSnapshot[];
};

export type GravitasUploadedFileSnapshot = {
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
};

export type GravitasWorkspaceSnapshot = {
  version: typeof GRAVITAS_WORKSPACE_VERSION;
  workspaceId: string;
  revision: number;
  state: "pending" | "consumed";
  sessionId: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  consumedAt?: number;
  inputMode: "text" | "url" | "images";
  draft: string;
  urlDraft: string;
  importedUrl: { requestedUrl: string; source: UrlSource } | null;
  uploadedFiles: GravitasUploadedFileSnapshot[];
  selectedGraviton: string;
  cadence: CadenceMode;
  messages: GravitasMessageSnapshot[];
  provenance: { kind: "jump-in"; schemaMigratedFrom: number | null };
};

export function isCadenceMode(value: unknown): value is CadenceMode {
  return value === "dynamic" || value === "sustained";
}

export function isValidResumeTarget(value: unknown): value is typeof GRAVITAS_RESUME_TARGET {
  return value === GRAVITAS_RESUME_TARGET;
}

export function isValidWorkspaceSnapshot(
  value: unknown,
  expectedSessionId?: string,
  now = Date.now()
): value is GravitasWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<GravitasWorkspaceSnapshot>;
  if (
    snapshot.version !== GRAVITAS_WORKSPACE_VERSION ||
    typeof snapshot.workspaceId !== "string" ||
    !Number.isSafeInteger(snapshot.revision) ||
    (snapshot.revision ?? 0) < 0 ||
    snapshot.state !== "pending" ||
    typeof snapshot.sessionId !== "string" ||
    (expectedSessionId !== undefined && snapshot.sessionId !== expectedSessionId) ||
    typeof snapshot.createdAt !== "number" ||
    typeof snapshot.updatedAt !== "number" ||
    typeof snapshot.expiresAt !== "number" ||
    snapshot.expiresAt <= now ||
    !["text", "url", "images"].includes(snapshot.inputMode ?? "") ||
    typeof snapshot.draft !== "string" ||
    typeof snapshot.urlDraft !== "string" ||
    typeof snapshot.selectedGraviton !== "string" ||
    !isCadenceMode(snapshot.cadence) ||
    !Array.isArray(snapshot.messages) ||
    !Array.isArray(snapshot.uploadedFiles) ||
    snapshot.provenance?.kind !== "jump-in" ||
    (snapshot.provenance.schemaMigratedFrom !== null &&
      typeof snapshot.provenance.schemaMigratedFrom !== "number")
  ) {
    return false;
  }

  if (!hasValidWorkspaceFiles(snapshot.uploadedFiles)) return false;
  return hasValidWorkspaceMessages(snapshot.messages);
}

export function hasValidWorkspaceFiles(files: unknown[]): files is GravitasUploadedFileSnapshot[] {
  return files.every(
    (value) => {
      const file = value as Partial<GravitasUploadedFileSnapshot>;
      return (
      file &&
      typeof file.name === "string" &&
      typeof file.type === "string" &&
      typeof file.lastModified === "number" &&
      typeof Blob !== "undefined" &&
      file.blob instanceof Blob
      );
    }
  );
}

export function hasValidWorkspaceMessages(messages: unknown[]): messages is GravitasMessageSnapshot[] {
  return messages.every((value) => {
    if (!value || typeof value !== "object") return false;
    const message = value as Partial<GravitasMessageSnapshot>;
    if (message.role !== "user" && message.role !== "assistant") return false;
    if (typeof message.content !== "string") return false;
    if (message.content === "__MR_THINKING__") return false;
    if (typeof message.runId !== "string") return false;
    if (message.cadence !== undefined && !isCadenceMode(message.cadence)) return false;
    if (
      message.role === "assistant" &&
      (message.analysisStatus !== "success" ||
        typeof message.completedAt !== "number" ||
        typeof message.graviton !== "string" ||
        !isCadenceMode(message.cadence))
    ) {
      return false;
    }
    if (
      message.rewrites !== undefined &&
      (!Array.isArray(message.rewrites) ||
        !message.rewrites.every(
          (rewrite: GravitasRewriteSnapshot) =>
            rewrite &&
            typeof rewrite.id === "string" &&
            typeof rewrite.label === "string" &&
            typeof rewrite.content === "string" &&
            (rewrite.copyFormat === "email" || rewrite.copyFormat === "word")
        ))
    ) {
      return false;
    }
    return true;
  });
}

export function createWorkspaceSnapshot(
  input: Omit<GravitasWorkspaceSnapshot, "version" | "workspaceId" | "revision" | "state" | "createdAt" | "updatedAt" | "expiresAt" | "provenance">,
  previous?: GravitasWorkspaceSnapshot | null,
  now = Date.now()
): GravitasWorkspaceSnapshot {
  return {
    ...input,
    version: GRAVITAS_WORKSPACE_VERSION,
    workspaceId: previous?.workspaceId ?? `jump-in:${input.sessionId}`,
    revision: (previous?.revision ?? 0) + 1,
    state: "pending",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    expiresAt: previous?.expiresAt ?? now + GRAVITAS_WORKSPACE_TTL_MS,
    provenance: previous?.provenance ?? {
      kind: "jump-in",
      schemaMigratedFrom: null,
    },
  };
}

export function migrateWorkspaceSnapshot(
  value: unknown,
  expectedSessionId?: string,
  now = Date.now()
): GravitasWorkspaceSnapshot | null {
  if (isValidWorkspaceSnapshot(value, expectedSessionId, now)) return value;
  if (!value || typeof value !== "object") return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.version !== 1 || typeof legacy.sessionId !== "string") return null;
  const migrated = {
    ...legacy,
    version: GRAVITAS_WORKSPACE_VERSION,
    workspaceId: `jump-in:${legacy.sessionId}`,
    revision: 1,
    provenance: { kind: "jump-in", schemaMigratedFrom: 1 },
  };
  return isValidWorkspaceSnapshot(migrated, expectedSessionId, now)
    ? migrated
    : null;
}

export function hasWorkspaceContent(snapshot: GravitasWorkspaceSnapshot) {
  return Boolean(
    snapshot.draft.trim() ||
      snapshot.urlDraft.trim() ||
      snapshot.importedUrl ||
      snapshot.uploadedFiles.length ||
      snapshot.messages.length
  );
}

export function canAutosaveWorkspace(state: WorkspaceHydrationState) {
  return state === "ready";
}

export function chooseWorkspaceSnapshotForSave(
  existing: unknown,
  incoming: GravitasWorkspaceSnapshot,
  now = Date.now()
) {
  const current = migrateWorkspaceSnapshot(existing, incoming.sessionId, now);
  if (current && current.revision >= incoming.revision) return current;
  if (
    current &&
    hasWorkspaceContent(current) &&
    !hasWorkspaceContent(incoming)
  ) {
    return current;
  }
  return incoming;
}
