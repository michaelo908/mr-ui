import crypto from "crypto";
import { JUMP_IN_DURATION_MS, JUMP_IN_RESET_MS } from "@/lib/jump-in";

export const JUMP_IN_COOKIE_NAME = "gravitas_jump_in";

type JumpInToken = {
  startedAt: number;
  sessionId: string;
};

function getSecret() {
  const secret =
    process.env.JUMP_IN_SESSION_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing Jump In session secret");
  }

  return secret;
}

function sign(payload: string) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}

export function createJumpInToken(startedAt: number, sessionId: string) {
  const payload = `${startedAt}.${sessionId}`;
  return `${payload}.${sign(payload)}`;
}

export function readJumpInToken(value?: string): JumpInToken | null {
  if (!value) return null;

  const [startedAtRaw, sessionId, signature] = value.split(".");
  const startedAt = Number(startedAtRaw);

  if (
    !Number.isFinite(startedAt) ||
    !sessionId ||
    !signature ||
    startedAt > Date.now() + 60_000
  ) {
    return null;
  }

  const payload = `${startedAt}.${sessionId}`;
  const expected = sign(payload);
  const supplied = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    supplied.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(supplied, expectedBuffer)
  ) {
    return null;
  }

  return { startedAt, sessionId };
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
