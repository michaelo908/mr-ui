export type DashboardSignal = {
  id: string;
  occurred_at: string;
  signal_name: string;
  visitor_id: string | null;
  session_id: string | null;
  surface: string;
  verified: boolean;
  is_test: boolean;
  properties: Record<string, unknown> | null;
  first_touch: Record<string, unknown> | null;
  last_touch: Record<string, unknown> | null;
};

export type SnapshotWindow = 1 | 7 | 30;

const MELBOURNE_TIME_ZONE = "Australia/Melbourne";

function zonedParts(date: Date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-AU", {
    timeZone: MELBOURNE_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
}

export function getDashboardWindowStart(window: SnapshotWindow, now: Date) {
  if (window !== 1) return new Date(now.getTime() - window * 86_400_000);
  const local = zonedParts(now);
  const localMidnightAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  const offsetParts = zonedParts(new Date(localMidnightAsUtc));
  const representedLocalTime = Date.UTC(
    offsetParts.year, offsetParts.month - 1, offsetParts.day,
    offsetParts.hour, offsetParts.minute, offsetParts.second
  );
  const offset = representedLocalTime - localMidnightAsUtc;
  return new Date(localMidnightAsUtc - offset);
}

export async function paginateDashboardSignals<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize = 1000
) {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

const unique = (rows: DashboardSignal[], key: "visitor_id" | "session_id") =>
  new Set(rows.map((row) => row[key]).filter(Boolean)).size;

const journeyKey = (row: DashboardSignal) => row.visitor_id ?? row.session_id;
const isJourneyKey = (key: string | null): key is string => Boolean(key);

export function buildFounderSnapshot(rows: DashboardSignal[]) {
  const count = (name: string, verified?: boolean) => rows.filter(
    (row) => row.signal_name === name && (verified === undefined || row.verified === verified)
  ).length;
  const sessions = unique(rows, "session_id");
  const visitors = unique(rows, "visitor_id");
  const starts = count("analysis.started");
  const completed = count("analysis.completed", true);
  const purchases = count("purchase.checkout_completed", true);
  const completedJourneys = new Set(rows
    .filter((row) => row.signal_name === "analysis.completed" && row.verified)
    .map(journeyKey)
    .filter(isJourneyKey));
  const convertedJourneys = new Set(rows
    .filter((row) => row.signal_name === "purchase.checkout_completed" && row.verified)
    .map(journeyKey)
    .filter(isJourneyKey)
    .filter((key) => completedJourneys.has(key)));
  return {
    visitors,
    sessions,
    starts,
    completed,
    rewrites: count("workflow.rewrite_revealed") + count("workflow.rewrite_created"),
    purchases,
    completionRate: starts ? completed / starts : 0,
    purchaseRate: completedJourneys.size ? convertedJourneys.size / completedJourneys.size : 0,
  };
}

export function buildFunnel(rows: DashboardSignal[]) {
  const stages = [
    ["Sessions", "discovery.session_started", false],
    ["Analysis started", "analysis.started", false],
    ["Analysis completed", "analysis.completed", true],
    ["Rewrite engaged", "workflow.rewrite_revealed", false],
    ["Purchase", "purchase.checkout_completed", true],
  ] as const;
  const funnel = stages.map(([label, name, authoritative]) => ({
    label,
    value: unique(rows.filter((row) => row.signal_name === name && (!authoritative || row.verified)), "session_id"),
  }));
  const rewriteJourneys = new Set(rows
    .filter((row) => row.signal_name === "workflow.rewrite_revealed")
    .map(journeyKey)
    .filter(isJourneyKey));
  const eligiblePurchases = new Set(rows
    .filter((row) => row.signal_name === "purchase.checkout_completed" && row.verified)
    .map(journeyKey)
    .filter(isJourneyKey)
    .filter((key) => rewriteJourneys.has(key)));
  funnel[funnel.length - 1].value = eligiblePurchases.size;
  return funnel;
}

export function buildHighlights(rows: DashboardSignal[]) {
  const snapshot = buildFounderSnapshot(rows);
  const highlights: string[] = [];
  if (!snapshot.sessions) return ["No production sessions were recorded in this period."];
  highlights.push(`${snapshot.completed} verified analyses completed from ${snapshot.starts} starts (${Math.round(snapshot.completionRate * 100)}%).`);
  const verifiedCompletions = rows.filter((row) => row.signal_name === "analysis.completed" && row.verified);
  const sources = verifiedCompletions.reduce<Record<string, number>>((totals, row) => {
    const source = String(row.properties?.source_mode ?? "unknown");
    totals[source] = (totals[source] ?? 0) + 1;
    return totals;
  }, {});
  const leading = Object.entries(sources).sort((a, b) => b[1] - a[1])[0];
  if (leading) highlights.push(`${leading[0]} was the most-completed analysis source (${leading[1]}).`);
  const attributionBySession = new Map(rows.filter((row) => row.signal_name === "discovery.session_started" && row.session_id).map((row) => [row.session_id, row.first_touch]));
  const campaigns = verifiedCompletions.reduce<Record<string, number>>((totals, row) => {
    const attribution = row.session_id ? attributionBySession.get(row.session_id) : undefined;
    const campaign = attribution?.utmCampaign ?? attribution?.metaCampaignId;
    if (typeof campaign === "string" && campaign) totals[campaign] = (totals[campaign] ?? 0) + 1;
    return totals;
  }, {});
  const topCampaign = Object.entries(campaigns).sort((a, b) => b[1] - a[1])[0];
  if (topCampaign) highlights.push(`${topCampaign[0]} supplied the most attributed sessions (${topCampaign[1]}).`);
  if (snapshot.purchases) highlights.push(`${snapshot.purchases} verified purchase outcomes were recorded.`);
  else highlights.push("No verified purchases were recorded in this period.");
  return highlights.slice(0, 4);
}

export function buildAnonymousStories(rows: DashboardSignal[], limit = 12) {
  const grouped = new Map<string, DashboardSignal[]>();
  for (const row of rows) {
    if (!row.visitor_id) continue;
    const list = grouped.get(row.visitor_id) ?? [];
    list.push(row);
    grouped.set(row.visitor_id, list);
  }
  return [...grouped.entries()]
    .map(([visitorId, events]) => ({
      visitorId,
      events: events.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
      lastSeen: events.reduce((latest, event) => event.occurred_at > latest ? event.occurred_at : latest, events[0].occurred_at),
    }))
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, limit);
}
