export const AUDIT_VERSION = "reader-side-1.0";
export const DIMENSIONS = [
  "Orientation",
  "Authority",
  "Continuity",
  "Dissonance",
  "Resonance",
  "Resolution",
  "Load",
] as const;
export const AI_DIMENSIONS = [
  "Accessibility",
  "Semantic Clarity",
  "Answer Sufficiency",
  "Contextual Independence",
  "Evidential Authority",
  "Semantic Consistency",
] as const;
export const LEVELS = [
  "Exceptional",
  "Effective",
  "Compromised",
  "Deficient",
  "Counterproductive",
  "Insufficient Evidence",
] as const;
export type AuditKind = "mini" | "comprehensive" | "readiness";
export type Finding = {
  title: string;
  evidence: { page: number; quote: string; viewport: number | null }[];
  consequence: string;
  remedy: string;
  priority: string;
};
export type AuditReport = {
  summary: string;
  profile: {
    dimension: string;
    level: (typeof LEVELS)[number];
    rationale: string;
  }[];
  findings: Finding[];
  beyond_homepage: string;
  limitations: string[];
};
export type AuditSource = {
  requestedUrl: string;
  finalUrl: string;
  title: string;
  text: string;
  images: string[];
  capturedAt: string;
  technicalEvidence?: string;
  truncated: boolean;
  limitations: string[];
};
export type AuditJob = {
  id: string;
  user_id: string | null;
  anonymous_hash: string | null;
  kind: AuditKind;
  urls: string[];
  status: "queued" | "running" | "failed" | "completed";
  step: number;
  reports: AuditReport[];
  result: AuditReport | null;
  failure: string | null;
  parent_id: string | null;
  created_at: string;
  source_keys: string[];
  attempts: number;
  entitlement_key: string | null;
  spent_microusd: number;
};
export const BUDGETS = {
  mini: { input: 12000, output: 2500, reserve: 550000, viewports: 4 },
  comprehensive: {
    input: 80000,
    output: 18000,
    reserve: 4000000,
    viewports: 4,
  },
  readiness: { input: 45000, output: 8000, reserve: 2000000, viewports: 0 },
} as const;
export function normalizeUrls(values: unknown, kind: AuditKind): string[] {
  if (
    !Array.isArray(values) ||
    values.length < 1 ||
    values.length > (kind === "mini" ? 1 : 5)
  )
    throw new Error(
      "Enter the homepage and no more than four additional URLs.",
    );
  const urls = values.map((value) => {
    if (typeof value !== "string" || value.length > 2048)
      throw new Error("Invalid URL.");
    const u = new URL(
      /^[a-z][a-z\d+.-]*:/i.test(value.trim())
        ? value.trim()
        : `https://${value.trim()}`,
    );
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      throw new Error("Only public HTTP and HTTPS pages are supported.");
    u.hash = "";
    return u.toString();
  });
  if (new Set(urls).size !== urls.length)
    throw new Error("Each URL must be different.");
  // The user identifies their homepage; localised homepages can have a path.
  return urls;
}
export function stageBudget(
  kind: AuditKind,
  pageCount: number,
  synthesis: boolean,
) {
  if (kind === "mini") return { input: 12000, output: 2500 };
  if (kind === "readiness") return { input: 45000, output: 8000 };
  return synthesis
    ? { input: 15000, output: 5500 }
    : {
        input: Math.min(13000, Math.floor(65000 / pageCount)),
        output: Math.min(4500, Math.floor(12500 / pageCount)),
      };
}
