import type { CadenceMode } from "@/lib/cadence";
import type { SourceIdentity, SourceImage, UrlSource } from "@/lib/sources";

export const GRAVITAS_WORKSPACE_VERSION = 1 as const;
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
    !Array.isArray(snapshot.uploadedFiles)
  ) {
    return false;
  }

  const filesAreValid = snapshot.uploadedFiles.every(
    (file) =>
      file &&
      typeof file.name === "string" &&
      typeof file.type === "string" &&
      typeof file.lastModified === "number" &&
      typeof Blob !== "undefined" &&
      file.blob instanceof Blob
  );
  if (!filesAreValid) return false;

  return snapshot.messages.every((message) => {
    if (!message || typeof message !== "object") return false;
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
          (rewrite) =>
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
  input: Omit<GravitasWorkspaceSnapshot, "version" | "state" | "createdAt" | "updatedAt" | "expiresAt">,
  previous?: GravitasWorkspaceSnapshot | null,
  now = Date.now()
): GravitasWorkspaceSnapshot {
  return {
    ...input,
    version: GRAVITAS_WORKSPACE_VERSION,
    state: "pending",
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    expiresAt: previous?.expiresAt ?? now + GRAVITAS_WORKSPACE_TTL_MS,
  };
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
  if (
    isValidWorkspaceSnapshot(existing, incoming.sessionId, now) &&
    hasWorkspaceContent(existing) &&
    !hasWorkspaceContent(incoming)
  ) {
    return existing;
  }
  if (isValidWorkspaceSnapshot(existing, incoming.sessionId, now)) {
    const existingByRunId = new Map(
      existing.messages.map((message) => [message.runId, message])
    );
    const messages = incoming.messages.map((message) => {
      const retained = existingByRunId.get(message.runId);
      if (
        message.role === "assistant" &&
        retained?.role === "assistant" &&
        (retained.rewrites?.length ?? 0) > (message.rewrites?.length ?? 0)
      ) {
        return { ...message, rewrites: retained.rewrites };
      }
      return message;
    });
    return { ...incoming, messages };
  }
  return incoming;
}
