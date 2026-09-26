/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReaderHold } = require("../lib/reader-hold.ts");

test("Reader Hold accepts only a grounded categorical status with a verdict", () => {
  assert.deepEqual(
    parseReaderHold(`**Status:** Uneven\n**Verdict:** The proposal establishes expertise, but its central recommendation arrives after too much background detail.`),
    {
      level: "Uneven",
      verdict:
        "The proposal establishes expertise, but its central recommendation arrives after too much background detail.",
    }
  );
});

test("Reader Hold rejects invented scores and incomplete status blocks", () => {
  assert.equal(
    parseReaderHold("**Status:** 62%\n**Verdict:** Reader interest is low."),
    null
  );
  assert.equal(parseReaderHold("**Status:** At risk"), null);
});
