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
  haveStrictlyProgressingOffsets,
  isNearDuplicateViewport,
  type SourceImage,
} from "@/lib/sources";

const VIEWPORT = { width: 1280, height: 800 };
const MAX_VIEWPORTS = 10;
const MAX_TOTAL_SCREENSHOT_BYTES = 3_000_000;
const NAVIGATION_COMMIT_TIMEOUT_MS = 20_000;
const DOCUMENT_READY_TIMEOUT_MS = 12_000;
const HTML_FALLBACK_TIMEOUT_MS = 15_000;
const MAX_HTML_BYTES = 5_000_000;
const MAX_HTML_REDIRECTS = 5;
const DESKTOP_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36";
const SCROLL_CONTAINER_ATTRIBUTE = "data-gravitas-scroll-container";

type ScrollSurface = {
  kind: "window" | "element";
  viewportHeight: number;
  scrollHeight: number;
  maxScroll: number;
};

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

function addDocumentBase(html: string, url: URL) {
  const base = `<base href="${url.toString().replaceAll('"', "&quot;")}">`;
  if (/<head(?:\s[^>]*)?>/i.test(html)) {
    return html.replace(/<head(?:\s[^>]*)?>/i, (head) => `${head}${base}`);
  }
  return `${base}${html}`;
}

async function fetchPublicHtml(initialUrl: URL) {
  let currentUrl = new URL(initialUrl.toString());

  for (let redirect = 0; redirect <= MAX_HTML_REDIRECTS; redirect += 1) {
    await validatePublicBrowserUrl(currentUrl);
    const response = await fetch(currentUrl, {
      redirect: "manual",
      signal: AbortSignal.timeout(HTML_FALLBACK_TIMEOUT_MS),
      headers: {
        "user-agent": DESKTOP_USER_AGENT,
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-AU,en;q=0.9",
      },
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirect === MAX_HTML_REDIRECTS) {
        throw new Error("The page redirected too many times.");
      }
      const nextUrl = new URL(location, currentUrl);
      console.warn("Fetched webpage redirected", {
        from: currentUrl.toString(),
        to: nextUrl.toString(),
        status: response.status,
      });
      currentUrl = nextUrl;
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
      throw new Error("The webpage is too large to render safely.");
    }

    return {
      finalUrl: currentUrl,
      html: addDocumentBase(bytes.toString("utf8"), currentUrl),
    };
  }

  throw new Error("The page redirected too many times.");
}

async function preparePage(page: Page) {
  await page.addStyleTag({
    content: `
      html, body {
        scroll-behavior: auto !important;
        overflow-y: auto !important;
      }
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }
    `,
  });

  await page.evaluate(() => {
    const body = document.body;
    const renderedContentBottom = body
      ? Array.from(body.querySelectorAll<HTMLElement>("main, section, footer, article"))
          .reduce(
            (maximum, element) =>
              Math.max(maximum, element.getBoundingClientRect().bottom),
            0
          )
      : 0;
    if (
      body &&
      window.getComputedStyle(body).position === "fixed" &&
      Math.max(body.scrollHeight, renderedContentBottom) >
        window.innerHeight * 1.5
    ) {
      body.style.setProperty("position", "static", "important");
      body.style.setProperty("inset", "auto", "important");
      body.style.setProperty("width", "auto", "important");
    }
    for (const animation of document.getAnimations()) {
      animation.pause();
      try {
        animation.currentTime = 0;
      } catch {
        // Some browser-owned animations do not expose a writable timeline.
      }
    }
    for (const media of Array.from(document.querySelectorAll("video, audio"))) {
      (media as HTMLMediaElement).pause();
    }
  });
  await page.waitForTimeout(150);
}

