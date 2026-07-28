/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildRenderedUrlAnalysisInput,
  calculateViewportPositions,
  extractHtmlTitle,
  stripHtmlToReadableText,
} = require("../lib/sources.ts");

test("extracts readable main content and removes scripts", () => {
  const html = `
    <html>
      <head><title>Useful &amp; Clear</title><script>ignore()</script></head>
      <body><nav>Navigation</nav><main><h1>Hello</h1><p>First paragraph.</p>
      <p>Second&nbsp;paragraph.</p></main></body>
    </html>`;

  assert.equal(extractHtmlTitle(html), "Useful & Clear");
  assert.equal(
    stripHtmlToReadableText(html),
    "Hello\nFirst paragraph.\n\nSecond paragraph."
  );
});

test("falls back to body content when main is absent", () => {
  const html = `<body><article><p>Article text.</p></article></body>`;
  assert.equal(stripHtmlToReadableText(html), "Article text.");
});

test("captures short pages as ordered contiguous viewports including the exit", () => {
  assert.deepEqual(calculateViewportPositions(1900, 800, 10), [0, 800, 1100]);
});

test("samples long pages from opening to exit without duplicate offsets", () => {
  const positions = calculateViewportPositions(20_000, 800, 10);
  assert.equal(positions.length, 10);
  assert.equal(positions[0], 0);
  assert.equal(positions.at(-1), 19_200);
  assert.equal(new Set(positions).size, positions.length);
  assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
});

test("rendered URL prompt makes viewports primary and text supporting only", () => {
  const input = buildRenderedUrlAnalysisInput("Menu\nHard-to-read heading", "Full Analysis");
  assert.match(input, /sole primary evidence/i);
  assert.match(input, /supporting legibility assistance only/i);
  assert.match(input, /Do not use it to infer page structure/i);
  assert.match(input, /Hard-to-read heading/);
});
