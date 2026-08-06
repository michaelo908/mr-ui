type PropertyRule =
  | { type: "boolean" }
  | { type: "integer"; min?: number; max?: number }
  | { type: "uuid" }
  | { type: "identifier"; maxLength?: number }
  | { type: "pathname" }
  | { type: "enum"; values: readonly string[] };

const IDENTIFIER = /^[A-Za-z0-9._~-]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PRIVACY_TOKENS = ["email", "name", "text", "content", "source", "report", "output", "image", "url", "payload"];
const ATTRIBUTION_KEYS = ["landingPath", "referrerHost", "utmSource", "utmMedium", "utmCampaign", "utmContent", "metaCampaignId", "metaAdSetId", "metaAdId", "creativeHypothesis"] as const;

export function isPrivacySensitivePropertyKey(key: string) {
  const canonical = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return PRIVACY_TOKENS.some((token) => canonical.includes(token));
}

export function sanitizeRelativePathname(value: unknown) {
  if (typeof value !== "string") return undefined;
  const withoutQuery = value.trim().split(/[?#]/, 1)[0];
  if (!withoutQuery.startsWith("/") || withoutQuery.startsWith("//") || withoutQuery.includes("\\")) return undefined;
  try {
    const parsed = new URL(withoutQuery, "https://gravitas.invalid");
    return parsed.origin === "https://gravitas.invalid" ? parsed.pathname.slice(0, 240) : undefined;
  } catch { return undefined; }
}

export function sanitizeHostname(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim().toLowerCase().replace(/\.$/, "");
  if (!candidate || candidate.length > 253 || candidate.includes(":") || candidate.includes("/")) return undefined;
  const labels = candidate.split(".");
  if (!labels.every((label) => label.length > 0 && label.length <= 63 && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return undefined;
  return candidate;
}

function sanitizeIdentifier(value: unknown, maxLength = 120) {
  if (typeof value !== "string") return undefined;
  const candidate = value.trim();
  return candidate.length > 0 && candidate.length <= maxLength && IDENTIFIER.test(candidate) ? candidate : undefined;
}

export function sanitizeAttribution(input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return undefined;
  const source = input as Record<string, unknown>;
  const clean = Object.fromEntries(ATTRIBUTION_KEYS.flatMap((key) => {
    const value = source[key];
    const sanitized = key === "landingPath" ? sanitizeRelativePathname(value) : key === "referrerHost" ? sanitizeHostname(value) : sanitizeIdentifier(value);
    return sanitized ? [[key, sanitized]] : [];
  }));
  return Object.keys(clean).length ? clean : undefined;
}

export function sanitizePropertiesWithRules(input: unknown, rules: Record<string, PropertyRule>) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const source = input as Record<string, unknown>;
  return Object.fromEntries(Object.entries(rules).flatMap(([key, rule]) => {
    const value = source[key];
    if (value === undefined) return [];
    if (rule.type === "boolean") return typeof value === "boolean" ? [[key, value]] : [];
    if (rule.type === "integer") return Number.isInteger(value) && Number(value) >= (rule.min ?? Number.MIN_SAFE_INTEGER) && Number(value) <= (rule.max ?? Number.MAX_SAFE_INTEGER) ? [[key, value]] : [];
    if (rule.type === "uuid") return typeof value === "string" && UUID.test(value) ? [[key, value]] : [];
    if (rule.type === "pathname") { const path = sanitizeRelativePathname(value); return path ? [[key, path]] : []; }
    if (rule.type === "identifier") { const identifier = sanitizeIdentifier(value, rule.maxLength); return identifier ? [[key, identifier]] : []; }
    if (rule.type === "enum") return typeof value === "string" && rule.values.includes(value) ? [[key, value]] : [];
    return [];
  }));
}
