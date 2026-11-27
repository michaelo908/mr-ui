import type { DashboardSignal } from "@/lib/signals/dashboard";
export type AuditUsage = {
  reserved_microusd: number;
  actual_microusd: number | null;
  metrics: Record<string, unknown>;
  reader_audits: { kind: string } | null;
};
export function auditMetrics(events: DashboardSignal[], usage: AuditUsage[]) {
  const miniVisitors = new Set(
    events
      .filter(
        (e) =>
          e.signal_name === "audit.completed" &&
          e.verified &&
          e.properties?.audit_kind === "mini" &&
          e.visitor_id,
      )
      .map((e) => e.visitor_id),
  );
  const purchasers = new Set(
    events
      .filter(
        (e) =>
          e.signal_name === "audit.purchased" &&
          e.verified &&
          e.properties?.audit_kind === "comprehensive" &&
          e.visitor_id,
      )
      .map((e) => e.visitor_id),
  );
  const converted = [...miniVisitors].filter((v) => purchasers.has(v)).length;
  const costs = ["mini", "comprehensive", "readiness"].map((kind) => {
    const rows = usage.filter((u) => u.reader_audits?.kind === kind);
    return {
      kind,
      attempts: rows.length,
      cost:
        rows.reduce(
          (s, u) => s + Number(u.actual_microusd ?? u.reserved_microusd),
          0,
        ) / 1e6,
      uncertain: rows.filter((u) => u.actual_microusd === null).length,
      input: rows.reduce(
        (s, u) => s + (Number(u.metrics.input_tokens) || 0),
        0,
      ),
      output: rows.reduce(
        (s, u) => s + (Number(u.metrics.output_tokens) || 0),
        0,
      ),
    };
  });
  return {
    miniVisitors: miniVisitors.size,
    converted,
    conversion: miniVisitors.size ? converted / miniVisitors.size : null,
    costs,
  };
}
