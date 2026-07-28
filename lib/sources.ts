export type SourceType = "text" | "url" | "image" | "pdf" | "document";

export type SourceIdentity = {
  id: string;
  type: SourceType;
  title: string;
  originalLocation?: string;
};

export type UrlSource = SourceIdentity & {
  type: "url";
  extractedText: string;
  wordCount: number;
  truncated: boolean;
};

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
