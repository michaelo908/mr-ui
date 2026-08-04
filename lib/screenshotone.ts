const SCREENSHOTONE_ENDPOINT = "https://api.screenshotone.com/take";
const MAX_CAPTURE_ATTEMPTS = 2;
const RETRY_DELAY_MS = 400;

export const SCREENSHOTONE_CAPTURE_OPTIONS = {
  format: "png",
  full_page: true,
  full_page_algorithm: "by_sections",
  full_page_scroll: true,
  full_page_scroll_by: 800,
  full_page_scroll_delay: 100,
  viewport_width: 1280,
  viewport_height: 800,
  device_scale_factor: 1,
  reduced_motion: true,
  delay: 1,
  timeout: 38,
  navigation_timeout: 20,
  block_ads: true,
  block_trackers: true,
  block_cookie_banners: true,
  block_chats: true,
  metadata_http_response_status_code: true,
  metadata_page_title: true,
} as const;

type ScreenshotOneErrorPayload = {
  error?: {
    code?: string;
    message?: string;
  };
};

export class ScreenshotOneCaptureError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "ScreenshotOneCaptureError";
  }
}

export function buildScreenshotOneRequest(url: URL, maxHeight: number) {
  return {
    ...SCREENSHOTONE_CAPTURE_OPTIONS,
    full_page_max_height: maxHeight,
    url: url.toString(),
  };
}

function safeHeader(response: Response, name: string) {
  const value = response.headers.get(name);
  return value?.trim() || undefined;
}

function decodeMetadataHeader(value: string | undefined) {
  if (!value || !/%[\da-f]{2}/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function readProviderError(response: Response) {
  try {
    const payload = (await response.json()) as ScreenshotOneErrorPayload;
    return {
      code: payload.error?.code || "provider_error",
      message: payload.error?.message || "ScreenshotOne could not capture the page.",
    };
  } catch {
    return {
      code: "provider_error",
      message: "ScreenshotOne could not capture the page.",
    };
  }
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function captureFullPagePng(
  url: URL,
  requestId: string,
  maxHeight: number
) {
  const accessKey = process.env.SCREENSHOTONE_ACCESS_KEY?.trim();
  if (!accessKey) {
    throw new ScreenshotOneCaptureError(
      "ScreenshotOne is not configured.",
      "missing_access_key"
    );
  }

  const startedAt = Date.now();
  console.info("ScreenshotOne capture started", {
    requestId,
    hostname: url.hostname,
    viewport: `${SCREENSHOTONE_CAPTURE_OPTIONS.viewport_width}x${SCREENSHOTONE_CAPTURE_OPTIONS.viewport_height}`,
  });

  let response: Response | undefined;
  let requestFailure: unknown;
  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
    const attemptStartedAt = Date.now();
    try {
      response = await fetch(SCREENSHOTONE_ENDPOINT, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-access-key": accessKey,
        },
        body: JSON.stringify(buildScreenshotOneRequest(url, maxHeight)),
        signal: AbortSignal.timeout(
          (SCREENSHOTONE_CAPTURE_OPTIONS.timeout + 2) * 1_000
        ),
        cache: "no-store",
      });
      if (response.status < 500 || attempt === MAX_CAPTURE_ATTEMPTS) break;
      console.warn("Retrying ScreenshotOne after a provider failure", {
        requestId,
        hostname: url.hostname,
        attempt,
        status: response.status,
      });
    } catch (error) {
      requestFailure = error;
      const attemptDurationMs = Date.now() - attemptStartedAt;
      if (attempt === MAX_CAPTURE_ATTEMPTS || attemptDurationMs >= 10_000) {
        break;
      }
      console.warn("Retrying ScreenshotOne after a request failure", {
        requestId,
        hostname: url.hostname,
        attempt,
        attemptDurationMs,
      });
    }
    await wait(RETRY_DELAY_MS);
  }

  if (!response) {
    console.error("ScreenshotOne capture request failed", {
      requestId,
      hostname: url.hostname,
      durationMs: Date.now() - startedAt,
      error: requestFailure,
    });
    throw new ScreenshotOneCaptureError(
      "The webpage capture service did not respond.",
      "request_failed"
    );
  }

  if (!response.ok) {
    const providerError = await readProviderError(response);
    console.warn("ScreenshotOne capture rejected", {
      requestId,
      hostname: url.hostname,
      durationMs: Date.now() - startedAt,
      status: response.status,
      providerCode: providerError.code,
    });
    throw new ScreenshotOneCaptureError(
      providerError.message,
      providerError.code,
      response.status
    );
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("image/png")) {
    console.warn("ScreenshotOne returned an unexpected response", {
      requestId,
      hostname: url.hostname,
      durationMs: Date.now() - startedAt,
      contentType,
    });
    throw new ScreenshotOneCaptureError(
      "The webpage capture service returned an invalid image.",
      "invalid_content_type"
    );
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  console.info("ScreenshotOne capture completed", {
    requestId,
    hostname: url.hostname,
    durationMs: Date.now() - startedAt,
    bytes: bytes.length,
    targetStatus: safeHeader(
      response,
      "x-screenshotone-http-response-status-code"
    ),
  });

  return {
    bytes,
    pageTitle: decodeMetadataHeader(
      safeHeader(response, "x-screenshotone-page-title")
    ),
    targetStatus: safeHeader(
      response,
      "x-screenshotone-http-response-status-code"
    ),
  };
}
