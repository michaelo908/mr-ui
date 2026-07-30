export const NARRATIVE_PERFORMANCE_OBSERVATIONS = [
  "Decision Readiness",
  "Effective Narrative Length",
  "Primary Narrative Drag",
  "Recommended Structure",
] as const;

export type NarrativePerformanceObservationLabel =
  (typeof NARRATIVE_PERFORMANCE_OBSERVATIONS)[number];

export const NARRATIVE_PERFORMANCE_ACTIONS = [
  "Protect",
  "Consolidate",
  "Reduce",
  "Introduce",
] as const;

export type NarrativePerformanceAction =
  (typeof NARRATIVE_PERFORMANCE_ACTIONS)[number];

export type NarrativePerformanceObservation = {
  label: NarrativePerformanceObservationLabel;
  value: string;
};

export type NarrativePerformanceRecommendation = {
  action: NarrativePerformanceAction;
  body: string;
};

export type NarrativePerformanceLightboxContext = {
  action: NarrativePerformanceAction;
  color: string;
  emoji: string;
  recommendation: string;
  viewportNumbers: number[];
};

export type NarrativePerformanceViewportLaunch = {
  startingViewport: number;
  context: NarrativePerformanceLightboxContext;
};

export type NarrativePerformance = {
  observations: NarrativePerformanceObservation[];
  recommendations: NarrativePerformanceRecommendation[];
};

const OBSERVATION_LABELS = new Map(
  NARRATIVE_PERFORMANCE_OBSERVATIONS.map((label) => [
    label.toLowerCase(),
    label,
  ])
);

const ACTIONS = new Map(
  NARRATIVE_PERFORMANCE_ACTIONS.map((action) => [action.toLowerCase(), action])
);

function stripListMarker(line: string) {
  return line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim();
}

function stripEmphasis(value: string) {
  return value.replace(/^\*\*(.*?)\*\*$/, "$1").trim();
}

function hasConditionEffectAndAction(body: string) {
  const sentences = body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length >= 3;
}

export function parseNarrativePerformance(
  content: string
): NarrativePerformance | null {
  const observations: NarrativePerformanceObservation[] = [];
  const recommendations: NarrativePerformanceRecommendation[] = [];
  const seenObservations = new Set<NarrativePerformanceObservationLabel>();

  for (const rawLine of content.split(/\r?\n/)) {
    const line = stripListMarker(rawLine);
    if (!line) continue;

    const normalizedObservationLine = line.replace(
      /^\*\*([^*:]+):\*\*\s*/,
      "$1: "
    );
    const observationMatch = normalizedObservationLine.match(
      /^([^:*]+)\s*:\s*(.+)$/
    );
    if (observationMatch) {
      const rawLabel = stripEmphasis(observationMatch[1]).toLowerCase();
      const label = OBSERVATION_LABELS.get(rawLabel);
      const value = observationMatch[2].trim();
      if (label && value && !seenObservations.has(label)) {
        observations.push({ label, value });
        seenObservations.add(label);
        continue;
      }
    }

    const recommendationMatch = line.match(
      /^(?:🟢|🟡|🔴|🔵)\s*(?:\*\*)?(Protect|Consolidate|Reduce|Introduce)(?:\*\*)?\s*[—–-]\s*(.+)$/i
    );
    if (!recommendationMatch || recommendations.length >= 5) continue;

    const action = ACTIONS.get(recommendationMatch[1].toLowerCase());
    const body = recommendationMatch[2].trim();
    if (action && body && hasConditionEffectAndAction(body)) {
      recommendations.push({ action, body });
    }
  }

  if (observations.length === 0 && recommendations.length === 0) return null;
  return { observations, recommendations };
}

export type ViewportReferenceToken =
  | { type: "text"; text: string }
  | {
      type: "reference";
      text: string;
      viewportNumbers: number[];
      startingViewport: number;
    };

