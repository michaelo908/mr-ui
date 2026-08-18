/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const migration = fs.readFileSync(
  path.join(root, "supabase/migrations/202608190001_subscriptions.sql"),
  "utf8"
);

test("subscriptions migration captures the production schema contract", () => {
  assert.match(migration, /create table if not exists public\.subscriptions/);
  assert.match(migration, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(migration, /user_id uuid unique references auth\.users\(id\) on delete cascade/);
  assert.match(migration, /stripe_customer_id text/);
  assert.match(migration, /stripe_subscription_id text/);
  assert.match(migration, /status text/);
  assert.match(migration, /created_at timestamptz default now\(\)/);
  assert.match(migration, /idx_subscriptions_user_id/);
});

test("subscriptions migration preserves production RLS and grants", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /policy subscriptions_select_own/);
  assert.match(migration, /for select[\s\S]*to authenticated[\s\S]*auth\.uid\(\) = user_id/);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.match(
      migration,
      new RegExp(`grant select, insert, update, delete, truncate, references, trigger[\\s\\S]*to ${role}`)
    );
  }
  assert.doesNotMatch(migration, /insert into|copy public\.subscriptions/i);
});