async function findScrollSurface(page: Page): Promise<ScrollSurface> {
  return page.evaluate((attribute) => {
    document
      .querySelectorAll(`[${attribute}]`)
      .forEach((element) => element.removeAttribute(attribute));

    const root = document.scrollingElement ?? document.documentElement;
    const rootRange = Math.max(0, root.scrollHeight - window.innerHeight);
    const candidates = [
      document.body,
      ...Array.from(document.querySelectorAll<HTMLElement>("body *")),
    ]
      .map((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const range = element.scrollHeight - element.clientHeight;
        const scrollableOverflow = /^(?:auto|scroll|overlay)$/.test(style.overflowY);
        const visible =
          rect.width >= window.innerWidth * 0.55 &&
          rect.height >= window.innerHeight * 0.45;
        if (range < 200 || !scrollableOverflow || !visible) return null;
        const coverage =
          Math.min(1, rect.width / window.innerWidth) *
          Math.min(1, rect.height / window.innerHeight);
        return { element, range, score: range * coverage };
      })
      .filter(
        (
          candidate
        ): candidate is {
          element: HTMLElement;
          range: number;
          score: number;
        } => Boolean(candidate)
      )
      .sort((left, right) => right.score - left.score);

    const nested = candidates[0];
    if (nested && nested.score > rootRange * 1.15) {
      nested.element.setAttribute(attribute, "true");
      return {
        kind: "element" as const,
        viewportHeight: nested.element.clientHeight,
        scrollHeight: nested.element.scrollHeight,
        maxScroll: nested.element.scrollHeight - nested.element.clientHeight,
      };
    }

    return {
      kind: "window" as const,
      viewportHeight: window.innerHeight,
      scrollHeight: root.scrollHeight,
      maxScroll: rootRange,
    };
  }, SCROLL_CONTAINER_ATTRIBUTE);
}

async function scrollSurfaceTo(
  page: Page,
  surface: ScrollSurface,
  requestedOffset: number
) {
  return page.evaluate(
    ({ attribute, kind, requested }) => {
      const target =
        kind === "element"
          ? document.querySelector<HTMLElement>(`[${attribute}]`)
          : null;
      if (kind === "element" && !target) {
        return { actual: -1, maxScroll: -1 };
      }
      if (target) {
        target.scrollTop = requested;
        return {
          actual: target.scrollTop,
          maxScroll: Math.max(0, target.scrollHeight - target.clientHeight),
        };
      }
      window.scrollTo(0, requested);
      const root = document.scrollingElement ?? document.documentElement;
      return {
        actual: window.scrollY,
        maxScroll: Math.max(0, root.scrollHeight - window.innerHeight),
      };
    },
    {
      attribute: SCROLL_CONTAINER_ATTRIBUTE,
      kind: surface.kind,
      requested: requestedOffset,
    }
  );
}

async function warmLazyContent(page: Page, surface: ScrollSurface) {
  const distance = Math.max(400, Math.floor(surface.viewportHeight * 0.8));
  for (let offset = 0; offset <= surface.maxScroll; offset += distance) {
    await scrollSurfaceTo(page, surface, offset);
    await page.waitForTimeout(70);
  }
  await scrollSurfaceTo(page, surface, 0);
  await page.waitForTimeout(180);
}

