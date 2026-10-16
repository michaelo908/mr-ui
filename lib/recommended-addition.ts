/** A recommendation is diagnostic context, never additional source evidence. */
export const SOURCE_RESTRAINT_CONTRACT = `
SOURCE AUTHORITY (applies to every Cadence, Graviton and rewrite):
Improve the work's intended purpose creatively within the author's existing proposition.
Never invent substantive claims, commitments, benefits or evidence, including who reads responses, how feedback will be used, guarantees, results or endorsements.
Analysis and recommendations are not source material or authority to assert missing facts. An Introduce recommendation does not grant that authority.
When useful substance is missing, improve what the source supports and leave the unsupported addition out of every initial, repaired and alternate rewrite. Do not insert speculative copy or placeholders. Do not make the rewrite conditional on supplying more information.
`.trim();

export const RECOMMENDED_ADDITION_CONTRACT = `
CONDITIONAL RECOMMENDED ADDITION:
Only when ALL three conditions hold: a specific missing element materially limits the intended persuasive outcome; available source evidence cannot responsibly supply it; and the author could reasonably supply the information.
Do not trigger for optional embellishments, routine stylistic or structural improvements, missing input modalities, or information already supported by the source. Do not manufacture a gap to fill this feature.
If warranted, put one concise paragraph FIRST in Editor's Summary, before the normal findings, exactly:
**Recommended Addition** — <Explain the specific missing information, its immediate value to the reader's decision, and what the author should supply or verify. Explicitly say the source does not establish it and it has not been added to the rewrite.>
This paragraph is a conditional exception to the summary's no-label/no-prescription rule; keep the normal finding bullets and their word budget unchanged. Omit the paragraph entirely when no material gap qualifies; never output a 'none' placeholder. This is a recommendation, not a new mode or a performance rating.
For example, a survey invitation might need verified information about what feedback is sought, who considers it, or how it will be used. Never assert that Angus personally reads responses unless the source establishes that fact.
For analysis-only requests, say the information cannot responsibly be supplied from the source; do not imply a rewrite was produced.
`.trim();

export function parseRecommendedAddition(summary: string): { addition: string | null; findings: string } {
  // Read one explicitly labelled paragraph; never consume an adjacent finding.
  const lines = summary.split(/\r?\n/);
  const label = /^[ \t]*(?:\*\*)?Recommended Addition(?:\*\*)?[ \t]*[—–:-][ \t]*(\S.*)$/i;
  const start = lines.findIndex((line) => label.test(line));
  if (start < 0) return { addition: null, findings: summary };
  const first = lines[start].match(label)![1].trim();
  if (/^(?:none|n\/a|not applicable|no (?:recommended )?addition(?: needed|required)?)[.!]?$/i.test(first)) {
    return { addition: null, findings: summary };
  }
  const paragraph = [first];
  let end = start + 1;
  while (end < lines.length && lines[end].trim() &&
    !/^\s*(?:[-*•#]|\d+[.)])\s/.test(lines[end]) &&
    !/^\s*\*\*/.test(lines[end])) {
    paragraph.push(lines[end].trim());
    end++;
  }
  return {
    addition: paragraph.join("\n"),
    findings: [...lines.slice(0, start), ...lines.slice(end)].join("\n").trim(),
  };
}
