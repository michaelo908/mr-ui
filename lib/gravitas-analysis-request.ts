export type AnalysisInputMode = "text" | "url" | "images";

export function buildAnalysisInput({
  inputMode,
  raw,
  selectedGraviton,
  imageCount,
}: {
  inputMode: AnalysisInputMode;
  raw: string;
  selectedGraviton: string;
  imageCount: number;
}) {
  if (inputMode === "images" && imageCount > 0) {
    return `Analyse the attached image${imageCount === 1 ? "" : "s"} as the source material.

Analysis Lens:
${selectedGraviton}`;
  }

  const gravitonPrefix =
    selectedGraviton === "Full Analysis"
      ? ""
      : `Analysis Lens:
${selectedGraviton}

----------------------------------------

`;

  return gravitonPrefix + raw;
}

export function sourceAvailabilityInstruction({
  hasUsableText,
  hasVisualInput,
}: {
  hasUsableText: boolean;
  hasVisualInput: boolean;
}) {
  if (hasVisualInput) {
    return `SOURCE INTAKE STATUS:
Visual source material is present. Analyse the supplied visual source. Never ask the user to paste email, landing-page, advertisement, or other written copy merely because pasted text is absent.`;
  }

  if (hasUsableText) {
    return `SOURCE INTAKE STATUS:
Usable written source material is present. Analyse it under the normal report contract.`;
  }

  return `SOURCE INTAKE STATUS:
No usable written or visual source material is present. Use the normal brief request for the user to paste the copy they want diagnosed.`;
}
