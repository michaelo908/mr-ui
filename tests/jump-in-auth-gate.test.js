/* eslint-disable @typescript-eslint/no-require-imports */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const secret = 'unit-test-secret-not-a-real-credential';
const duration = 20 * 60 * 1000;
const reset = 7 * 24 * 60 * 60 * 1000;

function harness() {
  const jar = new Map();
  const calls = [];
  const written = [];
  class NextResponse extends Response {
    constructor(body, options) {
      super(body, options);
      this.cookies = { set(name, value, options) { jar.set(name, value); written.push({ name, value, options }); } };
    }
    static json(body, options) { return new NextResponse(JSON.stringify(body), options); }
  }
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const module = { exports: {} };
    cache[file] = module.exports;
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    function localRequire(name) {
      if (name === 'next/server') return { NextResponse };
      if (name === 'next/headers') return { cookies: async () => ({ get: (key) => jar.has(key) ? { value: jar.get(key) } : undefined }) };
      if (name === '@/app/api/mr/route') return { handleMrRequest: async (req, limits) => { calls.push({ body: await req.json(), limits }); return NextResponse.json({ output: 'complete analysis and rewrite' }); } };
      if (name === '@/app/api/sources/url/route') return { handleUrlSourceRequest: async (req, limit) => { calls.push({ captureLimit: limit }); return Response.json({ captured: true }); } };
      if (name === '@/lib/jump-in-token') return require('../lib/jump-in-token.js');
      if (name.startsWith('@/')) return load(name.slice(2) + '.ts');
      return require(name);
    }
    vm.runInNewContext(source, { module, exports: module.exports, require: localRequire, Response, Request, URL, Date, crypto: { randomUUID }, console: { log() {} }, process: { env: { JUMP_IN_SESSION_SECRET: secret, NODE_ENV: 'production' } } });
    return module.exports;
  }
  const start = load('app/api/jump-in/start/route.ts').POST;
  const analysis = load('app/api/jump-in/mr/route.ts').POST;
  const capture = load('app/api/jump-in/sources/url/route.ts').POST;
  const tokens = load('lib/jump-in-server.ts');
  const request = (body = {}, origin = 'https://staging.example') => new Request('https://staging.example/api/jump-in/mr', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { jar, calls, written, start, analysis, capture, tokens, request };
}

test('anonymous visitor starts a signed session and receives analysis plus repeated rewrite access', async () => {
  const h = harness();
  assert.equal((await h.analysis(h.request())).status, 401);
  assert.equal(h.calls.length, 0);
  const started = await h.start(h.request());
  assert.equal(started.status, 200);
  const time = Number(started.headers.get('X-Jump-In-Started-At'));
  const cookie = h.written[0];
  assert.equal(cookie.options.httpOnly, true);
  assert.equal(cookie.options.secure, true);
  assert.equal(cookie.options.sameSite, 'lax');
  assert.equal(cookie.options.maxAge, reset / 1000);
  for (const requestKind of ['analysis', 'initial-rewrite-repair', 'alternate-rewrite']) {
    const result = await h.analysis(h.request({ requestKind }));
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('X-Jump-In-Started-At'), String(time));
    assert.equal(result.headers.get('X-Jump-In-Preview'), null);
  }
  assert.equal(h.calls.length, 3);
  assert.equal(h.calls[0].limits.maxPastedTextWords, 3000);
  assert.equal(h.calls[0].limits.maxUrlViewports, 10);
  await h.start(h.request());
  assert.equal(h.written.length, 1, 'reopening must not extend or replace the session');
  assert.equal((await h.capture(h.request())).status, 200);
  assert.equal(h.calls.at(-1).captureLimit, 10);
});

test('expired sessions block analysis, rewrites, capture and restart until the weekly reset', async () => {
  const h = harness();
  const began = Date.now() - duration - 1000;
  h.jar.set('gravitas_jump_in', h.tokens.createJumpInToken(began, randomUUID()));
  for (const route of [h.start, h.analysis, h.capture]) {
    const res = await route(h.request({ requestKind: 'alternate-rewrite' }));
    assert.equal(res.status, 403);
    assert.equal((await res.json()).expired, true);
  }
  assert.equal(h.calls.length, 0);
  h.jar.set('gravitas_jump_in', h.tokens.createJumpInToken(Date.now() - reset - 1000, randomUUID()));
  assert.equal((await h.start(h.request())).status, 200);
  assert.equal((await h.analysis(h.request())).status, 200);
});

test('legacy preview migrates without resetting its clock; tampered cookies cannot analyse', async () => {
  const h = harness();
  const began = Date.now() - 120000;
  h.jar.set('gravitas_jump_in_preview', h.tokens.createJumpInToken(began, randomUUID()));
  const res = await h.start(h.request());
  assert.equal(Number(res.headers.get('X-Jump-In-Started-At')), began);
  assert.equal(h.written[0].options.expires.getTime(), began + reset);
  assert.ok(h.written[0].options.maxAge < reset / 1000);
  h.jar.set('gravitas_jump_in', 'tampered');
  assert.equal((await h.analysis(h.request())).status, 401);
  assert.equal(h.calls.length, 0);
});

test('cross-origin calls cannot create sessions or consume analysis/capture', async () => {
  const h = harness();
  for (const route of [h.start, h.analysis, h.capture]) assert.equal((await route(h.request({}, 'https://attacker.example'))).status, 403);
  assert.equal(h.calls.length, 0);
  assert.equal(h.written.length, 0);
});

test('the paid API retains authentication and entitlement checks; no preview gate remains', () => {
  const paid = fs.readFileSync(path.join(root, 'app/api/mr/route.ts'), 'utf8');
  assert.match(paid, /if \(!access\).*status: 401/);
  assert.match(paid, /status: 403/);
  const app = fs.readFileSync(path.join(root, 'components/GravitasApp.tsx'), 'utf8');
  assert.doesNotMatch(app, /previewUnlockRequired|isAnonymousPreview|preview-unlock-title/);
  assert.match(app, /Register or sign in \(optional\)/);
});
