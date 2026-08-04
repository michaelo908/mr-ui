export const EDITOR_SUMMARY_CONTRACT = `
- Purpose: provide a rapid findings layer that answers only, "What did Gravitas find?"
- A user should be able to scan the complete section in approximately 15–20 seconds.
- Include normally 4 bullets; use 3 when the material is simple and no more than 5 when distinct major findings genuinely require it.
- Bullet format MUST be exactly: “• <one plain, direct finding sentence>”. Do not add a bold label, heading, colon-led category, or sub-point.
- Keep each bullet to one sentence and normally no more than 18 words. Keep the complete section under approximately 75 words.
- Each bullet must communicate one primary observation. Do not combine several findings into a compressed causal chain.
- State the visible, source-specific situation. Add only its immediate likely effect when that makes the finding easier to understand.
- Communicate the diagnosis, not the reasoning. Do not explain why the issue occurs, provide detailed reader psychology, cite evidence, or prescribe the correction here.
- Use plain, direct, natural language that is understandable almost instantly.
- Avoid coined conceptual labels, framework terminology, jargon, clever metaphors, abstractions, and interpretive compression. In particular, do not manufacture labels such as “choice dilution”, “authority attenuation”, “promo-led interruption”, or similar noun phrases.
- Do not use this section to demonstrate the full intelligence of the analysis. Preserve that complexity in Diagnosis in Depth, Narrative Performance, and the rewrite.
- Make the findings specific enough to encourage inspection of the detailed reasoning or progression to a rewrite.

Preferred form:
• Featured Products feels too promotional and distracts from the buying journey.
• Too many equal choices make it difficult to know where to begin.
• Important proof appears too late, so trust builds slowly.
• Several sections repeat the same message without adding value.

Avoid dense forms such as:
• Promo-led interruption introduces price-led banners that pull attention into deal-noise and shift the reader from solving a problem to decoding an ad.
• Choice dilution prevents a coherent decision hierarchy from emerging.
• Authority attenuation through repeated self-reference weakens perceived expertise.
`.trim();

export type EditorSummaryAssessment = {
  bullets: string[];
  violations: string[];
};

const DENSE_CONCEPTUAL_LANGUAGE = [
  /\bchoice dilution\b/i,
  /\bauthority attenuation\b/i,
  /\bpromo-led interruption\b/i,
  /\bdecision hierarchy\b/i,
  /\bnarrative field\b/i,
  /\borientation energy\b/i,
  /\bdeal-noise\b/i,
];

export function extractEditorSummary(report: string) {
  const match = report.match(
    /(?:^|\n)(?:##\s*)?(?:Editor's|Editor’s|Executive) Summary\s*\r?\n([\s\S]*?)(?=\r?\n(?:##\s*)?(?:Narrative Performance|Diagnosis in Depth|Editor(?:'s|’s) Notes in Depth|Rewrite)\b|\s*$)/i
  );
  return match?.[1]?.trim() ?? "";
}

export function assessEditorSummary(reportOrSummary: string): EditorSummaryAssessment {
  const extracted = extractEditorSummary(reportOrSummary);
  const summary = extracted || reportOrSummary.trim();
  const bullets = summary
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^(?:[-*•])\s+/.test(line))
    .map((line) => line.replace(/^(?:[-*•])\s+/, "").trim());
  const violations: string[] = [];

  if (bullets.length < 3 || bullets.length > 5) {
    violations.push("summary should contain three to five findings");
  }

  const totalWords = bullets.join(" ").split(/\s+/).filter(Boolean).length;
  if (totalWords > 75) violations.push("summary exceeds the rapid-scan word budget");

  bullets.forEach((bullet, index) => {
    const label = `bullet ${index + 1}`;
    const words = bullet.split(/\s+/).filter(Boolean).length;
    if (words > 22) violations.push(`${label} is too long`);
    if (/^\*\*[^*]+:\*\*/.test(bullet)) {
      violations.push(`${label} uses a conceptual heading`);
    }
    const sentenceCount = (bullet.match(/[.!?](?=\s|$)/g) ?? []).length;
    if (sentenceCount > 1) violations.push(`${label} contains multiple sentences`);
    if (/\b(?:because|which causes|as a result|therefore)\b/i.test(bullet)) {
      violations.push(`${label} explains reasoning`);
    }
    if (DENSE_CONCEPTUAL_LANGUAGE.some((pattern) => pattern.test(bullet))) {
      violations.push(`${label} uses dense conceptual language`);
    }
  });

  return { bullets, violations };
}
