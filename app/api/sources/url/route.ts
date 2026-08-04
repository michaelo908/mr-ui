import { NextResponse } from "next/server";
import type { UrlSource } from "@/lib/sources";
import { MAX_URL_VIEWPORTS } from "@/lib/sources";
import { captureRenderedPage } from "@/lib/viewport-capture";

export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "syd1";

export async function handleUrlSourceRequest(
  req: Request,
  maxViewports = MAX_URL_VIEWPORTS
) {
  try {
    const body = (await req.json()) as { url?: unknown };
    if (typeof body.url !== "string" || !body.url.trim()) {
      return NextResponse.json({ error: "Enter a webpage URL." }, { status: 400 });
    }

    const requestedUrl = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(body.url.trim())
        ? body.url.trim()
        : `https://${body.url.trim()}`
    );
    const rendered = await captureRenderedPage(requestedUrl, maxViewports);
    const source: UrlSource = {
      id: crypto.randomUUID(),
      type: "url",
      title:
        rendered.title ||
        rendered.finalUrl.hostname.replace(/^www\./, "") ||
        "Rendered webpage",
      originalLocation: rendered.finalUrl.toString(),
      extractedText: rendered.extractedText,
      wordCount: rendered.wordCount,
      truncated: rendered.truncated,
      images: rendered.images,
      captureMode: "rendered-viewports",
    };

    return NextResponse.json({ source });
  } catch (error) {
    console.error("Gravitas URL rendering failed", {
      error,
      cause: error instanceof Error ? error.cause : undefined,
    });
    const errorCode =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : "";
    const isAddressFailure = [
      "ENOTFOUND",
      "EAI_AGAIN",
      "EBUSY",
    ].includes(errorCode);
    return NextResponse.json(
      {
        error: isAddressFailure
          ? "Gravitas could not find that website. Check the address and try again."
          : "Gravitas could not render this page. Please try again.",
      },
      { status: 422 }
    );
  }
}

export async function POST(req: Request) {
  return handleUrlSourceRequest(req);
}
