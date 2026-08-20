import { JUMP_IN_DURATION_MS, JUMP_IN_RESET_MS } from "@/lib/jump-in";
import {
  createJumpInTokenWithSecret,
  getJumpInAbsoluteExpiry,
  getJumpInRemainingCookieSeconds,
  readJumpInTokenWithSecrets,
} from "@/lib/jump-in-token";

export const JUMP_IN_COOKIE_NAME = "gravitas_jump_in";

type JumpInToken = {
  startedAt: number;
  sessionId: string;
  needsResign: boolean;
};

function getCurrentSecret() {
  const secret =
    process.env.JUMP_IN_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing Jump In session secret");
  }

  return secret;
}

export function createJumpInToken(startedAt: number, sessionId: string) {
  return createJumpInTokenWithSecret(startedAt, sessionId, getCurrentSecret());
}

export function readJumpInToken(
  value?: string,
  now = Date.now()
): JumpInToken | null {
  return readJumpInTokenWithSecrets(value, {
    currentSecret: getCurrentSecret(),
    previousSecret: process.env.JUMP_IN_PREVIOUS_SESSION_SECRET,
    now,
    resetMs: JUMP_IN_RESET_MS,
  });
}

export function getJumpInTokenAbsoluteExpiry(
  token: Pick<JumpInToken, "startedAt">
) {
  return getJumpInAbsoluteExpiry(token.startedAt, JUMP_IN_RESET_MS);
}

export function getJumpInTokenRemainingCookieSeconds(
  token: Pick<JumpInToken, "startedAt">,
  now = Date.now()
) {
  return getJumpInRemainingCookieSeconds(
    token.startedAt,
    now,
    JUMP_IN_RESET_MS
  );
}

export function isJumpInTokenExpired(token: JumpInToken, now = Date.now()) {
  return now >= token.startedAt + JUMP_IN_DURATION_MS;
}

export function isJumpInTokenResetEligible(
  token: JumpInToken,
  now = Date.now()
) {
  return now >= token.startedAt + JUMP_IN_RESET_MS;
}
