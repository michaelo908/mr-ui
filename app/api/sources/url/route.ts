import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import {
  extractHtmlTitle,
  stripHtmlToReadableText,
  type UrlSource,
} from "@/lib/sources";

const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_EXTRACTED_CHARACTERS = 28_000;
const MAX_REDIRECTS = 4;

function isPrivateAddress(address: string) {
  if (address === "::1" || address === "0.0.0.0") return true;

  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return (
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    );
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return true;
  }

  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

async function validatePublicUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only public HTTP and HTTPS pages can be analysed.");
  }

  if (
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  ) {
    throw new Error("That address is not a public webpage.");
  }

  const addresses = isIP(url.hostname)
    ? [{ address: url.hostname }]
    : await lookup(url.hostname, { all: true, verbatim: true });

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("That address is not a public webpage.");
  }
}

async function fetchPublicPage(initialUrl: URL) {
  let currentUrl = initialUrl;

  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    await validatePublicUrl(currentUrl);

    const response = await fetch(currentUrl, {
      cache: "no-store",
      headers: {
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        "User-Agent": "Gravitas Source Reader/1.0",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The page returned an invalid redirect.");
      currentUrl = new URL(location, currentUrl);
      continue;
    }

    if (!response.ok) {
      throw new Error(`The page returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (
      !contentType.includes("text/html") &&
      !contentType.includes("application/xhtml+xml") &&
      !contentType.includes("text/plain")
    ) {
      throw new Error("This URL does not point to a readable webpage.");
    }

    const declaredSize = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredSize) && declaredSize > MAX_RESPONSE_BYTES) {
      throw new Error("This page is too large to import in one pass.");
    }

    const html = (await response.text()).slice(0, MAX_RESPONSE_BYTES);
    return { html, finalUrl: currentUrl };
  }

  throw new Error("The page redirected too many times.");
}

export async function POST(req: Request) {
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

    const { html, finalUrl } = await fetchPublicPage(requestedUrl);
    const completeText = (
      finalUrl.pathname.endsWith(".txt")
        ? html
        : stripHtmlToReadableText(html)
    );
    const extractedText = completeText.slice(0, MAX_EXTRACTED_CHARACTERS);

    if (extractedText.length < 80) {
      throw new Error(
        "Gravitas could not find enough readable page content. The page may require a login or browser scripting."
      );
    }

    const title =
      extractHtmlTitle(html) ||
      finalUrl.hostname.replace(/^www\./, "") ||
      "Imported webpage";

    const source: UrlSource = {
      id: crypto.randomUUID(),
      type: "url",
      title,
      originalLocation: finalUrl.toString(),
      extractedText,
      wordCount: completeText.split(/\s+/).filter(Boolean).length,
      truncated: completeText.length > MAX_EXTRACTED_CHARACTERS,
    };

    return NextResponse.json({ source });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The webpage could not be imported.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
