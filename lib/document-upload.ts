export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MAX_CHARACTERS = 60_000;

export type DocumentKind = "docx" | "pdf";

export type UploadedDocument = {
  name: string;
  kind: DocumentKind;
  size: number;
  wordCount: number;
};

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export function documentKindForFile({
  name,
  type,
}: Pick<File, "name" | "type">): DocumentKind | null {
  const lowerName = name.toLowerCase();
  if (lowerName.endsWith(".docx") || type === DOCX_MIME) return "docx";
  if (lowerName.endsWith(".pdf") || type === "application/pdf") return "pdf";
  return null;
}

export function normaliseDocumentText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function countDocumentWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function isUploadedDocument(value: unknown): value is UploadedDocument {
  if (!value || typeof value !== "object") return false;
  const document = value as Partial<UploadedDocument>;
  return (
    typeof document.name === "string" &&
    (document.kind === "docx" || document.kind === "pdf") &&
    typeof document.size === "number" &&
    Number.isSafeInteger(document.size) &&
    document.size >= 0 &&
    typeof document.wordCount === "number" &&
    Number.isSafeInteger(document.wordCount) &&
    document.wordCount >= 0
  );
}
