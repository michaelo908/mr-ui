const MIN_SHORT_FORM_WORDS = 20;
const MAX_SHORT_FORM_WORDS = 500;

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Short decision copy is unusually sensitive to voice and sequencing. Keep
 * the established long-form contract intact and apply this focused pass only
 * to concise, text-only sources.
 */
export function isShortFormEditorialCandidate({
  input,
  sourceMode,
  hasVisualInput,
  rewriteOnly,
  continuation,
}: {
  input: unknown;
  sourceMode: unknown;
  hasVisualInput: boolean;
  rewriteOnly: boolean;
  continuation: boolean;
}) {
  if (
    hasVisualInput ||
    sourceMode === "rendered-url" ||
    typeof input !== "string"
  ) {
    return false;
  }

  // A rewrite-only request carries the original source again, so retain the
  // preservation contract even though it may include the prior report as context.
  if (!rewriteOnly && continuation) return false;

  const count = wordCount(input);
  return count >= MIN_SHORT_FORM_WORDS && count <= MAX_SHORT_FORM_WORDS;
}

export const SHORT_FORM_EDITORIAL_POLICY = `
SHORT-FORM DECISION COPY POLICY (OVERRIDES ONLY THE NARRATIVE PERFORMANCE AND REWRITE RULES BELOW):

This is concise, action-led writing. Its purpose is usually to make a reader continue, reply, click, enquire, register, or buy. Do not treat it as compressed long-form copy.

If the request is rewrite-only, obey the rewrite-only output contract. Apply only the preservation and rewrite rules in this policy; do not output a new report.

Before diagnosing it, silently identify:
- the single reader decision the writing needs to earn;
- its governing idea or central tension;
- the distinctive phrases or moves that make it recognisable, forceful, or memorable.

Those distinctive phrases are protected elements. Do not remove, soften, replace, or make them more conventional merely for smoothness, completeness, or generic clarity. Change a protected element only if it genuinely obstructs understanding, credibility, or the intended reader action, and explain that decision in Diagnosis in Depth.

SHORT-FORM NARRATIVE PERFORMANCE CONTRACT:
- Do not use the normal observation list or three-to-five recommendation requirement.
- Start with exactly these two labelled lines:
  **Priority Reader Tension:** <one concise source-specific sentence naming the concentrated reader-side risk>
  **Editorial Verdict:** Ready to test | Revise the priority points
- Include one or two recommendations only. Each must be a genuine high-impact issue, using the existing Protect, Consolidate, Reduce, or Introduce form with supporting evidence.
- Treat all other tensions as accepted trade-offs when they preserve voice, force, brevity, or the governing idea. State those trade-offs clearly in Diagnosis in Depth rather than turning them into more corrections.

SHORT-FORM REWRITE CONTRACT:
- Preserve the governing idea and protected elements verbatim wherever possible.
- Make only the minimum material changes needed to address the priority point or points.
- Do not replace distinctive language with generic claims, polite transitions, familiar AI/copywriting language, or conventional openings.
- If no material reader-side barrier remains, preserve the original architecture and say in Rewrite Debrief that the piece is ready to test rather than manufacturing a fresh rewrite problem.
`.trim();
