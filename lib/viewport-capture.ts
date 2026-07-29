import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import sharp from "sharp";
import { captureFullPagePng } from "@/lib/screenshotone";
import {
  calculateViewportPositions,
  extractHtmlTitle,
  stripHtmlToReadableText,
  type SourceImage,
} from "@/lib/sources";

const VIEWPORT = { width: 1280, height: 800 };
const MAX_VIEWPORTS = 10;
const MAX_FULL_PAGE_BYTES = 30_000_000;
const MAX_FULL_PAGE_PIXELS = 80_000_000;
const MAX_TOTAL_SCREENSHOT_BYTES = 3_000_000;
const HTML_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5_000_000;
const MAX_HTML_REDIRECTS = 5;
const MAX_SUPPORTING_TEXT = 28_000;
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";

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
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) return true;
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

export async function validatePublicBrowserUrl(url: URL) {
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

async function fetchSupportingPage(initialUrl: URL) {
  let currentUrl = new URL(initialUrl.toString());

  for (let redirect = 0; redirect <= MAX_HTML_REDIRECTS; redirect += 1) {
    await validatePublicBrowserUrl(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(HTML_TIMEOUT_MS),
      headers: {
        "user-agent": DESKTOP_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-AU,en;q=0.9",
      },
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_HTML_REDIRECTS) {
        throw new Error("The page redirected too many times.");
      }
      currentUrl = new URL(location, currentUrl);
      continue;
    }
    if (!response.ok) {
      throw new Error(`The page returned HTTP ${response.status}.`);
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
      throw new Error("That address did not return a webpage.");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > MAX_HTML_BYTES) {
      throw new Error("The webpage is too large to read safely.");
    }

    const html = bytes.toString("utf8");
    const text = stripHtmlToReadableText(html);
    const title = extractHtmlTitle(html);
    if (
      /bot verification|verify (?:that )?you are not a robot|checking your browser|human verification/i.test(
        `${title}\n${text.slice(0, 1_000)}`
      )
    ) {
      throw new Error("The supporting text request returned bot verification.");
    }
    return {
      finalUrl: currentUrl,
      title,
      text,
    };
  }

  throw new Error("The page redirected too many times.");
}

async function sliceFullPageCapture(
  fullPagePng: Buffer,
  finalUrl: URL,
  requestId: string
) {
  if (fullPagePng.length === 0 || fullPagePng.length > MAX_FULL_PAGE_BYTES) {
    throw new Error("The webpage capture was empty or too large.");
  }

  const metadata = await sharp(fullPagePng, {
    limitInputPixels: MAX_FULL_PAGE_PIXELS,
  }).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (metadata.format !== "png" || width < 640 || height < 240) {
    throw new Error("The webpage capture did not contain a valid desktop page.");
  }

  const scaledViewportHeight = Math.max(
    1,
    Math.round((VIEWPORT.height * width) / VIEWPORT.width)
  );
  const positions = calculateViewportPositions(
    height,
    scaledViewportHeight,
    MAX_VIEWPORTS
  );
  const images: SourceImage[] = [];
  let totalBytes = 0;

  for (let index = 0; index < positions.length; index += 1) {
    const top = Math.min(positions[index], Math.max(0, height - 1));
    const sliceHeight = Math.min(scaledViewportHeight, height - top);
    const bytes = await sharp(fullPagePng, {
      limitInputPixels: MAX_FULL_PAGE_PIXELS,
    })
      .extract({ left: 0, top, width, height: sliceHeight })
      .jpeg({ quality: 72, mozjpeg: true })
      .toBuffer();

    if (totalBytes + bytes.length > MAX_TOTAL_SCREENSHOT_BYTES && images.length > 0) {
      break;
    }
    totalBytes += bytes.length;
    images.push({
      id: crypto.randomUUID(),
      type: "image",
      role: "viewport",
      title: `Viewport ${index + 1} of ${positions.length}`,
      originalLocation: finalUrl.toString(),
      dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
      altText: `Rendered webpage viewport ${index + 1} of ${positions.length}`,
      order: index,
    });
  }

  if (images.length === 0) {
    throw new Error("Gravitas could not create analysis viewports.");
  }

  console.info("Gravitas viewport slicing completed", {
    requestId,
    hostname: finalUrl.hostname,
    sourceWidth: width,
    sourceHeight: height,
    plannedViewports: positions.length,
    emittedViewports: images.length,
    emittedBytes: totalBytes,
  });

  return images.map((image, index) => ({
    ...image,
    title: `Viewport ${index + 1} of ${images.length}`,
    altText: `Rendered webpage viewport ${index + 1} of ${images.length}`,
  }));
}

export async function captureRenderedPage(initialUrl: URL) {
  const requestId = crypto.randomUUID();
  await validatePublicBrowserUrl(initialUrl);

  const supportingPagePromise = fetchSupportingPage(initialUrl).catch((error) => {
    console.warn("Supporting webpage text was unavailable", {
      requestId,
      hostname: initialUrl.hostname,
      error,
    });
    return undefined;
  });
  const capture = await captureFullPagePng(initialUrl, requestId);
  const supportingPage = await supportingPagePromise;
  const finalUrl = supportingPage?.finalUrl ?? initialUrl;
  await validatePublicBrowserUrl(finalUrl);

  const targetStatus = Number(capture.targetStatus);
  if (Number.isFinite(targetStatus) && targetStatus >= 400) {
    throw new Error(`The page returned HTTP ${targetStatus}.`);
  }

  const images = await sliceFullPageCapture(capture.bytes, finalUrl, requestId);
  const extractedText = supportingPage?.text ?? "";

  return {
    finalUrl,
    title: capture.pageTitle || supportingPage?.title || "",
    extractedText: extractedText.slice(0, MAX_SUPPORTING_TEXT),
    wordCount: extractedText.split(/\s+/).filter(Boolean).length,
    truncated: extractedText.length > MAX_SUPPORTING_TEXT,
    images,
  };
}
