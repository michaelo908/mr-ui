/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getVisualEvidenceImages, getVisualEvidenceImageByNumber,
  getViewportImageByNumber, parseViewportReferenceTokens,
  extractViewportNumbersFromTokens, buildRecommendationViewportLaunch,
} = require("../lib/narrative-performance.ts");
const uploads = [
  { id: "second", role: "uploaded-image", order: 1 },
  { id: "first", role: "uploaded-image", order: 0 },
];

function loadComponent(name) {
  const fs = require("node:fs");
  const path = require("node:path");
  const Module = require("node:module");
  const ts = require("typescript");
  const filename = path.resolve(__dirname, `../components/${name}.tsx`);
  const compiled = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = module.paths;
  mod.require = (id) => id.startsWith("@/")
    ? require(path.resolve(__dirname, "..", `${id.slice(2)}.ts`)) : require(id);
  mod._compile(compiled, filename);
  return mod.exports.default;
}

test("rendered upload recommendations and inline citations launch contextual image evidence", () => {
  const Panel = loadComponent("NarrativePerformancePanel");
  const Lightbox = loadComponent("ImageLightbox");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const images = uploads.map(i => ({ ...i, type: "image", title: i.id, dataUrl: "data:image/png;base64,AA==" }));
  let launch;
  const element = Panel({
    performance: { observations: [], recommendations: [{ action: "Protect", body: "Viewport 2 explains the gap." }] },
    images, onOpenViewport() {}, onOpenRecommendation(value) { launch = value; },
  });
  const buttons = [];
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit);
    if (!node || !node.props) return;
    if (node.type === "button") buttons.push(node);
    visit(node.props.children);
  }
  visit(element);
  const bullet = buttons.find(b => b.props["aria-label"] === "Open Protect recommendation evidence");
  assert.equal(bullet.props.disabled, false);
  bullet.props.onClick();
  assert.equal(launch.startingViewport, 2);
  const inline = buttons.find(b => b.props["aria-label"] === "Open image 2");
  assert.ok(inline);
  inline.props.onClick();
  const html = renderToStaticMarkup(React.createElement(Lightbox, {
    images: getVisualEvidenceImages(images), activeIndex: 1, context: launch.context,
    onChange() {}, onClose() {},
  }));
  assert.match(html, /PROTECT — IMAGE 2/);
  assert.match(html, /Recommendation evidence images/);
  assert.match(html, /Show evidence image 2/);
});

test("uploaded image citations and legacy viewport wording both launch exact evidence", () => {
  for (const body of ["Image 2 explains the gap.", "Viewport 2 explains the gap."]) {
    const launch = buildRecommendationViewportLaunch({ action: "Protect", body }, uploads, 2);
    assert.equal(launch.startingViewport, 2);
    assert.deepEqual(launch.context.viewportNumbers, [2]);
    assert.equal(getVisualEvidenceImageByNumber(uploads, 2).id, "second");
    assert.equal(launch.context.recommendation, body);
    assert.equal(launch.context.action, "Protect");
  }
});

test("uploaded reference ranges, labels and invalid numbers are handled safely", () => {
  const tokens = parseViewportReferenceTokens("Viewports 1–2 and Image 9.", "image");
  assert.equal(tokens.map(t => t.text).join(""), "Images 1–2 and Image 9.");
  assert.deepEqual(extractViewportNumbersFromTokens(tokens), [1, 2, 9]);
  const rec = { action: "Reduce", body: "Images 1–2 and Image 9." };
  assert.deepEqual(buildRecommendationViewportLaunch(rec, uploads, 1).context.viewportNumbers, [1, 2]);
  for (const number of [0, -1, 1.5, 3, NaN, Infinity]) {
    assert.equal(getVisualEvidenceImageByNumber(uploads, number), null);
    assert.equal(buildRecommendationViewportLaunch(rec, uploads, number), null);
  }
});

test("URL references never resolve to an uploaded image in a mixed collection", () => {
  const viewport = { id: "page", role: "viewport", order: 5 };
  const mixed = [...uploads, viewport];
  assert.deepEqual(getVisualEvidenceImages(mixed), [viewport]);
  assert.equal(getVisualEvidenceImageByNumber(mixed, 1).id, "page");
  assert.equal(getVisualEvidenceImageByNumber(mixed, 2), null);
  assert.equal(getViewportImageByNumber(uploads, 1), null);
  assert.equal(buildRecommendationViewportLaunch({ action: "Protect", body: "Image 1." }, mixed, 1), null);
});

test("legacy uploads retain stable order without modifying source roles", () => {
  const legacy = [{ id: "b", order: 2 }, { id: "a", order: 0 }];
  assert.equal(getVisualEvidenceImageByNumber(legacy, 1).id, "a");
  assert.equal(legacy[0].id, "b");
  assert.equal(legacy[0].role, undefined);
  assert.equal(getVisualEvidenceImageByNumber([], 1), null);
});
