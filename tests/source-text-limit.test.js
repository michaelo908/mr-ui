/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
const limits = require('../lib/source-text-limit.ts');
const { buildAnalysisInput } = require('../lib/gravitas-analysis-request.ts');

function loadRoute() {
  const source = fs.readFileSync('app/api/mr/route.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const calls = [];
  const exports = {};
  vm.runInNewContext(code, {
    exports, Request, Response, console: { log() {}, warn() {} },
    process: { env: { MR_API_URL: 'https://staging.invalid/generate', MR_API_KEY: 'test-only' } },
    fetch: async (_url, options) => { calls.push(JSON.parse(options.body)); return Response.json({ output: 'The harbour committee opened the hall to residents on Tuesday. They reviewed the repair plan, checked the survey findings and recorded the questions that still needed answers. The next meeting would consider those findings before any decision about the bridge.' }); },
    require: (name) => {
      if (name === 'next/server') return { NextResponse: Response, after() {} };
      if (name === '@/lib/source-text-limit') return limits;
      if (name === '@/lib/signals/server') return { signalContextFromRequest: () => ({}) };
      if (name === '@/lib/lifecycle-server') return { authenticatedLifecycle: async () => ({ lifecycle: { state: 'active' } }) };
      if (name === '@/lib/editor-summary') return { EDITOR_SUMMARY_CONTRACT: '', assessEditorSummary: () => ({ violations: [] }) };
      return require(`../${name.replace('@/', '')}.ts`);
    },
  });
  return { ...exports, calls };
}
const request = body => new Request('https://staging.invalid/api/mr', { method: 'POST', body: JSON.stringify(body) });

for (const length of [30000, 30001, 59999, 60000, 60001]) {
  test(`client and server source boundary: ${length}`, async () => {
    const raw = 'a'.repeat(length);
    assert.equal(limits.exceedsSourceTextLimit(raw), length > 60000);
    for (const selectedGraviton of ['Full Analysis', 'Narrative Focus']) {
      const input = buildAnalysisInput({ inputMode: 'text', raw, selectedGraviton, imageCount: 0 });
      for (const requestKind of [undefined, 'alternate-rewrite', 'initial-rewrite-repair']) {
        const route = loadRoute();
        const response = await route.handleMrRequest(request({ input, selectedGraviton, requestKind }));
        assert.equal(response.status, length > 60000 ? 413 : 200);
        assert.equal(route.calls.length, length > 60000 ? 0 : 1);
        if (length <= 60000) assert.equal(route.calls[0].input, input);
        else assert.equal((await response.json()).error, limits.SOURCE_TEXT_LIMIT_ERROR);
      }
    }
  });
}

test('Heresy context source is checked without counting application instructions', async () => {
  for (const length of [60000, 60001]) {
    for (const marker of ['text', 'source']) {
      const route = loadRoute();
      const response = await route.handleMrRequest(request({ mode: 'mr_heresy', input: ' ', context: `Instructions\n\nApply Multirrupt Mode to the following ${marker}:\n\n${'a'.repeat(length)}` }));
      assert.equal(response.status, length > 60000 ? 413 : 200);
    }
  }
});

test('Jump-In retains 3,000-word entitlement below the character cap', async () => {
  for (const words of [3000, 3001]) {
    const route = loadRoute();
    const input = Array(words).fill('word').join(' ');
    const response = await route.handleMrRequest(request({ input, entitlementSourceText: input }), { maxPastedTextWords: 3000 });
    assert.equal(response.status, words > 3000 ? 400 : 200);
    assert.equal(route.calls.length, words > 3000 ? 0 : 1);
  }
});

test('UI and document extraction share the source limit and error', () => {
  assert.match(fs.readFileSync('components/GravitasApp.tsx', 'utf8'), /exceedsSourceTextLimit\(raw\)/);
  assert.match(fs.readFileSync('lib/document-upload.ts', 'utf8'), /SOURCE_TEXT_MAX_CHARACTERS as DOCUMENT_MAX_CHARACTERS/);
  assert.match(fs.readFileSync('app/api/documents/extract/route.ts', 'utf8'), /error: SOURCE_TEXT_LIMIT_ERROR/);
  assert.equal(limits.exceedsSourceTextLimit('😀'.repeat(30000)), false);
  assert.equal(limits.exceedsSourceTextLimit('😀'.repeat(30001)), true);
});
