import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import chromium from "@sparticuz/chromium";
import {
  chromium as playwrightChromium,
  type Browser,
  type Page,
  type Response,
} from "playwright-core";
import {
  getBrowserExecutablePath,
  isRetryableBrowserLaunchError,
  waitBeforeBrowserLaunchRetry,
} from "@/lib/browser-runtime";
import {
  calculateViewportPositions,
  type SourceImage,
} from "@/lib/sources";

const VIEWPORT = { width: 1280, height: 800 };
const MAX_VIEWPORTS = 10;
const MAX_TOTAL_SCREENSHOT_BYTES = 3_000_000;
const NAVIGATION_COMMIT_TIMEOUT_MS = 20_000;
const DOCUMENT_READY_TIMEOUT_MS = 12_000;

function publicUrlValidationCache() {
  const validations = new Map<string, Promise<void>>();

  return (url: URL) => {
    const key = `${url.protocol}//${url.hostname.toLowerCase()}`;
    const existing = validations.get(key);
    if (existing) return existing;

    const validation = validatePublicBrowserUrl(url).catch((error) => {
      validations.delete(key);
      throw error;
    });
    validations.set(key, validation);
    return validation;
  };
}

async function launchBrowser(): Promise<Browser> {
  const launch = async () =>
    playwrightChromium.launch({
      args: process.platform === "darwin" ? [] : chromium.args,
      executablePath: await getBrowserExecutablePath(),
      headless: true,
    });

  try {
    return await launch();
  } catch (error) {
    if (!isRetryableBrowserLaunchError(error)) throw error;
    console.warn("Retrying webpage renderer launch after a transient failure", {
      error,
    });
    await waitBeforeBrowserLaunchRetry();
    return launch();
  }
}

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

async function preparePage(page: Page) {
  await page.addStyleTag({
    content: `
      html { scroll-behavior: auto !important; }
      *, *::before, *::after { animation: none !important; transition: none !important; }
    `,
  });

  await page.evaluate(async () => {
    const distance = Math.max(400, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y < document.documentElement.scrollHeight; y += distance) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(300);
}

async function suppressRepeatedStickyElements(page: Page) {
  await page.evaluate(() => {
    for (const element of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        (style.position === "fixed" || style.position === "sticky") &&
        rect.height > 0 &&
        rect.height < window.innerHeight * 0.4
      ) {
        element.dataset.gravitasRepeatedChrome = "true";
        element.style.setProperty("visibility", "hidden", "important");
      }
    }
  });
}

export async function captureRenderedPage(initialUrl: URL) {
  await validatePublicBrowserUrl(initialUrl);

  const browser = await launchBrowser();

  try {
    const page = await browser.newPage({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
    });
    const validateRequestUrl = publicUrlValidationCache();

    await page.route("**/*", async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      if (!["http:", "https:"].includes(requestUrl.protocol)) {
        await route.continue();
        return;
      }
      if (request.resourceType() === "media" || request.resourceType() === "font") {
        await route.abort("blockedbyclient");
        return;
      }
      try {
        await validateRequestUrl(requestUrl);
        await route.continue();
      } catch {
        await route.abort("blockedbyclient");
      }
    });

    let response: Response | null = null;
    try {
      response = await page.goto(initialUrl.toString(), {
        waitUntil: "commit",
        timeout: NAVIGATION_COMMIT_TIMEOUT_MS,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        /(?:timeout|ERR_TIMED_OUT)/i.test(error.message);
      if (!timedOut || page.url() === "about:blank") throw error;
    }
    await page.waitForSelector("body", {
      state: "attached",
      timeout: DOCUMENT_READY_TIMEOUT_MS,
    });
    await page.waitForFunction(
      () =>
        document.readyState === "interactive" ||
        document.readyState === "complete" ||
        Boolean(document.body?.children.length),
      undefined,
      { timeout: DOCUMENT_READY_TIMEOUT_MS }
    );
    if (response && !response.ok()) {
      throw new Error(`The page returned HTTP ${response.status()}.`);
    }
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    await preparePage(page);

    const finalUrl = new URL(page.url());
    await validatePublicBrowserUrl(finalUrl);

    const pageDetails = await page.evaluate(() => ({
      title: document.title.trim(),
      text: document.body?.innerText?.trim() ?? "",
      height: Math.max(
        document.body?.scrollHeight ?? 0,
        document.documentElement.scrollHeight
      ),
    }));

    const positions = calculateViewportPositions(
      pageDetails.height,
      VIEWPORT.height,
      MAX_VIEWPORTS
    );
    const images: SourceImage[] = [];
    let totalBytes = 0;

    for (let index = 0; index < positions.length; index += 1) {
      await page.evaluate((y) => window.scrollTo(0, y), positions[index]);
      await page.waitForTimeout(160);
      const bytes = await page.screenshot({
        type: "jpeg",
        quality: 62,
        fullPage: false,
      });
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
      if (index === 0 && positions.length > 1) {
        await suppressRepeatedStickyElements(page);
      }
    }

    if (images.length === 0) {
      throw new Error("Gravitas could not capture the rendered page.");
    }

    return {
      finalUrl,
      title: pageDetails.title,
      extractedText: pageDetails.text.slice(0, 28_000),
      wordCount: pageDetails.text.split(/\s+/).filter(Boolean).length,
      truncated: pageDetails.text.length > 28_000,
      images: images.map((image, index) => ({
        ...image,
        title: `Viewport ${index + 1} of ${images.length}`,
        altText: `Rendered webpage viewport ${index + 1} of ${images.length}`,
      })),
    };
  } finally {
    await browser.close();
  }
}
