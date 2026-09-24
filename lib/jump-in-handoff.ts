import type { CadenceMode } from "@/lib/cadence";
import type { UploadedDocument } from "@/lib/document-upload";

/**
 * The small, deliberately short-lived parcel used when a visitor begins in
 * the marketing-site embed and continues in the first-party editor.
 *
 * It contains only pre-analysis work. It is never used for reports, account
 * data, or long-term workspace storage.
 */
export const JUMP_IN_HANDOFF_VERSION = 1 as const;
export const JUMP_IN_HANDOFF_TTL_MS = 10 * 60 * 1000;
export const JUMP_IN_HANDOFF_MAX_BYTES = 3 * 1024 * 1024;

export type JumpInHandoffImage = {
  name: string;
  type: string;
  lastModified: number;
  dataUrl: string;
};

export type JumpInHandoffPayload = {
  version: typeof JUMP_IN_HANDOFF_VERSION;
  sessionId: string;
  inputMode: "text" | "url" | "images" | "document";
  draft: string;
  urlDraft: string;
  selectedGraviton: string;
  cadence: CadenceMode;
  images: JumpInHandoffImage[];
  document: UploadedDocument | null;
};

export function isJumpInHandoffToken(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{32,128}$/.test(value);
}

export function encodedHandoffBytes(payload: JumpInHandoffPayload) {
  return new TextEncoder().encode(JSON.stringify(payload)).byteLength;
}
