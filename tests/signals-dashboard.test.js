/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildAnonymousStories,
  buildFounderSnapshot,
  buildFunnel,
  buildHighlights,
  getDashboardWindowStart,
  paginateDashboardSignals,
} = require("../lib/signals/dashboard.ts");

const row = (id, signal_name, session_id, visitor_id = "visitor-a", extra = {}) => ({
  id, signal_name, session_id, visitor_id, occurred_at: `2026-08-0${id}T00:00:00Z`,
  surface: "jump-in", verified: signal_name === "analysis.completed" || signal_name.startsWith("purchase."),
  is_test: false, properties: {}, first_touch: {}, last_touch: {}, ...extra,
});

const rows = [
  row("1", "discovery.session_started", "session-a"),
  row("2", "analysis.started", "session-a"),
  row("3", "analysis.completed", "session-a", "visitor-a", { properties: { source_mode: "url" } }),
  row("4", "workflow.rewrite_revealed", "session-a"),
  row("5", "purchase.checkout_completed", "session-a"),
  row("6", "discovery.session_started", "session-b", "visitor-b"),
  row("7", "analysis.started", "session-b", "visitor-b"),
];

test("Founder Snapshot counts distinct people and verified outcomes", () => {
  assert.deepEqual(buildFounderSnapshot(rows), {
    visitors: 2, sessions: 2, starts: 2, completed: 1, rewrites: 1,
    purchases: 1, completionRate: 0.5, purchaseRate: 1,
  });
});

test("purchase-after-analysis counts distinct eligible journeys and never exceeds 100%", () => {
  const repeatedPurchases = [
    ...rows,
    row("8", "purchase.checkout_completed", "checkout-session-a", "visitor-a"),
    row("9", "purchase.checkout_completed", "checkout-only-session", "visitor-c"),
  ];
  const snapshot = buildFounderSnapshot(repeatedPurchases);
  assert.equal(snapshot.purchases, 3);
  assert.equal(snapshot.purchaseRate, 1);
});

test("funnel uses distinct sessions at each canonical stage", () => {
  assert.deepEqual(buildFunnel(rows).map(({ value }) => value), [2, 2, 1, 1, 1]);
});

test("funnel purchase stage counts only distinct rewrite-eligible journeys", () => {
  const repeatedPurchases = [
    ...rows,
    row("8", "purchase.checkout_completed", "checkout-session-a", "visitor-a"),
    row("9", "purchase.checkout_completed", "checkout-only-session", "visitor-c"),
  ];
  assert.deepEqual(buildFunnel(repeatedPurchases).map(({ value }) => value), [2, 2, 1, 1, 1]);
});

test("highlights are concise and derived only from the selected rows", () => {
  const highlights = buildHighlights(rows);
  assert.ok(highlights.length <= 4);
  assert.match(highlights.join(" "), /1 verified analyses completed from 2 starts/);
  assert.match(highlights.join(" "), /url was the most-completed/);
});

test("anonymous stories preserve ordered event journeys without source content", () => {
  const stories = buildAnonymousStories(rows);
  const first = stories.find((story) => story.visitorId === "visitor-a");
  assert.deepEqual(first.events.map((event) => event.signal_name), [
    "discovery.session_started", "analysis.started", "analysis.completed",
    "workflow.rewrite_revealed", "purchase.checkout_completed",
  ]);
  assert.equal(JSON.stringify(stories).includes("sourceContent"), false);
});

test("dashboard pagination returns more than 10,000 signals without truncation", async () => {
  const source = Array.from({ length: 10_503 }, (_, index) => index);
  const result = await paginateDashboardSignals((from, to) => Promise.resolve(source.slice(from, to + 1)), 1000);
  assert.equal(result.length, 10_503);
  assert.equal(result.at(-1), 10_502);
});

test("authoritative funnel, highlights and snapshot ignore unverified completions and purchases", () => {
  const poisoned = [
    ...rows,
    row("8", "analysis.completed", "session-b", "visitor-b", { verified: false, properties: { source_mode: "images" } }),
    row("9", "purchase.checkout_completed", "session-b", "visitor-b", { verified: false }),
  ];
  assert.equal(buildFounderSnapshot(poisoned).completed, 1);
  assert.deepEqual(buildFunnel(poisoned).map(({ value }) => value), [2, 2, 1, 1, 1]);
  assert.doesNotMatch(buildHighlights(poisoned).join(" "), /images was the most-completed/);
});

test("Today begins at Melbourne midnight while 7 and 30 days remain rolling windows", () => {
  const now = new Date("2026-08-06T06:30:00.000Z");
  assert.equal(getDashboardWindowStart(1, now).toISOString(), "2026-08-05T14:00:00.000Z");
  assert.equal(getDashboardWindowStart(7, now).toISOString(), "2026-07-30T06:30:00.000Z");
  assert.equal(getDashboardWindowStart(30, now).toISOString(), "2026-07-07T06:30:00.000Z");
});
