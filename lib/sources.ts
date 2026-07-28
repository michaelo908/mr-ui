export type SourceType = "text" | "url" | "image" | "pdf" | "document";

export type SourceIdentity = {
  id: string;
  type: SourceType;
  title: string;
  originalLocation?: string;
};

export type SourceImage = {
  id: string;
  type: "image";
  title: string;
  originalLocation?: string;
  dataUrl: string;
  altText?: string;
  order: number;
};

export type UrlSource = SourceIdentity & {
  type: "url";
  extractedText: string;
  wordCount: number;
  truncated: boolean;
  images: SourceImage[];
};

export type HtmlImageCandidate = {
  url: string;
  altText?: string;
  order: number;
};

const UNSUITABLE_IMAGE_HINT =
  /(?:^|[\/_.-])(avatar|badge|favicon|icon|logo|pixel|spinner|sprite|tracking)(?:[\/_.-]|$)/i;

export function extractHtmlImageCandidates(
  html: string,
  pageUrl: string,
  limit = 30
): HtmlImageCandidate[] {
  const candidates: HtmlImageCandidate[] = [];
  const seen = new Set<string>();
  const imgPattern = /<img\b([^>]*)>/gi;
  let match: RegExpExecArray | null;
  let order = 0;

  while ((match = imgPattern.exec(html)) && candidates.length < limit) {
    const attributes = match[1] ?? "";
    const width = numericAttribute(attributes, "width");
    const height = numericAttribute(attributes, "height");
    if ((width !== null && width < 48) || (height !== null && height < 48)) {
      continue;
    }

    const ordinarySource = stringAttribute(attributes, "src");
    const rawSource =
      (ordinarySource &&
      !ordinarySource.startsWith("data:") &&
      !ordinarySource.startsWith("blob:")
        ? ordinarySource
        : "") ||
      stringAttribute(attributes, "data-src") ||
      firstSrcsetUrl(stringAttribute(attributes, "srcset"));
    if (!rawSource || rawSource.startsWith("data:") || rawSource.startsWith("blob:")) {
      continue;
    }

    let resolved: URL;
    try {
      resolved = new URL(rawSource, pageUrl);
    } catch {
      continue;
    }
    if (!["http:", "https:"].includes(resolved.protocol)) continue;

    const normalized = resolved.toString();
    if (UNSUITABLE_IMAGE_HINT.test(resolved.pathname) || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    candidates.push({
      url: normalized,
      altText: cleanAttributeText(stringAttribute(attributes, "alt")),
      order,
    });
    order += 1;
  }

  return candidates;
}

export function stripHtmlToReadableText(html: string) {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template)[^>]*>[\s\S]*?<\/\1>/gi, " ");

  const preferred =
    withoutNoise.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    withoutNoise.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    withoutNoise.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] ??
    withoutNoise;

  return decodeHtmlEntities(
    preferred
      .replace(/<(br|hr)\b[^>]*>/gi, "\n")
      .replace(/<\/(p|div|section|article|main|li|h[1-6]|blockquote)>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractHtmlTitle(html: string) {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  return decodeHtmlEntities(title.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(
    /&(#x[\da-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code[0] === "#") {
        const numeric =
          code[1]?.toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
      }
      return named[code.toLowerCase()] ?? entity;
    }
  );
}

function stringAttribute(attributes: string, name: string) {
  const quoted = attributes.match(
    new RegExp(`(?:^|\\s)${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i")
  )?.[2];
  if (quoted !== undefined) return decodeHtmlEntities(quoted).trim();

  return (
    attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*([^\\s"'=<>]+)`, "i"))?.[1] ??
    ""
  ).trim();
}

function numericAttribute(attributes: string, name: string) {
  const value = stringAttribute(attributes, name);
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function firstSrcsetUrl(srcset: string) {
  return srcset
    .split(",")
    .map((entry) => entry.trim().split(/\s+/)[0])
    .find(Boolean) ?? "";
}

function cleanAttributeText(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned || undefined;
}
