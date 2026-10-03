"use client";

type MetaPixelFunction = {
  (command: "track" | "trackCustom", eventName: string): void;
};

const SIGNALS_BROWSER_EXCLUSION_KEY = "multirruptSignalsBrowserExcludedV1";

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
  }
}

/**
 * Product-quality events for Meta optimisation. Deliberately accepts no payload:
 * Multirrupt must never disclose a visitor's submitted work, report, or identity
 * to an advertising platform.
 */
export function trackMetaEvent(eventName: string, standard = false) {
  if (typeof window === "undefined" || typeof window.fbq !== "function") return;
  try {
    if (
      window.location.hostname === "localhost" ||
      window.localStorage.getItem(SIGNALS_BROWSER_EXCLUSION_KEY) === "1"
    ) return;
  } catch {
    return;
  }
  window.fbq(standard ? "track" : "trackCustom", eventName);
}

export function trackMetaSignal(signalName: string) {
  switch (signalName) {
    case "discovery.jump_in_auth_requested":
      trackMetaEvent("Lead", true);
      break;
    case "analysis.started":
      trackMetaEvent("AnalysisStarted");
      break;
    case "workflow.rewrite_revealed":
      trackMetaEvent("RewriteEngaged");
      break;
  }
}
