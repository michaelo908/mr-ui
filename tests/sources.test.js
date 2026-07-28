/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractHtmlImageCandidates,
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

test("extracts meaningful relative and protocol-relative image URLs", () => {
  const html = `
    <img src="/images/hero.jpg" alt="Product in use" width="1200" height="800">
    <img src="//cdn.example.com/gallery/second.webp" alt=" Second view ">
    <img src="/icons/menu.png" width="24" height="24">
    <img src="data:image/png;base64,abc">
    <img src="/images/hero.jpg" alt="duplicate">
  `;

  assert.deepEqual(
    extractHtmlImageCandidates(html, "https://example.com/products/item"),
    [
      {
        url: "https://example.com/images/hero.jpg",
        altText: "Product in use",
        order: 0,
      },
      {
        url: "https://cdn.example.com/gallery/second.webp",
        altText: "Second view",
        order: 1,
      },
    ]
  );
});

test("uses lazy and srcset image sources when src is absent", () => {
  const html = `
    <img src="data:image/gif;base64,abc" data-src="../photos/lazy.jpg" alt="Lazy image">
    <img srcset="/photos/small.jpg 480w, /photos/large.jpg 1200w">
  `;

  assert.deepEqual(
    extractHtmlImageCandidates(html, "https://example.com/articles/post/"),
    [
      {
        url: "https://example.com/articles/photos/lazy.jpg",
        altText: "Lazy image",
        order: 0,
      },
      {
        url: "https://example.com/photos/small.jpg",
        altText: undefined,
        order: 1,
      },
    ]
  );
});
