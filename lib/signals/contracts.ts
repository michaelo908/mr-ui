import {
  SIGNAL_CONTRACT_VERSION,
  SIGNAL_REGISTRY,
  clientPropertyRules,
  type SignalName,
} from "@/lib/signals/registry";
import {
  isPrivacySensitivePropertyKey,
  sanitizeAttribution,
  sanitizeHostname,
  sanitizePropertiesWithRules,
  sanitizeRelativePathname,
} from "@/lib/signals/privacy";

export { isPrivacySensitivePropertyKey, sanitizeAttribution, sanitizeHostname, sanitizeRelativePathname };

export type SignalAttribution = {
  landingPath?: string;
  referrerHost?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  metaCampaignId?: string;
  metaAdSetId?: string;
  metaAdId?: string;
  creativeHypothesis?: string;
};

export type SignalEnvelope = {
  name: SignalName;
  version: typeof SIGNAL_CONTRACT_VERSION;
  visitorId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  surface: "jump-in" | "paid" | "acquisition" | "founder" | "unknown";
  firstTouch?: SignalAttribution;
  lastTouch?: SignalAttribution;
  properties?: Record<string, unknown>;
  occurredAt?: string;
  isTest?: boolean;
  verified?: boolean;
  dedupeKey?: string | null;
};

const MAX_STRING = 240;
const MAX_KEYS = 24;

export function sanitizeClientSignalProperties(name: SignalName, input: unknown) {
  return sanitizePropertiesWithRules(input, clientPropertyRules(name));
}

export function sanitizeSignalProperties(
  input: unknown
): Record<string, string | number | boolean | null> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input)
      .slice(0, MAX_KEYS)
      .flatMap(([key, value]) => {
        if (!/^[a-z][a-z0-9_]{0,47}$/i.test(key)) return [];
        if (typeof value === "string") return [[key, value.slice(0, MAX_STRING)]];
        if (typeof value === "number" && Number.isFinite(value)) return [[key, value]];
        if (typeof value === "boolean" || value === null) return [[key, value]];
        return [];
      })
  );
}

export function buildSignalEnvelope(
  name: SignalName,
  input: Omit<Partial<SignalEnvelope>, "name" | "version"> = {}
): SignalEnvelope {
  return {
    name,
    version: SIGNAL_CONTRACT_VERSION,
    surface: input.surface ?? "unknown",
    visitorId: input.visitorId ?? null,
    sessionId: input.sessionId ?? null,
    userId: input.userId ?? null,
    firstTouch: sanitizeAttribution(input.firstTouch),
    lastTouch: sanitizeAttribution(input.lastTouch),
    properties: sanitizeSignalProperties(input.properties),
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    isTest: input.isTest ?? false,
    verified: input.verified ?? false,
    dedupeKey: input.dedupeKey ?? null,
  };
}

export function signalCategory(name: SignalName) {
  return SIGNAL_REGISTRY[name].category;
}
