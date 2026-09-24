/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("document upload accepts Word and text PDFs without pretending to support scans", () => {
  const app = read("components/GravitasApp.tsx");
  const route = read("app/api/documents/extract/route.ts");
  const proxy = read("proxy.ts");
  const nextConfig = read("next.config.ts");
  const contract = read("lib/document-upload.ts");

  assert.match(app, /\["document", "Document"\]/);
  assert.match(app, /Select a Word document or PDF/);
  assert.match(app, /Scanned PDFs are not supported yet/);
  assert.match(app, /Word \(\.docx\) and text-based PDFs/);
  assert.match(route, /mammoth\.extractRawText/);
  assert.match(route, /PDFParse/);
  assert.match(route, /pdf-parse\/worker/);
  assert.match(route, /PDFParse\.setWorker\(getData\(\)\)/);
  assert.match(route, /No readable text was found/);
  assert.match(proxy, /"\/api\/documents"/);
  assert.match(nextConfig, /serverExternalPackages: \["pdf-parse"\]/);
  assert.match(contract, /DOCUMENT_MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(contract, /DOCUMENT_MAX_CHARACTERS = 60_000/);
});

test("documents follow existing analysis, session, and telemetry boundaries", () => {
  const app = read("components/GravitasApp.tsx");
  const signals = read("lib/signals/registry.ts");
  const workspace = read("lib/gravitas-workspace.ts");
  const handoff = read("app/api/jump-in/handoff/route.ts");

  assert.match(app, /inputMode === "text" \|\| inputMode === "document"/);
  assert.match(app, /inputMode === "document" \? DOCUMENT_MAX_CHARACTERS : 30000/);
  assert.match(app, /Document accepted\. Taking you to sign in/);
  assert.match(app, /Document accepted\. Preparing your analysis/);
  assert.match(app, /value=\{urlDraft \|\| "https:\/\/"\}/);
  assert.match(app, /JUMP_IN_MAX_PASTED_WORDS/);
  assert.match(signals, /"document"/);
  assert.match(workspace, /uploadedDocument: UploadedDocument \| null/);
  assert.match(handoff, /"text", "url", "images", "document"/);
});
