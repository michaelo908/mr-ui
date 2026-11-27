import { getSignalsAdminClient } from "@/lib/signals/server";
import {
  paginateDashboardSignals,
  type DashboardSignal,
} from "@/lib/signals/dashboard";
import { auditMetrics, type AuditUsage } from "./metrics";
export async function AuditSignalsPanel({
  since,
  until,
  includeTest,
  events,
}: {
  since: string;
  until: string;
  includeTest: boolean;
  events: DashboardSignal[];
}) {
  // Called only inside the founder-authorised Signals page. V1.0 audit data is staging-only.
  if (process.env.AUDIT_ENABLED !== "true") return null;
  if (!includeTest)
    return (
      <section className="mt-8 rounded-2xl border border-neutral-800 p-5">
        <h2 className="text-xl font-semibold">Reader Side Audit</h2>
        <p className="mt-2 text-neutral-400">
          Include test/demo to inspect staging audit usage.
        </p>
      </section>
    );
  const admin = getSignalsAdminClient();
  if (!admin) return null;
  const usage = await paginateDashboardSignals<AuditUsage>(async (from, to) => {
    const { data, error } = await admin
      .from("reader_audit_usage")
      .select("reserved_microusd,actual_microusd,metrics,reader_audits(kind)")
      .gte("created_at", since)
      .lte("created_at", until)
      .order("created_at")
      .order("id")
      .range(from, to);
    if (error) throw error;
    return (data || []) as unknown as AuditUsage[];
  }).catch(() => null);
  const snapshot = auditMetrics(events, usage ?? []);
  return (
    <section className="mt-8 rounded-2xl border border-neutral-800 p-5">
      <h2 className="text-xl font-semibold">Reader Side Audit · staging</h2>
      {usage === null ? (
        <p className="mt-3 text-amber-200">
          Audit usage storage is unavailable.
        </p>
      ) : (
        <>
          <p className="mt-3 text-neutral-300">
            {snapshot.miniVisitors} identified mini-audit visitors ·{" "}
            {snapshot.converted} also purchased a comprehensive audit ·{" "}
            {snapshot.conversion === null
              ? "—"
              : `${(snapshot.conversion * 100).toFixed(1)}%`}{" "}
            linked conversion.
          </p>
          <p className="mt-2 text-xs text-neutral-500">
            Both events must fall in this reporting window. Cookie loss and
            different browsers may leave purchases unlinked. This is not a
            complete acquisition cohort.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[550px] text-left text-sm">
              <thead>
                <tr>
                  <th>Assessment</th>
                  <th>Stage attempts</th>
                  <th>Input / output tokens</th>
                  <th>US$ exposure</th>
                  <th>Uncertain attempts</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.costs.map((c) => (
                  <tr key={c.kind} className="border-t border-neutral-800">
                    <td className="py-3">{c.kind}</td>
                    <td>{c.attempts}</td>
                    <td>
                      {c.input.toLocaleString()} / {c.output.toLocaleString()}
                    </td>
                    <td>{c.cost.toFixed(3)}</td>
                    <td>{c.uncertain}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            Includes failed attempts. Known model tokens use US$10/million input
            and US$50/million output without cache discounts; capture allowance
            is conservative. Unknown provider outcomes retain the full reserved
            stage allowance. Hosting, payment fees and taxes are excluded.
          </p>
        </>
      )}
    </section>
  );
}
