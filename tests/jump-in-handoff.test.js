const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("embedded Jump In hands pending work to a first-party editor before login", () => {
  const editor = read("components/GravitasApp.tsx");
  const handoff = read("app/api/jump-in/handoff/route.ts");

  assert.match(editor, /if \(window\.top !== window\)/);
  assert.match(editor, /fetch\("\/api\/jump-in\/handoff"/);
  assert.match(editor, /window\.open\(destination\.toString\(\), "_top"\)/);
  assert.match(editor, /window\.history\.replaceState\(\{\}, "", "\/jump-in"\)/);
  assert.match(handoff, /JUMP_IN_HANDOFF_MAX_BYTES/);
  assert.match(handoff, /too_many_requests/);
});

test("handoffs are short-lived, opaque, service-role-only and single-use", () => {
  const server = read("lib/jump-in-handoff-server.ts");
  const migration = read("supabase/migrations/202609180001_jump_in_handoffs.sql");

  assert.match(server, /randomBytes\(32\)/);
  assert.match(server, /secret_hash/);
  assert.match(server, /consumed_at/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.gravitas_jump_in_handoffs/);
  assert.match(migration, /grant select, insert, update, delete on public\.gravitas_jump_in_handoffs to service_role/);
});
