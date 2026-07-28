export type AnalysisStatus = "success" | "error";

export function shouldShowAnalysisEasterEgg(
  status?: AnalysisStatus
): boolean {
  return status === "success";
}
