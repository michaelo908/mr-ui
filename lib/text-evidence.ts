import type {
  NarrativePerformanceAction,
  NarrativePerformanceRecommendation,
} from "@/lib/narrative-performance";

export type GravitasEvidenceKind = "text" | "viewport";

export type GravitasEvidenceReference = {
  kind: GravitasEvidenceKind;
  numbers: number[];
};

export type TextEvidenceBlock = {
  kind: "text";
  number: number;
  id: string;
  content: string;
};

export type TextEvidenceLaunch = {
  evidenceNumber: number;
  action: NarrativePerformanceAction;
  color: string;
  recommendation: string;
};

const EVIDENCE_MARKER =
  /^\s*\[\[\s*(?:text\s+)?evidence\s*:?\s*(\d+)\s*\]\]\s*$/gim;

export function parseTextEvidenceBlocks(value: string): TextEvidenceBlock[] {
  const matches = [...value.matchAll(EVIDENCE_MARKER)];
  if (matches.length === 0) return [];

  const blocks: TextEvidenceBlock[] = [];
  const seen = new Set<number>();

  for (let index = 0; index < matches.length; index += 1) {
    const number = Number(matches[index][1]);
    const start = (matches[index].index ?? 0) + matches[index][0].length;
    const end = matches[index + 1]?.index ?? value.length;
    const content = value.slice(start, end).trim();

    if (
      !Number.isSafeInteger(number) ||
      number < 1 ||
      number > 99 ||
      seen.has(number) ||
      !content
    ) {
      continue;
    }

    seen.add(number);
    blocks.push({
      kind: "text",
      number,
      id: `text-evidence-${number}`,
      content,
    });
  }

  return blocks;
}

function expandEvidenceNumber(value: string) {
  const range = value.match(/^(\d+)\s*(?:[-–—]|to)\s*(\d+)$/i);
  if (!range) {
    const number = Number(value);
    return Number.isSafeInteger(number) && number > 0 ? [number] : [];
  }

  const start = Number(range[1]);
  const end = Number(range[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 1 ||
    end < start ||
    end - start > 20
  ) {
    return [];
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function extractTextEvidenceNumbers(value: string): number[] {
  const evidenceMatch = value.match(
    /(?:^|\s)Evidence\s*:\s*(?:\*\*)?(.+?)(?:\*\*)?(?=\s*$)/i
  );
  if (!evidenceMatch) return [];

  const numbers: number[] = [];
  const items = evidenceMatch[1].match(/\d+(?:\s*(?:[-–—]|to)\s*\d+)?/gi) ?? [];
  for (const item of items) {
    for (const number of expandEvidenceNumber(item)) {
      if (!numbers.includes(number)) numbers.push(number);
    }
  }
  return numbers;
}

export function stripTextEvidenceReference(value: string) {
  return value
    .replace(
      /\s*Evidence\s*:\s*(?:\*\*)?.+?(?:\*\*)?\s*$/i,
      ""
    )
    .trim();
}

export function buildTextEvidenceLaunch(
  recommendation: NarrativePerformanceRecommendation,
  availableBlocks: TextEvidenceBlock[],
  evidenceNumber: number,
  color: string
): TextEvidenceLaunch | null {
  const available = new Set(availableBlocks.map((block) => block.number));
  const referenced = extractTextEvidenceNumbers(recommendation.body).filter(
    (number) => available.has(number)
  );
  if (!referenced.includes(evidenceNumber)) return null;

  return {
    evidenceNumber,
    action: recommendation.action,
    color,
    recommendation: stripTextEvidenceReference(recommendation.body),
  };
}
