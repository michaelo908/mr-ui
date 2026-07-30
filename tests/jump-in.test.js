/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  formatJumpInRemaining,
  getJumpInRemainingMs,
  isJumpInExpired,
  JUMP_IN_DURATION_MS,
} = require("../lib/jump-in.ts");

test("the timer is untouched before the first analysis", () => {
  assert.equal(getJumpInRemainingMs(null, 123), JUMP_IN_DURATION_MS);
  assert.equal(isJumpInExpired(null, Number.MAX_SAFE_INTEGER), false);
});

test("the timer survives refresh by deriving from the persisted start time", () => {
  const startedAt = 1_000;
  const refreshedAt = startedAt + 7 * 60 * 1000 + 250;

  assert.equal(
    getJumpInRemainingMs(startedAt, refreshedAt),
    13 * 60 * 1000 - 250
  );
});

test("the session expires at exactly 20 minutes and cannot extend", () => {
  const startedAt = 10_000;

  assert.equal(isJumpInExpired(startedAt, startedAt + JUMP_IN_DURATION_MS - 1), false);
  assert.equal(isJumpInExpired(startedAt, startedAt + JUMP_IN_DURATION_MS), true);
  assert.equal(
    getJumpInRemainingMs(startedAt, startedAt + JUMP_IN_DURATION_MS + 60_000),
    0
  );
});

test("remaining time is formatted for the persistent countdown", () => {
  assert.equal(formatJumpInRemaining(20 * 60 * 1000), "20:00");
  assert.equal(formatJumpInRemaining(61_000), "1:01");
  assert.equal(formatJumpInRemaining(1), "0:01");
  assert.equal(formatJumpInRemaining(0), "0:00");
});
