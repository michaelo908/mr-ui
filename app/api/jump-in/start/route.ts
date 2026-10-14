import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  createJumpInToken,
  getJumpInTokenAbsoluteExpiry,
  getJumpInTokenRemainingCookieSeconds,
  isJumpInTokenExpired,
  isJumpInTokenResetEligible,
  JUMP_IN_COOKIE_NAME,
  readJumpInToken,
} from "@/lib/jump-in-server";
import { JUMP_IN_RESET_MS } from "@/lib/jump-in";
import { hasAuthenticatedJumpInUser } from "@/lib/jump-in-auth";

function requestedSessionId(value: string | null) {
  return value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
    ? value
    : null;
}

export async function POST(req: Request) {
  if (!(await hasAuthenticatedJumpInUser())) {
    return NextResponse.json({ error: "Sign in to unlock your Jump In." }, { status: 401 });
  }

  const cookieStore = await cookies();
  const now = Date.now();
  const existing = readJumpInToken(
    cookieStore.get(JUMP_IN_COOKIE_NAME)?.value,
    now
  );
  const resetEligible = existing && isJumpInTokenResetEligible(existing, now);

  if (existing && isJumpInTokenExpired(existing, now) && !resetEligible) {
    return NextResponse.json(
      { error: "Your 20-minute Jump In session has ended.", expired: true },
      { status: 403 }
    );
  }

  const activeExisting = resetEligible ? null : existing;
  const session = activeExisting ?? {
    startedAt: now,
    sessionId: requestedSessionId(req.headers.get("X-Jump-In-Session-Id")) ?? crypto.randomUUID(),
  };
  const response = NextResponse.json({ startedAt: session.startedAt });

  if (!activeExisting || existing?.needsResign) {
    const isTransitionResign = Boolean(activeExisting?.needsResign);
    response.cookies.set(
      JUMP_IN_COOKIE_NAME,
      createJumpInToken(session.startedAt, session.sessionId),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        ...(isTransitionResign
          ? {
              expires: new Date(getJumpInTokenAbsoluteExpiry(session)),
              maxAge: getJumpInTokenRemainingCookieSeconds(session, now),
            }
          : { maxAge: JUMP_IN_RESET_MS / 1000 }),
        path: "/",
      }
    );
  }

  response.headers.set("X-Jump-In-Started-At", String(session.startedAt));
  return response;
}
