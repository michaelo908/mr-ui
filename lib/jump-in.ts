export const JUMP_IN_DURATION_MS = 20 * 60 * 1000;
export const JUMP_IN_RESET_MS = 7 * 24 * 60 * 60 * 1000;
export const JUMP_IN_MAX_URL_VIEWPORTS = 10;
export const JUMP_IN_MAX_PASTED_WORDS = 800;
export const JUMP_IN_STORAGE_KEY = "gravitasJumpInSessionV1";
export const JUMP_IN_DAY_PASS_URL = "https://multirrupt.com/day-pass/";

export type JumpInSessionState = {
  sessionId: string;
  startedAt: number | null;
  sessionStartedEventSent?: boolean;
  expiredEventSent?: boolean;
};

export function getJumpInRemainingMs(
  startedAt: number | null,
  now = Date.now()
) {
  if (startedAt === null) return JUMP_IN_DURATION_MS;
  return Math.max(0, startedAt + JUMP_IN_DURATION_MS - now);
}

export function isJumpInExpired(startedAt: number | null, now = Date.now()) {
  return startedAt !== null && getJumpInRemainingMs(startedAt, now) === 0;
}

export function isJumpInResetEligible(
  startedAt: number | null,
  now = Date.now()
) {
  return startedAt !== null && now >= startedAt + JUMP_IN_RESET_MS;
}

export function formatJumpInRemaining(remainingMs: number) {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
