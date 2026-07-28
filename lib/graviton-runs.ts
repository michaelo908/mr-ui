export type ActiveSource =
  | { type: "text"; text: string }
  | { type: "url"; url: string }
  | {
      type: "images";
      images: Array<{ name: string; size: number; lastModified: number }>;
    };

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
