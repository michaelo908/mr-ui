/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
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
