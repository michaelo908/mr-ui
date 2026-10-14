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
  const landingSignal = read("components\/LandingSignal.tsx");
  assert.match(landingSignal, /discovery\.landing_viewed/);
  assert.match(landingSignal, /X-Gravitas-Test/);
  assert.match(landingSignal, /beforeInteractive/);
});

test("exclusion subscribers follow persisted changes and unsubscribe cleanly", () => {
  const ts = require("typescript");
  const vm = require("node:vm");
  const storage = new Map();
  const window = new EventTarget();
  const loadedModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(read("lib/signals/client.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module: loadedModule, exports: loadedModule.exports, window, Event,
    require: (name) => {
      assert.equal(name, "@/lib/meta-pixel");
      return { trackMetaSignal: () => {} };
    },
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  const client = loadedModule.exports;
  let changes = 0;
  const unsubscribe = client.subscribeSignalsBrowserExclusion(() => changes++);
  client.setSignalsBrowserExcluded(true);
  assert.equal(client.isSignalsBrowserExcluded(), true);
  assert.equal(changes, 1);
  storage.clear();
  const event = new Event("storage");
  Object.defineProperty(event, "key", { value: null });
  window.dispatchEvent(event);
  assert.equal(client.isSignalsBrowserExcluded(), false);
  assert.equal(changes, 2);
  unsubscribe();
  client.setSignalsBrowserExcluded(false);
  window.dispatchEvent(event);
  assert.equal(changes, 2);
});
