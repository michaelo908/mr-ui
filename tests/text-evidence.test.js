/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildTextEvidenceLaunch,
  extractTextEvidenceNumbers,
  parseTextEvidenceBlocks,
  stripTextEvidenceReference,
} = require("../lib/text-evidence.ts");

test("creates stable coherent evidence blocks from explicit report markers", () => {
  const depth = `[[Evidence: 1]]
### Opening diagnosis
The opening establishes the central promise.

It also defines the reader's decision.

[[Evidence: 2]]
- The mechanism appears once.
- The mechanism appears again.

[[Evidence: 3]]
> The quoted claim carries the proof.`;

  assert.deepEqual(parseTextEvidenceBlocks(depth), [
    {
      kind: "text",
      number: 1,
      id: "text-evidence-1",
      content:
        "### Opening diagnosis\nThe opening establishes the central promise.\n\nIt also defines the reader's decision.",
    },
    {
      kind: "text",
      number: 2,
      id: "text-evidence-2",
      content: "- The mechanism appears once.\n- The mechanism appears again.",
    },
    {
      kind: "text",
      number: 3,
      id: "text-evidence-3",
      content: "> The quoted claim carries the proof.",
    },
  ]);
});

test("parses dot lists, conjunctions, and ranges from recommendation evidence", () => {
  assert.deepEqual(
    extractTextEvidenceNumbers(
      "The mechanism repeats. Progress slows. Consolidate it. Evidence: **1 · 3 · 5**"
    ),
    [1, 3, 5]
  );
  assert.deepEqual(
    extractTextEvidenceNumbers("Recommendation. Evidence: 2 and 4–6"),
    [2, 4, 5, 6]
  );
  assert.deepEqual(
    extractTextEvidenceNumbers("Recommendation. Evidence: 2 to 4"),
    [2, 3, 4]
  );
});

test("removes structural evidence metadata without changing recommendation prose", () => {
  assert.equal(
    stripTextEvidenceReference(
      "The mechanism repeats. Progress slows. Consolidate it. Evidence: **1 · 2**"
    ),
    "The mechanism repeats. Progress slows. Consolidate it."
  );
});

test("launches only evidence referenced by the originating recommendation", () => {
  const blocks = parseTextEvidenceBlocks(
    "[[Evidence: 1]]\nFirst block.\n[[Evidence: 2]]\nSecond block."
  );
  const recommendation = {
    action: "Consolidate",
    body: "The mechanism repeats. Progress slows. Consolidate it. Evidence: **1**",
  };

  assert.deepEqual(
    buildTextEvidenceLaunch(recommendation, blocks, 1, "#FACC15"),
    {
    evidenceNumber: 1,
    action: "Consolidate",
    color: "#FACC15",
    recommendation:
      "The mechanism repeats. Progress slows. Consolidate it.",
    }
  );
  assert.equal(
    buildTextEvidenceLaunch(recommendation, blocks, 2, "#FACC15"),
    null
  );
});
