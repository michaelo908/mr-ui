/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  extractViewportNumbers,
  buildRecommendationLightboxContext,
  buildRecommendationViewportLaunch,
  getViewportImageByNumber,
  parseNarrativePerformance,
} = require("../lib/narrative-performance.ts");

test("parses supported observations and evidence-grounded recommendations", () => {
  const parsed = parseNarrativePerformance(`
- **Decision Readiness:** The offer is understandable before the first CTA.
- **Primary Narrative Drag:** Viewports 6 and 9 repeat the mechanism.

- 🟢 **Protect** — Viewport 2 states the central promise in concrete language. It gives the reader an immediate reason to continue. Keep this promise in the opening sequence.
- 🟡 **Consolidate** — Viewports 6 and 9 explain the same mechanism. The repetition slows progression after the mechanism is understood. Retain viewport 6 and move the unique proof beneath it.
- 🔴 **Reduce** — The final qualification block repeats established context. It delays the decision after sufficient evidence has accumulated. Compress it to the one condition the reader still needs.
`);

  assert.deepEqual(parsed.observations, [
    {
      label: "Decision Readiness",
      value: "The offer is understandable before the first CTA.",
    },
    {
      label: "Primary Narrative Drag",
      value: "Viewports 6 and 9 repeat the mechanism.",
    },
  ]);
  assert.equal(parsed.recommendations.length, 3);
  assert.equal(parsed.recommendations[1].action, "Consolidate");
});

test("omits unsupported labels, malformed recommendations, and entries over five", () => {
  const parsed = parseNarrativePerformance(`
- **Attention:** Strong
- **Recommended Structure:** Promise, mechanism, proof, decision.
- 🔵 **Introduce** — Proof is absent. The claim remains unsupported. Add one specific customer outcome.
- 🟢 **Protect** — Too short.
- 🔴 **Reduce** — A. B. C.
- 🔴 **Reduce** — D. E. F.
- 🔴 **Reduce** — G. H. I.
- 🔴 **Reduce** — J. K. L.
- 🔴 **Reduce** — M. N. O.
`);

  assert.deepEqual(parsed.observations, [
    {
      label: "Recommended Structure",
      value: "Promise, mechanism, proof, decision.",
    },
  ]);
  assert.equal(parsed.recommendations.length, 5);
});

test("returns null rather than manufacturing an empty panel", () => {
  assert.equal(parseNarrativePerformance("Generic advice goes here."), null);
});

test("extracts singular and grouped viewport references in reading order", () => {
  assert.deepEqual(
    extractViewportNumbers(
      "Viewport 2 establishes the promise. Viewports 6, 9 and 10 repeat it. Viewport 2 closes the loop."
    ),
    [2, 6, 9, 10]
  );
});

test("maps viewport numbers by stored order and rejects invalid references", () => {
  const images = [
    { id: "upload", role: "uploaded-image", order: 0 },
    { id: "third", role: "viewport", order: 20 },
    { id: "first", role: "viewport", order: 0 },
    { id: "second", role: "viewport", order: 10 },
  ];

  assert.equal(getViewportImageByNumber(images, 1).id, "first");
  assert.equal(getViewportImageByNumber(images, 3).id, "third");
  assert.equal(getViewportImageByNumber(images, 4), null);
  assert.equal(getViewportImageByNumber(images, 0), null);
});

test("recommendation context preserves its own action and valid evidence set", () => {
  const images = Array.from({ length: 5 }, (_, index) => ({
    id: `viewport-${index + 1}`,
    role: "viewport",
    order: index,
  }));
  const context = buildRecommendationLightboxContext(
    {
      action: "Consolidate",
      body: "Viewports 2, 3 and 4 repeat the mechanism. The repetition slows progression. Retain viewport 2 and merge the unique proof beneath it.",
    },
    images
  );

  assert.deepEqual(context, {
    action: "Consolidate",
    color: "#FACC15",
    emoji: "🟡",
    recommendation:
      "Viewports 2, 3 and 4 repeat the mechanism. The repetition slows progression. Retain viewport 2 and merge the unique proof beneath it.",
    viewportNumbers: [2, 3, 4],
  });
});

test("each recommendation keeps independent context for a shared viewport", () => {
  const images = Array.from({ length: 4 }, (_, index) => ({
    id: `viewport-${index + 1}`,
    role: "viewport",
    order: index,
  }));
  const protect = buildRecommendationLightboxContext(
    {
      action: "Protect",
      body: "Viewport 3 carries the clearest proof. It gives the claim credibility. Keep it adjacent to the promise.",
    },
    images
  );
  const reduce = buildRecommendationLightboxContext(
    {
      action: "Reduce",
      body: "Viewports 3 and 4 repeat the proof. The second pass delays the decision. Remove the repeated explanation in viewport 4.",
    },
    images
  );

  assert.equal(protect.action, "Protect");
  assert.deepEqual(protect.viewportNumbers, [3]);
  assert.equal(reduce.action, "Reduce");
  assert.deepEqual(reduce.viewportNumbers, [3, 4]);
});

test("recommendation launch is one payload containing context and clicked viewport", () => {
  const images = Array.from({ length: 5 }, (_, index) => ({
    id: `viewport-${index + 1}`,
    role: "viewport",
    order: index,
  }));
  const recommendation = {
    action: "Consolidate",
    body: "Viewports 2, 3 and 4 repeat the mechanism. The repetition slows progression. Retain viewport 2 and merge the unique proof beneath it.",
  };

  const launch = buildRecommendationViewportLaunch(
    recommendation,
    images,
    3
  );

  assert.equal(launch.startingViewport, 3);
  assert.equal(launch.context.action, "Consolidate");
  assert.equal(launch.context.color, "#FACC15");
  assert.equal(launch.context.emoji, "🟡");
  assert.equal(launch.context.recommendation, recommendation.body);
  assert.deepEqual(launch.context.viewportNumbers, [2, 3, 4]);
});

test("recommendation launch refuses an index-only viewport outside its context", () => {
  const images = Array.from({ length: 5 }, (_, index) => ({
    id: `viewport-${index + 1}`,
    role: "viewport",
    order: index,
  }));
  const launch = buildRecommendationViewportLaunch(
    {
      action: "Reduce",
      body: "Viewports 2 and 3 repeat the proof. The second pass delays the decision. Remove the repeated explanation.",
    },
    images,
    5
  );

  assert.equal(launch, null);
});

test("expands compact viewport ranges into the complete evidence set", () => {
  assert.deepEqual(extractViewportNumbers("Viewports 2–5 repeat the proof."), [
    2, 3, 4, 5,
  ]);
});