async function getViewportSignature(page: Page) {
  return page.evaluate(() => {
    return Array.from(
      document.querySelectorAll<HTMLElement>(
        "h1, h2, h3, h4, p, li, button, a, img, video, input, textarea"
      )
    )
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = window.getComputedStyle(element);
        if (
          rect.bottom <= 0 ||
          rect.top >= window.innerHeight ||
          rect.right <= 0 ||
          rect.left >= window.innerWidth ||
          rect.width < 8 ||
          rect.height < 8 ||
          style.visibility === "hidden" ||
          style.display === "none" ||
          Number(style.opacity) === 0
        ) {
          return null;
        }
        const text = (element.textContent ?? "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        const imageIdentity =
          element.tagName === "IMG"
          ? (
              (element as HTMLImageElement).currentSrc ||
              (element as HTMLImageElement).src
            )
              .split("?")[0]
              .slice(-100)
          : "";
        if (!text && !imageIdentity) return null;
        return {
          top: Math.max(0, Math.round(rect.top / 20)),
          left: Math.max(0, Math.round(rect.left / 20)),
          token: [
            element.tagName,
            text,
            imageIdentity,
          ].join("|"),
        };
      })
      .filter(
        (
          item
        ): item is {
          top: number;
          left: number;
          token: string;
        } => Boolean(item)
      )
      .sort((left, right) => left.top - right.top || left.left - right.left)
      .map((item) => item.token)
      .slice(0, 36);
  });
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
      userAgent: DESKTOP_USER_AGENT,
      locale: "en-AU",
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
    let renderedUrl = initialUrl;
    let usedHtmlFallback = false;
    try {
      response = await page.goto(initialUrl.toString(), {
        waitUntil: "commit",
        timeout: NAVIGATION_COMMIT_TIMEOUT_MS,
      });
    } catch (error) {
      const timedOut =
        error instanceof Error &&
        /(?:timeout|ERR_TIMED_OUT)/i.test(error.message);
      if (!timedOut) throw error;
      if (page.url() === "about:blank") {
        await page.evaluate(() => window.stop()).catch(() => undefined);
        console.warn("Browser navigation did not commit; rendering fetched HTML instead", {
          url: initialUrl.toString(),
          error,
        });
        const fallback = await fetchPublicHtml(initialUrl);
        renderedUrl = fallback.finalUrl;
        usedHtmlFallback = true;
        await page.setContent(fallback.html, {
          waitUntil: "domcontentloaded",
          timeout: DOCUMENT_READY_TIMEOUT_MS,
        }).catch((setContentError) => {
          console.warn("Fetched HTML reached its readiness timeout", {
            url: renderedUrl.toString(),
            error: setContentError,
          });
        });
      }
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
    let scrollSurface = await findScrollSurface(page);
    await warmLazyContent(page, scrollSurface);
    scrollSurface = await findScrollSurface(page);

    const finalUrl = usedHtmlFallback ? renderedUrl : new URL(page.url());
    await validatePublicBrowserUrl(finalUrl);

    const pageDetails = await page.evaluate(() => ({
      title: document.title.trim(),
      text: document.body?.innerText?.trim() ?? "",
    }));
    if (
      /bot verification|verify (?:that )?you are not a robot/i.test(
        `${pageDetails.title}\n${pageDetails.text.slice(0, 1_000)}`
      )
    ) {
      throw new Error(
        `The target host returned bot verification instead of page content: ${finalUrl.hostname}.`
      );
    }

    const positions = calculateViewportPositions(
      scrollSurface.scrollHeight,
      scrollSurface.viewportHeight,
      MAX_VIEWPORTS
    );
    const images: SourceImage[] = [];
    const acceptedSignatures: string[][] = [];
    const actualOffsets: number[] = [];
    let totalBytes = 0;

    for (let index = 0; index < positions.length; index += 1) {
      await scrollSurfaceTo(page, scrollSurface, positions[index]);
      await page.waitForTimeout(220);
      const confirmed = await scrollSurfaceTo(page, scrollSurface, positions[index]);
      const actual = confirmed.actual;
      if (actual < 0) {
        throw new Error("The webpage scroll container became unavailable.");
      }
      if (
        actualOffsets.length > 0 &&
        actual <= actualOffsets[actualOffsets.length - 1] + 39
      ) {
        if (index === positions.length - 1) {
          throw new Error("The webpage could not advance to its ending viewport.");
        }
        continue;
      }
      actualOffsets.push(actual);
      const signature = await getViewportSignature(page);
      const isExit = index === positions.length - 1;
      if (
        !isExit &&
        images.length > 0 &&
        isNearDuplicateViewport(signature, acceptedSignatures)
      ) {
        continue;
      }
      const bytes = await page.screenshot({
        type: "jpeg",
        quality: 62,
        fullPage: false,
      });
      if (totalBytes + bytes.length > MAX_TOTAL_SCREENSHOT_BYTES && images.length > 0) {
        break;
      }
      totalBytes += bytes.length;
      acceptedSignatures.push(signature);
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
    if (
      positions.length > 1 &&
      (!haveStrictlyProgressingOffsets(actualOffsets) ||
        actualOffsets[0] !== 0 ||
        actualOffsets.at(-1)! < scrollSurface.maxScroll - 40)
    ) {
      throw new Error(
        "The webpage did not expose a reliable top-to-bottom scroll journey."
      );
    }
    if (positions.length > 2 && images.length < 3) {
      throw new Error(
        `The webpage produced too few distinct viewports for a reliable journey ` +
          `(positions=${positions.length}, accepted=${images.length}, ` +
          `offsets=${actualOffsets.join(",")}).`
      );
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
