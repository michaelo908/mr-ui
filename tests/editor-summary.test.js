/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  assessEditorSummary,
  extractEditorSummary,
} = require("../lib/editor-summary.ts");

const revisedExamples = {
  landingPageUrl: `
• Featured Products feels too promotional and distracts from the buying journey.
• Too many equal choices make it difficult to know where to begin.
• Important proof appears too late, so trust builds slowly.
• Several sections repeat the same message without adding value.`,
  commercialCopy: `
• The offer lists many capabilities before establishing the main customer benefit.
• Four equal plans make the first decision feel unnecessarily difficult.
• The discount arrives before enough proof has established value.
• The product list competes with the primary free-trial action.`,
  proposalReport: `
• The proposal delays its central recommendation until after extensive background detail.
• Responsibilities remain unclear across the client and delivery teams.
• The strongest supporting result appears near the end of the report.
• Several sections restate the project objective without advancing the decision.`,
  imageAnalysis: `
• The headline is difficult to notice against the dominant product image.
• Three calls to action compete for attention in the opening view.
• Small proof text is visually separated from the main claim.
• The pricing badge attracts attention before the product benefit is clear.`,
  gravitons: `
• The opening gives background before showing visitors what they can achieve.
• The main claim is repeated without additional proof.
• The strongest credibility signal appears after the primary action.
• The ending presents several next steps with equal emphasis.`,
};

test("revised summaries are rapid findings for representative source types", () => {
  for (const [sourceType, summary] of Object.entries(revisedExamples)) {
    const assessment = assessEditorSummary(summary);
    assert.deepEqual(
      assessment.violations,
      [],
      `${sourceType}: ${assessment.violations.join(", ")}`
    );
    assert.ok(assessment.bullets.every((bullet) => !bullet.includes(":")));
  }
});

test("dense before examples fail the scan-first summary contract", () => {
  const before = `
• **Promo-led interruption:** Price-led banners pull attention into deal-noise and shift the reader from solving a problem to decoding an ad.
• **Choice dilution:** Choice dilution prevents a coherent decision hierarchy from emerging.
• **Authority attenuation:** Authority attenuation through repeated self-reference weakens perceived expertise.
• **Orientation cost:** The opening expands orientation energy because it combines several ideas, which causes the reader to reconstruct the intended sequence.`;

  const violations = assessEditorSummary(before).violations;
  assert.ok(violations.some((violation) => violation.includes("conceptual heading")));
  assert.ok(violations.some((violation) => violation.includes("dense conceptual")));
  assert.ok(violations.some((violation) => violation.includes("reasoning")));
});

test("each revised point contains one short primary observation", () => {
  for (const summary of Object.values(revisedExamples)) {
    const { bullets } = assessEditorSummary(summary);
    for (const bullet of bullets) {
      assert.ok(bullet.split(/\s+/).length <= 22);
      assert.equal((bullet.match(/[.!?](?=\s|$)/g) ?? []).length, 1);
    }
  }
});

test("scan-first findings remain valid across several Gravitons", () => {
  const gravitonOutputs = {
    "What weakens trust?": `
• The strongest customer result appears after the pricing request.
• The main claim is repeated more often than it is supported.
• The guarantee is visually separated from the purchase decision.`,
    "Where does attention drift?": `
• The product grid pulls attention away from the main customer outcome.
• Repeated feature lists slow the journey through the middle of the page.
• Three competing actions weaken the ending.`,
    "Why isn't this converting?": `
• Visitors must choose a plan before the differences feel meaningful.
• The primary action appears before enough proof has established confidence.
• The closing section offers several ways to leave without deciding.`,
    "Summarise the positioning.": `
• The product is positioned as an all-in-one platform for growing businesses.
• Breadth receives more emphasis than the specific result customers gain.
• The language resembles several established competitors.`,
  };

  for (const [graviton, summary] of Object.entries(gravitonOutputs)) {
    assert.deepEqual(
      assessEditorSummary(summary).violations,
      [],
      graviton
    );
  }
});

test("legacy Executive Summary headings still parse without changing the visible name", () => {
  const report = `## Executive Summary
• The opening delays the main benefit.
• The choices compete with one another.
• Proof appears too late.

## Narrative Performance
Detailed operational consequences.`;
  assert.match(extractEditorSummary(report), /The opening delays/);
  assert.equal(assessEditorSummary(report).bullets.length, 3);
});
