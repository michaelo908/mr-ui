export type CadenceMode = "dynamic" | "sustained";

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
    value: "sustained",
    label: "Sustained",
    description:
      "Fuller paragraphs and a traditional long-form reading rhythm.",
  },
];

export function cadenceInstruction(mode: CadenceMode) {
  const rhythm =
    mode === "sustained"
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

This cadence instruction is mandatory for every Rewrite section and every rewrite-only response.

Cadence governs prose rhythm only. It does not grant permission to compress,
omit, summarise, add, reorder, restructure, or otherwise change substantive
content beyond changes already required by the diagnosis. Do not let Cadence
alter the Editor's Summary, Narrative Performance, or Diagnosis in Depth.`;
}