function expandViewportReference(value: string) {
  const rangeMatch = value.match(
    /^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/i
  );
  if (!rangeMatch) {
    const viewportNumber = Number(value);
    return Number.isSafeInteger(viewportNumber) && viewportNumber > 0
      ? [viewportNumber]
      : [];
  }

  const start = Number(rangeMatch[1]);
  const end = Number(rangeMatch[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end - start > 15
  ) {
    return [];
  }

  return Array.from(
    { length: end - start + 1 },
    (_, index) => start + index
  );
}

export function parseViewportReferenceTokens(
  value: string
): ViewportReferenceToken[] {
  const tokens: ViewportReferenceToken[] = [];
  const phrasePattern =
    /\bViewports?\s+\d+(?:\s*(?:[-–—]|to)\s*\d+)?(?:\s*,\s*(?:and\s+)?\d+(?:\s*(?:[-–—]|to)\s*\d+)?|\s+(?:and|&)\s+\d+(?:\s*(?:[-–—]|to)\s*\d+)?)*/gi;
  let cursor = 0;

  for (const phraseMatch of value.matchAll(phrasePattern)) {
    const phraseIndex = phraseMatch.index ?? 0;
    if (phraseIndex > cursor) {
      tokens.push({ type: "text", text: value.slice(cursor, phraseIndex) });
    }

    const phrase = phraseMatch[0];
    const prefixMatch = phrase.match(/^Viewports?\s+/i);
    const prefixLength = prefixMatch?.[0].length ?? 0;
    if (prefixLength > 0) {
      tokens.push({ type: "text", text: phrase.slice(0, prefixLength) });
    }

    const expression = phrase.slice(prefixLength);
    const itemPattern = /\d+(?:\s*(?:[-–—]|to)\s*\d+)?/gi;
    let expressionCursor = 0;
    for (const itemMatch of expression.matchAll(itemPattern)) {
      const itemIndex = itemMatch.index ?? 0;
      if (itemIndex > expressionCursor) {
        tokens.push({
          type: "text",
          text: expression.slice(expressionCursor, itemIndex),
        });
      }
      const viewportNumbers = expandViewportReference(itemMatch[0]);
      if (viewportNumbers.length > 0) {
        tokens.push({
          type: "reference",
          text: itemMatch[0],
          viewportNumbers,
          startingViewport: viewportNumbers[0],
        });
      } else {
        tokens.push({ type: "text", text: itemMatch[0] });
      }
      expressionCursor = itemIndex + itemMatch[0].length;
    }
    if (expressionCursor < expression.length) {
      tokens.push({
        type: "text",
        text: expression.slice(expressionCursor),
      });
    }
    cursor = phraseIndex + phrase.length;
  }

  if (cursor < value.length) {
    tokens.push({ type: "text", text: value.slice(cursor) });
  }
  return tokens.length > 0 ? tokens : [{ type: "text", text: value }];
}

export function extractViewportNumbers(value: string): number[] {
  const numbers: number[] = [];
  for (const token of parseViewportReferenceTokens(value)) {
    if (token.type !== "reference") continue;
    for (const viewportNumber of token.viewportNumbers) {
      if (!numbers.includes(viewportNumber)) numbers.push(viewportNumber);
    }
  }
  return numbers;
}

export function getViewportImageByNumber<
  T extends { role?: string; order: number },
>(images: T[], viewportNumber: number): T | null {
  if (!Number.isSafeInteger(viewportNumber) || viewportNumber < 1) return null;
  const orderedViewports = images
    .filter((image) => image.role === "viewport")
    .sort((left, right) => left.order - right.order);
  return orderedViewports[viewportNumber - 1] ?? null;
}

export function buildRecommendationLightboxContext<
  T extends { role?: string; order: number },
>(
  recommendation: NarrativePerformanceRecommendation,
  images: T[]
): NarrativePerformanceLightboxContext {
  return {
    action: recommendation.action,
    color: actionColor(recommendation.action),
    emoji: actionEmoji(recommendation.action),
    recommendation: recommendation.body,
    viewportNumbers: extractViewportNumbers(recommendation.body).filter(
      (viewportNumber) =>
        getViewportImageByNumber(images, viewportNumber) !== null
    ),
  };
}

export function buildRecommendationViewportLaunch<
  T extends { role?: string; order: number },
>(
  recommendation: NarrativePerformanceRecommendation,
  images: T[],
  startingViewport: number
): NarrativePerformanceViewportLaunch | null {
  const context = buildRecommendationLightboxContext(recommendation, images);
  if (
    !context.viewportNumbers.includes(startingViewport) ||
    getViewportImageByNumber(images, startingViewport) === null
  ) {
    return null;
  }
  return { startingViewport, context };
}

export function actionEmoji(action: NarrativePerformanceAction) {
  if (action === "Protect") return "🟢";
  if (action === "Consolidate") return "🟡";
  if (action === "Reduce") return "🔴";
  return "🔵";
}

export function actionColor(action: NarrativePerformanceAction) {
  if (action === "Protect") return "#4ADE80";
  if (action === "Consolidate") return "#FACC15";
  if (action === "Reduce") return "#F87171";
  return "#60A5FA";
}
