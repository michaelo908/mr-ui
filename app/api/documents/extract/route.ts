import { NextResponse } from "next/server";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";
import {
  countDocumentWords,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_MAX_CHARACTERS,
  documentKindForFile,
  normaliseDocumentText,
} from "@/lib/document-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const uploaded = formData.get("document");
    if (!(uploaded instanceof File)) {
      return NextResponse.json({ error: "Choose a Word document or PDF first." }, { status: 400 });
    }

    const kind = documentKindForFile(uploaded);
    if (!kind) {
      return NextResponse.json({ error: "Multirrupt currently accepts .docx and PDF documents." }, { status: 415 });
    }
    if (uploaded.size === 0 || uploaded.size > DOCUMENT_MAX_BYTES) {
      return NextResponse.json({ error: "Choose a document smaller than 10 MB." }, { status: 413 });
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    let extracted = "";
    if (kind === "docx") {
      const result = await mammoth.extractRawText({ buffer });
      extracted = result.value;
    } else {
      const parser = new PDFParse({ data: buffer });
      try {
        extracted = (await parser.getText()).text;
      } finally {
        // Extraction is the user-facing operation. A parser cleanup issue must not
        // discard text that was already read successfully.
        await parser.destroy().catch((cleanupError) => {
          console.warn("PDF parser cleanup did not complete", cleanupError);
        });
      }
    }

    const text = normaliseDocumentText(extracted);
    if (!text) {
      return NextResponse.json({
        error: "No readable text was found. This may be a scanned or image-only PDF; export a Word copy or use Images instead.",
      }, { status: 422 });
    }
    if (text.length > DOCUMENT_MAX_CHARACTERS) {
      return NextResponse.json({
        error: "For this first document upload, keep the extracted text under 60,000 characters.",
      }, { status: 413 });
    }

    return NextResponse.json({
      text,
      document: {
        name: uploaded.name,
        kind,
        size: uploaded.size,
        wordCount: countDocumentWords(text),
      },
    });
  } catch (error) {
    console.error("Document extraction failed", error);
    const diagnostic = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 180) : "Unknown PDF reader error";
    return NextResponse.json({
      error: `Multirrupt could not read that document. ${diagnostic || "Try exporting it again as Word or PDF."}`,
    }, { status: 422 });
  }
}
