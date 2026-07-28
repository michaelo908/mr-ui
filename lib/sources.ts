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
  role?: "uploaded-image" | "viewport";
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
  captureMode: "rendered-viewports";
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

export function calculateViewportPositions(
  documentHeight: number,
  viewportHeight: number,
  maxCaptures = 10
) {
  const height = Math.max(viewportHeight, Math.floor(documentHeight));
  const lastPosition = Math.max(0, height - viewportHeight);
  if (lastPosition === 0) return [0];

  const contiguous = Math.ceil(height / viewportHeight);
  if (contiguous <= maxCaptures) {
    const positions = Array.from(
      { length: contiguous },
      (_, index) => Math.min(index * viewportHeight, lastPosition)
    );
    positions[positions.length - 1] = lastPosition;
    return [...new Set(positions)];
  }

  return Array.from({ length: maxCaptures }, (_, index) =>
    Math.round((lastPosition * index) / (maxCaptures - 1))
  );
}

export function haveStrictlyProgressingOffsets(
  offsets: number[],
  minimumAdvance = 40
) {
  return offsets.every(
    (offset, index) =>
      index === 0 || offset - offsets[index - 1] >= minimumAdvance
  );
}

export function viewportSignatureSimilarity(
  left: string[],
  right: string[]
) {
  if (left.length === 0 || right.length === 0) return 0;
  const length = Math.min(left.length, right.length);
  let matches = 0;
  for (let index = 0; index < length; index += 1) {
    if (left[index] === right[index]) matches += 1;
  }
  return matches / Math.max(left.length, right.length);
}

export function isNearDuplicateViewport(
  candidate: string[],
  accepted: string[][],
  threshold = 0.86
) {
  return accepted.some(
    (signature) =>
      viewportSignatureSimilarity(candidate, signature) >= threshold
  );
}

export function buildRenderedUrlAnalysisInput(
  extractedText: string,
  selectedGraviton: string
) {
  const support = extractedText.trim();
  return `Analyse the ordered rendered webpage viewports using the selected Gravitas lens: ${selectedGraviton}.

The viewport screenshots are the sole primary evidence for the substantive analysis. Treat them as the visitor's ordered visual experience from the top of the page to the bottom.

${
  support
    ? `The following rendered-page text is supporting legibility assistance only. Use it solely to clarify wording that is visibly present but difficult to read in the supplied viewports. Do not use it to infer page structure, introduce navigation/footer/mechanical content, or make findings not grounded in the viewport sequence.

--- SUPPORTING READABILITY TEXT ---
${support}
--- END SUPPORTING READABILITY TEXT ---`
    : "No supporting text is available. Base the analysis entirely on the ordered viewport screenshots."
}`;
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
