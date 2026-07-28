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
- Use fuller paragraphs and longer, more varied sentence structures.
- Maintain a traditional long-form rhythm.
- Use short sentences rarely and deliberately.`
      : `DYNAMIC CADENCE:
- Use a contemporary rhythm with generally shorter sentences and paragraphs.
- Create visual movement through varied paragraph length.
- Keep the prose fluid rather than choppy.`;

  return `CADENCE CONTROL — APPLY TO REWRITE OUTPUT ONLY:
${rhythm}

Cadence governs prose rhythm only. It does not grant permission to compress,
omit, summarise, add, reorder, restructure, or otherwise change substantive
content beyond changes already required by the diagnosis. Do not let Cadence
alter the Executive Summary or Diagnosis in Depth.`;
}
