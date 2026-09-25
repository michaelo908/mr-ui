/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("a browser can mark its own Signals activity as test/demo", () => {
  const client = read("lib/signals/client.ts");
  const api = read("app/api/signals/route.ts");
  const server = read("lib/signals/server.ts");
  const dashboard = read("app/signals/page.tsx");

  assert.match(client, /SIGNALS_BROWSER_EXCLUSION_KEY/);
  assert.match(client, /X-Gravitas-Test/);
  assert.match(api, /x-gravitas-test/);
  assert.match(server, /x-gravitas-test/);
  assert.match(dashboard, /SignalsBrowserExclusion/);
  assert.match(dashboard, /✓ Test\/demo included/);
  assert.match(read("components\/SignalsBrowserExclusion.tsx"), /✓ This browser is excluded/);
});
