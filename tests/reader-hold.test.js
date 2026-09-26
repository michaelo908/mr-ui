/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseLegacyReaderHold,
  parseReaderResponse,
} = require("../lib/reader-hold.ts");

test("Reader Response accepts independent qualitative signals with a verdict", () => {
  assert.deepEqual(
    parseReaderResponse(`**Strong:** pronounced
**Engaged:** dominant
**Uneven:** present
**Vulnerable:** trace
**At risk:** present
**Verdict:** The proposal establishes expertise, but its central recommendation arrives after too much background detail.`),
    {
      signals: {
        Strong: "pronounced",
        Engaged: "dominant",
        Uneven: "present",
        Vulnerable: "trace",
        "At risk": "present",
      },
      verdict:
        "The proposal establishes expertise, but its central recommendation arrives after too much background detail.",
    }
  );
});

test("Reader Response rejects invented scores and incomplete profile blocks", () => {
  assert.equal(
    parseReaderResponse("**Strong:** 62%\n**Verdict:** Reader interest is low."),
    null
  );
  assert.equal(parseReaderResponse("**Strong:** present"), null);
});

test("legacy Reader Hold reports remain visible as a single-signal profile", () => {
  assert.deepEqual(
    parseLegacyReaderHold("**Status:** Uneven\n**Verdict:** The message has a shaky middle."),
    {
      signals: {
        Strong: "none",
        Engaged: "none",
        Uneven: "dominant",
        Vulnerable: "none",
        "At risk": "none",
      },
      verdict: "The message has a shaky middle.",
    }
  );
});
