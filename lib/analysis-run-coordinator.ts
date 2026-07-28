export function createAnalysisRunCoordinator() {
  let activeRunId: string | null = null;

  return {
    tryStart(runId: string) {
      if (activeRunId !== null) return false;
      activeRunId = runId;
      return true;
    },
    isCurrent(runId: string) {
      return activeRunId === runId;
    },
    finish(runId: string) {
      if (activeRunId !== runId) return false;
      activeRunId = null;
      return true;
    },
    isActive() {
      return activeRunId !== null;
    },
  };
}
