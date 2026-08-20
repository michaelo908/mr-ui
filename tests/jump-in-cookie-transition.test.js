/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createJumpInTokenWithSecret,
  getJumpInAbsoluteExpiry,
  getJumpInRemainingCookieSeconds,
  readJumpInTokenWithSecrets,
} = require("../lib/jump-in-token.js");

const CURRENT_SECRET = "current-secret-for-cookie-transition-tests";
const PREVIOUS_SECRET = "previous-secret-for-cookie-transition-tests";
const UNRELATED_SECRET = "unrelated-secret-for-cookie-transition-tests";
const RESET_MS = 7 * 24 * 60 * 60 * 1000;
const DURATION_MS = 20 * 60 * 1000;
const NOW = 1_800_000_000_000;
const STARTED_AT = NOW - 5 * 60 * 1000;
const SESSION_ID = "123e4567-e89b-42d3-a456-426614174000";

function read(value, overrides = {}) {
  return readJumpInTokenWithSecrets(value, {
    currentSecret: CURRENT_SECRET,
    previousSecret: PREVIOUS_SECRET,
    now: NOW,
    resetMs: RESET_MS,
    ...overrides,
  });
}

test("current-secret cookies verify without transition re-signing", () => {
  const token = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    CURRENT_SECRET
  );

  assert.deepEqual(read(token), {
    startedAt: STARTED_AT,
    sessionId: SESSION_ID,
    needsResign: false,
  });
});

test("previous-secret cookies preserve identity, timing and absolute expiry", () => {
  const oldToken = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    PREVIOUS_SECRET
  );
  const migrated = read(oldToken);

  assert.deepEqual(migrated, {
    startedAt: STARTED_AT,
    sessionId: SESSION_ID,
    needsResign: true,
  });
  assert.equal(
    getJumpInAbsoluteExpiry(migrated.startedAt, RESET_MS),
    STARTED_AT + RESET_MS
  );
  assert.equal(
    getJumpInRemainingCookieSeconds(migrated.startedAt, NOW, RESET_MS),
    Math.floor((STARTED_AT + RESET_MS - NOW) / 1000)
  );
  assert.equal(NOW >= migrated.startedAt + DURATION_MS, false);
  assert.equal(NOW >= migrated.startedAt + RESET_MS, false);
});

test("previous-secret cookies are re-signed with the current secret", () => {
  const oldToken = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    PREVIOUS_SECRET
  );
  const migrated = read(oldToken);
  const replacement = createJumpInTokenWithSecret(
    migrated.startedAt,
    migrated.sessionId,
    CURRENT_SECRET
  );

  assert.deepEqual(
    readJumpInTokenWithSecrets(replacement, {
      currentSecret: CURRENT_SECRET,
      now: NOW,
      resetMs: RESET_MS,
    }),
    {
      startedAt: STARTED_AT,
      sessionId: SESSION_ID,
      needsResign: false,
    }
  );
});

test("previous-secret cookies at or beyond seven days are not revived", () => {
  const expiredStartedAt = NOW - RESET_MS;
  const expiredToken = createJumpInTokenWithSecret(
    expiredStartedAt,
    SESSION_ID,
    PREVIOUS_SECRET
  );

  assert.equal(read(expiredToken), null);
  assert.equal(
    read(expiredToken, { now: NOW + 1 }),
    null
  );
});

test("invalid and unrelated signatures are rejected", () => {
  const unrelated = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    UNRELATED_SECRET
  );
  const malformed = `${STARTED_AT}.${SESSION_ID}.not-a-valid-signature`;

  assert.equal(read(unrelated), null);
  assert.equal(read(malformed), null);
  assert.equal(read("invalid"), null);
});

test("omitting the previous secret preserves current-only verification", () => {
  const current = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    CURRENT_SECRET
  );
  const previous = createJumpInTokenWithSecret(
    STARTED_AT,
    SESSION_ID,
    PREVIOUS_SECRET
  );
  const options = {
    currentSecret: CURRENT_SECRET,
    now: NOW,
    resetMs: RESET_MS,
  };

  assert.equal(readJumpInTokenWithSecrets(current, options)?.needsResign, false);
  assert.equal(readJumpInTokenWithSecrets(previous, options), null);
});

test("transition code does not log or expose secret values", () => {
  const server = fs.readFileSync(
    path.resolve(__dirname, "../lib/jump-in-server.ts"),
    "utf8"
  );
  const tokenModule = fs.readFileSync(
    path.resolve(__dirname, "../lib/jump-in-token.js"),
    "utf8"
  );

  assert.doesNotMatch(server, /console\./);
  assert.doesNotMatch(tokenModule, /console\./);
  assert.throws(
    () => createJumpInTokenWithSecret(STARTED_AT, SESSION_ID, ""),
    (error) =>
      error instanceof Error &&
      !error.message.includes(CURRENT_SECRET) &&
      !error.message.includes(PREVIOUS_SECRET)
  );
});

test("Jump In route re-signs transition cookies without duplicate analytics", () => {
  const route = fs.readFileSync(
    path.resolve(__dirname, "../app/api/jump-in/mr/route.ts"),
    "utf8"
  );

  assert.match(route, /existing\.needsResign/);
  assert.match(route, /expires: new Date\(getJumpInTokenAbsoluteExpiry\(existing\)\)/);
  assert.match(route, /maxAge: getJumpInTokenRemainingCookieSeconds\(existing, now\)/);
  assert.match(route, /if \(!activeExisting \|\| existing\?\.needsResign\)/);
  assert.match(route, /if \(!activeExisting\) \{[\s\S]*first_analysis_performed/);
});
