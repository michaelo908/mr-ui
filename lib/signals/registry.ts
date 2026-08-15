export const SIGNAL_CONTRACT_VERSION = 1 as const;

export type ClientPropertyRule =
  | { type: "boolean" }
  | { type: "integer"; min?: number; max?: number }
  | { type: "uuid" }
  | { type: "identifier"; maxLength?: number }
  | { type: "pathname" }
  | { type: "enum"; values: readonly string[] };

export const SIGNAL_REGISTRY = {
  "acquisition.funnel_viewed": { category: "acquisition", client: true, properties: { funnel: { type: "enum", values: ["email", "proposal", "landing-page"] } } },
  "acquisition.signup_completed": { category: "acquisition", client: false, properties: {} },
  "discovery.session_started": { category: "discovery", client: true, properties: { entry_path: { type: "pathname" } } },
  "discovery.session_expired": { category: "discovery", client: true, properties: { session_kind: { type: "enum", values: ["jump_in"] } } },
  "discovery.source_selected": { category: "discovery", client: true, properties: { source_mode: { type: "enum", values: ["text", "url", "images"] } } },
  "discovery.day_pass_clicked": { category: "discovery", client: true, properties: { reason: { type: "enum", values: ["session_expired", "manual"] } } },
  "analysis.started": { category: "analysis", client: true, properties: {
    analysis_id: { type: "uuid" },
    source_mode: { type: "enum", values: ["text", "url", "images"] },
    graviton: { type: "identifier", maxLength: 80 },
    cadence: { type: "enum", values: ["dynamic", "sustained"] },
  } },
  "analysis.completed": { category: "analysis", client: false, properties: {} },
  "analysis.failed": { category: "analysis", client: false, properties: {} },
  "engagement.report_copied": { category: "engagement", client: true, properties: {
    format: { type: "enum", values: ["email", "word"] },
    scope: { type: "enum", values: ["message", "all"] },
  } },
  "engagement.depth_toggled": { category: "engagement", client: true, properties: { open: { type: "boolean" } } },
  "engagement.evidence_inspected": { category: "engagement", client: true, properties: {
    evidence_type: { type: "enum", values: ["viewport", "text"] },
    evidence_number: { type: "integer", min: 1, max: 1000 },
  } },
  "workflow.rewrite_revealed": { category: "workflow", client: true, properties: {} },
  "workflow.rewrite_created": { category: "workflow", client: true, properties: {} },
  "workflow.rewrite_copied": { category: "workflow", client: true, properties: { format: { type: "enum", values: ["email", "word"] } } },
  "purchase.checkout_started": { category: "purchase", client: false, properties: {} },
  "purchase.checkout_completed": { category: "purchase", client: false, properties: {} },
  "purchase.checkout_failed": { category: "purchase", client: false, properties: {} },
  "purchase.day_pass_completed": { category: "purchase", client: false, properties: {} },
  "purchase.subscription_updated": { category: "purchase", client: false, properties: {} },
  "purchase.subscription_cancelled": { category: "purchase", client: false, properties: {} },
} as const;

export type SignalName = keyof typeof SIGNAL_REGISTRY;
export type SignalCategory =
  (typeof SIGNAL_REGISTRY)[SignalName]["category"];

export function isSignalName(value: string): value is SignalName {
  return Object.prototype.hasOwnProperty.call(SIGNAL_REGISTRY, value);
}

export function isClientSignalName(value: string): value is SignalName {
  return isSignalName(value) && SIGNAL_REGISTRY[value].client;
}

export function clientPropertyRules(name: SignalName) {
  return SIGNAL_REGISTRY[name].client
    ? SIGNAL_REGISTRY[name].properties as Record<string, ClientPropertyRule>
    : {};
}
