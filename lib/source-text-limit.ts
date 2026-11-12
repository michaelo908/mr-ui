/** Source length uses JavaScript UTF-16 units, consistently in browser and server. */
export const SOURCE_TEXT_MAX_CHARACTERS = 60_000;
export const SOURCE_TEXT_LIMIT_ERROR = "Source text supports up to 60,000 characters (approximately 9,000 words). Please shorten the text and try again.";

export function exceedsSourceTextLimit(text: string) {
  return text.length > SOURCE_TEXT_MAX_CHARACTERS;
}

/** Remove only the application's known lens wrapper, never truncate source text. */
export function analysisSourceText(body: { input?: unknown; context?: unknown; mode?: unknown; mr_heresy?: unknown; selectedGraviton?: unknown }) {
  let text = typeof body.input === "string" ? body.input : "";
  if ((body.mode === "mr_heresy" || body.mr_heresy === true) && typeof body.context === "string") {
    const markers = ["Apply Multirrupt Mode to the following text:\n\n", "Apply Multirrupt Mode to the following source:\n\n"];
    for (const marker of markers) {
      const index = body.context.indexOf(marker);
      if (index >= 0) { text = body.context.slice(index + marker.length); break; }
    }
  }
  const prefix = `Analysis Lens:
${body.selectedGraviton}

----------------------------------------

`;
  return text.startsWith(prefix) ? text.slice(prefix.length) : text;
}
