export const READER_HOLD_LEVELS = [
  "Strong hold",
  "Holding",
  "Uneven",
  "Vulnerable",
  "At risk",
] as const;

export type ReaderHoldLevel = (typeof READER_HOLD_LEVELS)[number];

export type ReaderHold = {
  level: ReaderHoldLevel;
  verdict: string;
};

const LEVEL_BY_NORMALIZED_VALUE = new Map(
  READER_HOLD_LEVELS.map((level) => [level.toLowerCase(), level])
);

function cleanValue(value: string) {
  return value
    .replace(/^\*\*(.*?)\*\*$/, "$1")
    .replace(/^[-–—:\s]+/, "")
    .trim();
}

/**
 * Reader Hold is deliberately categorical, not a synthetic percentage or a
 * behavioural forecast. The model supplies a status and a short rationale;
 * the rest of the report supplies the evidence.
 */
export function parseReaderHold(content: string): ReaderHold | null {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  let level: ReaderHoldLevel | null = null;
  let verdict = "";

  for (const line of lines) {
    const match = line.match(/^\*{0,2}(?:status|reader hold)\s*:\*{0,2}\s*(.+)$/i);
    if (match) {
      const candidate = cleanValue(match[1]).toLowerCase();
      level = LEVEL_BY_NORMALIZED_VALUE.get(candidate) ?? null;
      continue;
    }

    const verdictMatch = line.match(/^\*{0,2}(?:verdict|why)\s*:\*{0,2}\s*(.+)$/i);
    if (verdictMatch && !verdict) {
      verdict = cleanValue(verdictMatch[1]);
    }
  }

  return level && verdict ? { level, verdict } : null;
}
