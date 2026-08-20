/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require("node:crypto");

function signJumpInPayload(payload, secret) {
  if (!secret) throw new Error("Missing current Jump In session secret");
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function signaturesMatch(payload, signature, secret) {
  if (!secret) return false;

  const supplied = Buffer.from(signature);
  const expected = Buffer.from(signJumpInPayload(payload, secret));

  return (
    supplied.length === expected.length &&
    crypto.timingSafeEqual(supplied, expected)
  );
}

function createJumpInTokenWithSecret(startedAt, sessionId, secret) {
  const payload = `${startedAt}.${sessionId}`;
  return `${payload}.${signJumpInPayload(payload, secret)}`;
}

function readJumpInTokenWithSecrets(
  value,
  { currentSecret, previousSecret, now = Date.now(), resetMs }
) {
  if (!value) return null;

  const parts = value.split(".");
  if (parts.length !== 3) return null;

  const [startedAtRaw, sessionId, signature] = parts;
  const startedAt = Number(startedAtRaw);

  if (
    !Number.isFinite(startedAt) ||
    !sessionId ||
    !signature ||
    startedAt > now + 60_000
  ) {
    return null;
  }

  const payload = `${startedAt}.${sessionId}`;
  if (signaturesMatch(payload, signature, currentSecret)) {
    return { startedAt, sessionId, needsResign: false };
  }

  if (!signaturesMatch(payload, signature, previousSecret)) return null;

  const absoluteExpiry = startedAt + resetMs;
  if (now >= absoluteExpiry) return null;

  return { startedAt, sessionId, needsResign: true };
}

function getJumpInAbsoluteExpiry(startedAt, resetMs) {
  return startedAt + resetMs;
}

function getJumpInRemainingCookieSeconds(startedAt, now, resetMs) {
  return Math.max(
    0,
    Math.floor((getJumpInAbsoluteExpiry(startedAt, resetMs) - now) / 1000)
  );
}

module.exports = {
  createJumpInTokenWithSecret,
  getJumpInAbsoluteExpiry,
  getJumpInRemainingCookieSeconds,
  readJumpInTokenWithSecrets,
};
