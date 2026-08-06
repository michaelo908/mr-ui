import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSignalsAdminClient } from "@/lib/signals/server";
import {
  buildAnonymousStories,
  buildFounderSnapshot,
  buildFunnel,
  buildHighlights,
  getDashboardWindowStart,
  paginateDashboardSignals,
  type DashboardSignal,
  type SnapshotWindow,
} from "@/lib/signals/dashboard";

export const dynamic = "force-dynamic";

function percent(value: number) { return `${Math.round(value * 100)}%`; }
function shortId(value: string) { return `${value.slice(0, 8)}…`; }

export default async function FounderPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string; include_test?: string }>;
}) {
  const params = await searchParams;
  const days: SnapshotWindow = params.window === "1" || params.window === "30" ? Number(params.window) as SnapshotWindow : 7;
  const includeTest = params.include_test === "1";
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const founders = (process.env.FOUNDER_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
  const isFounder = Boolean(user && (user.app_metadata?.role === "founder" || (user.email && founders.includes(user.email.toLowerCase()))));
  if (!isFounder) notFound();

  // This dynamic server page intentionally snapshots request-time reporting windows.
  // eslint-disable-next-line react-hooks/purity
  const now = new Date(Date.now());
  const since = getDashboardWindowStart(days, now).toISOString();
  const admin = getSignalsAdminClient();
  let rows: DashboardSignal[] = [];
  let unavailable = false;
  if (admin) {
    rows = await paginateDashboardSignals<DashboardSignal>(async (from, to) => {
      let query = admin.from("gravitas_signals").select("id,occurred_at,signal_name,visitor_id,session_id,surface,verified,is_test,properties,first_touch,last_touch").gte("occurred_at", since).lte("occurred_at", now.toISOString()).order("occurred_at", { ascending: false }).order("id", { ascending: false }).range(from, to);
      if (!includeTest) query = query.eq("is_test", false);
      const result = await query;
      if (result.error) {
        unavailable = true;
        return [];
      }
      return (result.data ?? []) as DashboardSignal[];
    });
  } else unavailable = true;

  const snapshot = buildFounderSnapshot(rows);
  const funnel = buildFunnel(rows);
  const highlights = buildHighlights(rows);
  const stories = buildAnonymousStories(rows);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#C6A75A]">Gravitas Signals</p>
        <h1 className="mt-2 text-3xl font-semibold">Founder Snapshot</h1>
        <div className="mt-5 flex flex-wrap gap-2">
          {([1, 7, 30] as const).map((value) => <Link key={value} href={`/founder?window=${value}${includeTest ? "&include_test=1" : ""}`} className={`rounded-lg border px-3 py-2 text-sm ${days === value ? "border-[#C6A75A] text-[#C6A75A]" : "border-neutral-800 text-neutral-400"}`}>{value === 1 ? "Today" : `${value} days`}</Link>)}
          <Link href={`/founder?window=${days}${includeTest ? "" : "&include_test=1"}`} className="rounded-lg border border-neutral-800 px-3 py-2 text-sm text-neutral-400">{includeTest ? "Hide test/demo" : "Include test/demo"}</Link>
        </div>
        <p className="mt-3 text-xs text-neutral-500">Today begins at midnight in Australia/Melbourne. Seven- and thirty-day views are rolling windows ending now.</p>

        {unavailable ? <div className="mt-6 rounded-xl border border-amber-700/50 bg-amber-950/30 p-4 text-amber-200">Signals storage is not available yet. Apply the included Supabase migration and configure the service-role key.</div> : null}

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[["Visitors", snapshot.visitors], ["Sessions", snapshot.sessions], ["Verified analyses", snapshot.completed], ["Purchases", snapshot.purchases], ["Analysis completion", percent(snapshot.completionRate)], ["Purchase after analysis", percent(snapshot.purchaseRate)], ["Analysis starts", snapshot.starts], ["Rewrite engagement", snapshot.rewrites]].map(([label, value]) => <div key={label} className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4"><div className="text-sm text-neutral-400">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>)}
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-neutral-800 p-5"><h2 className="text-xl font-semibold">Funnel</h2><div className="mt-5 space-y-4">{funnel.map((stage, index) => { const width = funnel[0]?.value ? Math.max(4, stage.value / funnel[0].value * 100) : 0; return <div key={stage.label}><div className="flex justify-between text-sm"><span>{stage.label}</span><span>{stage.value}</span></div><div className="mt-1 h-2 overflow-hidden rounded bg-neutral-800"><div className="h-full rounded bg-[#C6A75A]" style={{ width: `${width}%` }} /></div>{index > 0 && funnel[index - 1].value ? <div className="mt-1 text-xs text-neutral-500">{Math.round(stage.value / funnel[index - 1].value * 100)}% from prior stage</div> : null}</div>; })}</div></section>
          <section className="rounded-2xl border border-neutral-800 p-5"><h2 className="text-xl font-semibold">Highlights</h2><ul className="mt-5 space-y-3 text-neutral-300">{highlights.map((highlight) => <li key={highlight} className="rounded-lg bg-neutral-900/60 p-3">{highlight}</li>)}</ul></section>
        </div>

        <section className="mt-8 rounded-2xl border border-neutral-800 p-5"><h2 className="text-xl font-semibold">Anonymous user stories</h2><p className="mt-1 text-sm text-neutral-500">Privacy-safe event journeys; no submitted content, email address, or full URL is stored.</p><div className="mt-5 space-y-4">{stories.map((story) => <article key={story.visitorId} className="rounded-xl bg-neutral-900/50 p-4"><div className="text-sm font-semibold text-[#C6A75A]">Visitor {shortId(story.visitorId)}</div><div className="mt-3 flex flex-wrap gap-2">{story.events.map((event) => <span key={event.id} title={new Date(event.occurred_at).toLocaleString()} className="rounded-full border border-neutral-700 px-2.5 py-1 text-xs text-neutral-300">{event.signal_name.replace(/^[^.]+\./, "").replaceAll("_", " ")}</span>)}</div></article>)}</div></section>
      </div>
    </main>
  );
}
