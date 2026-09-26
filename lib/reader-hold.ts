export const READER_RESPONSE_DIMENSIONS = [
  "Strong",
  "Engaged",
  "Uneven",
  "Vulnerable",
  "At risk",
] as const;

export type ReaderResponseDimension =
  (typeof READER_RESPONSE_DIMENSIONS)[number];

export const READER_RESPONSE_INTENSITIES = [
  "none",
  "trace",
  "present",
  "pronounced",
  "dominant",
] as const;

export type ReaderResponseIntensity =
  (typeof READER_RESPONSE_INTENSITIES)[number];

export type ReaderResponse = {
  signals: Record<ReaderResponseDimension, ReaderResponseIntensity>;
  verdict: string;
};

const DIMENSION_BY_NORMALIZED_VALUE = new Map<string, ReaderResponseDimension>(
  READER_RESPONSE_DIMENSIONS.map((dimension) => [
    dimension.toLowerCase(),
    dimension,
  ])
);

const INTENSITY_BY_NORMALIZED_VALUE = new Map<string, ReaderResponseIntensity>(
  READER_RESPONSE_INTENSITIES.map((intensity) => [intensity, intensity])
);

function cleanValue(value: string) {
  return value
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/^[-–—:\s]+/, "")
    .trim();
}

/**
 * This is a qualitative evidence profile, not a score, percentage, or forecast.
 * Signals are deliberately independent: identified strengths never cancel an
 * identified reader risk.
 */
export function parseReaderResponse(content: string): ReaderResponse | null {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const signals = Object.fromEntries(
    READER_RESPONSE_DIMENSIONS.map((dimension) => [dimension, "none"])
  ) as Record<ReaderResponseDimension, ReaderResponseIntensity>;
  let hasSignal = false;
  let verdict = "";

  for (const line of lines) {
    const match = line.match(/^\*{0,2}([^:]+?)\s*:\*{0,2}\s*(.+)$/i);
    if (!match) continue;

    const label = cleanValue(match[1]).toLowerCase();
    const value = cleanValue(match[2]);
    const dimension = DIMENSION_BY_NORMALIZED_VALUE.get(label);
    if (dimension) {
      const intensity = INTENSITY_BY_NORMALIZED_VALUE.get(value.toLowerCase());
      if (intensity) {
        signals[dimension] = intensity;
        hasSignal = true;
      }
      continue;
    }

    if ((label === "verdict" || label === "why") && !verdict) {
      verdict = value;
    }
  }

  return hasSignal && verdict ? { signals, verdict } : null;
}

// Keep existing stored reports readable while new analyses use Reader Response.
export function parseLegacyReaderHold(content: string): ReaderResponse | null {
  const statusMatch = content.match(
    /^\*{0,2}(?:status|reader hold)\s*:\*{0,2}\s*(.+)$/im
  );
  const verdictMatch = content.match(/^\*{0,2}(?:verdict|why)\s*:\*{0,2}\s*(.+)$/im);
  if (!statusMatch || !verdictMatch) return null;

  const status = cleanValue(statusMatch[1]).toLowerCase();
  const verdict = cleanValue(verdictMatch[1]);
  const signals = Object.fromEntries(
    READER_RESPONSE_DIMENSIONS.map((dimension) => [dimension, "none"])
  ) as Record<ReaderResponseDimension, ReaderResponseIntensity>;

  if (status === "strong hold") signals.Strong = "dominant";
  if (status === "holding") signals.Engaged = "dominant";
  if (status === "uneven") signals.Uneven = "dominant";
  if (status === "vulnerable") signals.Vulnerable = "dominant";
  if (status === "at risk") signals["At risk"] = "dominant";

  return verdict && Object.values(signals).some((value) => value !== "none")
    ? { signals, verdict }
    : null;
}
