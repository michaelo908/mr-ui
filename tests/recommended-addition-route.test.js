/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { CADENCE_OPTIONS } = require('../lib/cadence.ts');
const { GRAVITON_GUIDANCE } = require('../lib/graviton-guidance.ts');
const { SOURCE_RESTRAINT_CONTRACT, RECOMMENDED_ADDITION_CONTRACT } = require('../lib/recommended-addition.ts');

// Run the real route with all network, lifecycle and telemetry boundaries replaced.
// No environment credentials or live services are read by this harness.
function harness() {
  const requests = [];
  const cache = new Map();
  const stubs = {
    'next/server': { after: () => {}, NextResponse: Response },
    '@/lib/signals/server': { recordSignal: () => {}, signalContextFromRequest: () => ({}) },
    '@/lib/lifecycle-server': { authenticatedLifecycle: () => { throw new Error('Unexpected lifecycle call'); } },
  };
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const loadedModule = { exports: {} };
    cache.set(file, loadedModule);
    const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const localRequire = (name) => {
      if (stubs[name]) return stubs[name];
      if (!name.startsWith('@/') && !name.startsWith('.')) throw new Error(`Unexpected dependency: ${name}`);
      const resolved = name.startsWith('@/') ? path.resolve(name.slice(2)) : path.resolve(path.dirname(file), name);
      return load(resolved.endsWith('.ts') ? resolved : resolved + '.ts');
    };
    vm.runInNewContext(source, {
      exports: loadedModule.exports, module: loadedModule, require: localRequire,
      process: { env: { MR_API_URL: 'https://analysis.invalid/test', MR_API_KEY: 'test-only' } },
      console: { log() {}, warn() {} }, Response,
      fetch: async (url, options) => {
        assert.equal(url, 'https://analysis.invalid/test');
        requests.push(JSON.parse(options.body));
        return Response.json({ output: 'Please share your views on the issues affecting our community by completing this survey today.' });
      },
    }, { filename: file });
    return loadedModule.exports;
  }
  return { requests, handle: load(path.resolve('app/api/mr/route.ts')).handleMrRequest };
}
const source = 'We invite you to complete our community survey and share your views about the issues affecting your neighbourhood. Please use the survey link to take part.';
const request = (body) => new Request('https://local.invalid/api/mr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: source, ...body }) });

test('every Cadence and Graviton receives diagnostic and source restraint on initial analysis', async () => {
  const { handle, requests } = harness();
  for (const cadence of CADENCE_OPTIONS.map(option => option.value)) {
    for (const selectedGraviton of Object.keys(GRAVITON_GUIDANCE)) {
      assert.equal((await handle(request({ cadence, selectedGraviton }))).status, 200);
      const sent = requests.at(-1);
      assert.ok(sent.context.includes(SOURCE_RESTRAINT_CONTRACT), `${cadence}: ${selectedGraviton}`);
      assert.ok(sent.context.includes(RECOMMENDED_ADDITION_CONTRACT));
      assert.equal(sent.cadence, cadence);
      assert.equal(sent.selectedGraviton, selectedGraviton);
    }
  }
});
test('repair and alternate paths retain restraint while requesting only rewritten copy', async () => {
  const { handle, requests } = harness();
  for (const cadence of CADENCE_OPTIONS.map(option => option.value)) {
    for (const requestKind of ['initial-rewrite-repair', 'alternate-rewrite']) {
      assert.equal((await handle(request({ cadence, requestKind, context: "## Editor's Summary\nRecommended Addition: verify who reads responses." }))).status, 200);
      const sent = requests.at(-1);
      assert.ok(sent.context.includes(SOURCE_RESTRAINT_CONTRACT));
      assert.match(sent.context, /REWRITE-ONLY CONTRACT/);
      assert.ok(!sent.context.includes(RECOMMENDED_ADDITION_CONTRACT));
    }
  }
});
test('text, image and rendered-page analyses receive the conditional diagnostic', async () => {
  const { handle, requests } = harness();
  for (const extra of [{}, { imageData: ['test-image'] }, { sourceMode: 'rendered-url', imageData: ['test-viewport'] }]) {
    await handle(request(extra));
    assert.ok(requests.at(-1).context.includes(RECOMMENDED_ADDITION_CONTRACT));
  }
});
test('sealed Heresy framing remains free of the new editorial diagnostic', async () => {
  const { handle, requests } = harness();
  await handle(request({ mode: 'mr_heresy' }));
  assert.ok(!requests[0].context.includes(SOURCE_RESTRAINT_CONTRACT));
  assert.ok(!requests[0].context.includes(RECOMMENDED_ADDITION_CONTRACT));
});
