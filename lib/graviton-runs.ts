export type ActiveSource =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | {
      type: "images";
      images: Array<{ name: string; size: number; lastModified: number }>;
    };

export function isValidPublicHttpUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      Boolean(url.hostname)
    );
  } catch {
    return false;
  }
}

export function hasReadySource(source: ActiveSource): boolean {
  if (source.type === "url") return isValidPublicHttpUrl(source.url);
  if (source.type === "images") return source.images.length > 0;
  return source.text.trim().length > 0;
}

export function getActiveSourceKey(source: ActiveSource): string {
  if (source.type === "url") {
    return `url:${source.url.trim()}`;
  }

  if (source.type === "images") {
    return `images:${source.images
      .map((image) => `${image.name}:${image.size}:${image.lastModified}`)
      .join("|")}`;
  }

  return `text:${source.text}`;
}

export function getAnalysisRunKey(
  sourceKey: string,
  graviton: string
): string {
  return JSON.stringify([sourceKey, graviton]);
}

export function hasCompletedAnalysis(
  completedRuns: ReadonlySet<string>,
  sourceKey: string,
  graviton: string
): boolean {
  return completedRuns.has(getAnalysisRunKey(sourceKey, graviton));
}
