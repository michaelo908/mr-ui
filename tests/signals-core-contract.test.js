/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("signal registry provides one versioned contract across all five categories", () => {
  const registry = read("lib/signals/registry.ts");
  assert.match(registry, /SIGNAL_CONTRACT_VERSION = 1/);
  for (const category of ["discovery", "analysis", "engagement", "workflow", "purchase"]) {
    assert.match(registry, new RegExp(`category: "${category}"`));
  }
});

test("signal storage is append-only, indexed and inaccessible to browser roles", () => {
  const migration = read("supabase/migrations/202608060001_gravitas_signals.sql");
  assert.match(migration, /prevent_gravitas_signal_mutation/);
  assert.match(migration, /before update/);
  assert.match(migration, /before delete/);
  assert.match(migration, /before truncate/);
  assert.match(migration, /revoke all[\s\S]*anon, authenticated/);
  assert.match(migration, /dedupe_key/);
  assert.match(migration, /session_time_idx/);
  assert.match(migration, /user_time_idx/);
  assert.match(migration, /production_time_idx/);
});

test("database constraints reject malformed contracts and unsafe JSON shapes", () => {
  const migration = read("supabase/migrations/202608060001_gravitas_signals.sql");
  assert.match(migration, /signal_version > 0/);
  assert.match(migration, /signal_name ~ '\^\[a-z\]/);
  assert.match(migration, /split_part\(signal_name, '\.', 1\) = category/);
  assert.match(migration, /length\(dedupe_key\) between 1 and 240/);
  assert.match(migration, /jsonb_typeof\(properties\) = 'object'/);
  assert.match(migration, /pg_column_size\(properties\) <= 16384/);
  assert.match(migration, /pg_column_size\(first_touch\) <= 8192/);
  assert.match(migration, /pg_column_size\(last_touch\) <= 8192/);
  assert.match(migration, /where dedupe_key is not null/);
});

test("deduplication permits null keys and rejects repeated non-null keys", () => {
  const migration = read("supabase/migrations/202608060001_gravitas_signals.sql");
  assert.match(migration, /create unique index[\s\S]*\(dedupe_key\) where dedupe_key is not null/);
  assert.doesNotMatch(migration, /dedupe_key text not null/);
});

test("anonymous identity and first/last Meta attribution are canonical client context", () => {
  const client = read("lib/signals/client.ts");
  assert.match(client, /gravitasVisitorIdV1/);
  assert.match(client, /gravitasSessionIdV1/);
  assert.match(client, /gravitasFirstTouchV1/);
  assert.match(client, /gravitasLastTouchV1/);
  assert.match(client, /metaCampaignId/);
  assert.match(client, /metaAdSetId/);
  assert.match(client, /creativeHypothesis/);
});

test("public analytics is allowlisted, sanitized, non-blocking and failure-safe", () => {
  const api = read("app/api/signals/route.ts");
  const contracts = read("lib/signals/contracts.ts");
  const server = read("lib/signals/server.ts");
  assert.match(api, /isClientSignalName/);
  assert.match(api, /sanitizeClientSignalProperties/);
  assert.match(api, /consumeSignalRateLimit/);
  assert.match(api, /status: 429/);
  assert.match(api, /status: 202/);
  assert.match(api, /after\(\(\) => recordSignal/);
  assert.match(contracts, /sanitizeSignalProperties/);
  assert.match(contracts, /sanitizeAttribution/);
  assert.match(server, /catch \(error\)[\s\S]*return false/);
});

test("rate limiting uses service-role RPC and stores only rotating HMAC buckets", () => {
  const migration = read("supabase/migrations/202608060001_gravitas_signals.sql");
  const server = read("lib/signals/server.ts");
  assert.match(migration, /consume_gravitas_signal_rate_limit/);
  assert.match(migration, /request_count[\s\S]*on conflict/);
  assert.match(migration, /interval '2 days'/);
  assert.match(server, /SIGNALS_RATE_LIMIT_SECRET/);
  assert.match(server, /p_limit: 120/);
});

test("analysis completion and purchase outcomes come from authoritative server paths", () => {
  const mr = read("app/api/mr/route.ts");
  const webhook = read("app/api/stripe/webhook/route.ts");
  assert.match(mr, /verifiedCompletion[\s\S]*analysis\.completed/);
  assert.match(mr, /verified: true/);
  assert.match(webhook, /stripe\.webhooks\.constructEvent/);
  assert.match(webhook, /purchase\.checkout_completed/);
  assert.match(webhook, /purchase\.day_pass_completed/);
  assert.match(webhook, /isTest: !event\.livemode/);
  assert.match(webhook, /stripeAttribution/);
  const checkout = read("app/api/stripe/checkout/route.ts");
  assert.match(checkout, /attributionMetadata\("ft"/);
  assert.match(checkout, /attributionMetadata\("lt"/);
});

test("Founder Dashboard exposes windows, funnel, highlights and anonymous stories", () => {
  const page = read("app/founder/page.tsx");
  assert.match(page, /Founder Snapshot/);
  assert.match(page, /\[1, 7, 30\]/);
  assert.match(page, /Funnel/);
  assert.match(page, /Highlights/);
  assert.match(page, /Anonymous user stories/);
  assert.match(page, /FOUNDER_EMAILS/);
});
