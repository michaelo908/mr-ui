export type CadenceMode = "dynamic" | "dynamic-preserve" | "sustained" | "sustained-preserve";

export const CADENCE_OPTIONS: Array<{
  value: CadenceMode;
  label: string;
  description: string;
}> = [
  {
    value: "dynamic",
    label: "Dynamic",
    description:
      "Contemporary movement with shorter sentences and paragraphs.",
  },
  {
    value: "dynamic-preserve",
    label: "Dynamic Preserve",
    description: "Contemporary movement while protecting your voice and original rhythm.",
  },
  {
    value: "sustained",
    label: "Sustained",
    description:
      "Fuller paragraphs and a traditional long-form reading rhythm.",
  },
  {
    value: "sustained-preserve",
    label: "Sustained Preserve",
    description: "Connected long-form prose while protecting your voice and original rhythm.",
  },
];

export function isCadenceMode(value: unknown): value is CadenceMode {
  return CADENCE_OPTIONS.some((option) => option.value === value);
}

export const PRESERVE_DESCRIPTION = "Preserve protects voice, rhythm, unusual turns of phrase, humour and useful anecdotes. It changes only the top 2–3 critical reader-side problems, or fewer when fewer need fixing.";

export function cadenceInstruction(mode: CadenceMode) {
  const rhythm =
    (mode === "sustained" || mode === "sustained-preserve")
      ? `SUSTAINED CADENCE:
- Use developed, connected paragraphs as the default rewrite shape.
- Use longer and more varied sentence structures than Dynamic.
- Maintain a traditional long-form reading rhythm with explicit connective tissue between ideas.
- Use isolated short lines rarely and only for deliberate emphasis.
- Do not produce repetitive one-sentence paragraphs, SaaS-style staccato, or a stack of disconnected lines.`
      : `DYNAMIC CADENCE:
- Use a contemporary rhythm with generally shorter sentences and paragraphs.
- Create visual movement through varied paragraph length.
- Keep the prose fluid rather than choppy.`;

  return `CADENCE CONTROL — APPLY TO REWRITE OUTPUT ONLY:
${rhythm}
${mode.endsWith("-preserve") ? `
PRESERVE — OVERRIDES RHYTHM AND GENERAL REWRITE DIRECTIONS WHERE THEY CONFLICT:
${PRESERVE_DESCRIPTION}
Use the existing diagnosis to identify only those critical problems. Leave everything else intact.
Preserve the author's wording, structure and rhythm unless changing them is necessary to solve one of those problems. Do not normalize distinctive prose, remove humour or anecdotes, or rewrite merely to match the cadence. Apply the selected rhythm only within necessary edits.
` : ""}

This cadence instruction is mandatory for every Rewrite section and every rewrite-only response.

For Sustained cadence, a valid rewrite should read as connected prose by default:
normally two or more developed paragraphs, varied sentence length, and clear
transitions between ideas. Do not substitute a stack of isolated punch lines,
single-sentence paragraphs, or SaaS-style fragments for a sustained rewrite.

Cadence governs prose rhythm only. It does not grant permission to compress,
omit, summarise, add, reorder, restructure, or otherwise change substantive
content beyond changes already required by the diagnosis. Do not let Cadence
alter the Editor's Summary, Narrative Performance, or Diagnosis in Depth.`;
}
