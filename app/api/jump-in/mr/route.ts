import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleMrRequest } from "@/app/api/mr/route";
import {
  createJumpInToken,
  getJumpInTokenAbsoluteExpiry,
  getJumpInTokenRemainingCookieSeconds,
  isJumpInTokenExpired,
  isJumpInTokenResetEligible,
  JUMP_IN_COOKIE_NAME,
  readJumpInToken,
} from "@/lib/jump-in-server";
import {
  JUMP_IN_MAX_PASTED_WORDS,
  JUMP_IN_MAX_URL_VIEWPORTS,
  JUMP_IN_RESET_MS,
} from "@/lib/jump-in";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const now = Date.now();
  const existing = readJumpInToken(
    cookieStore.get(JUMP_IN_COOKIE_NAME)?.value,
    now
  );
  const requestedSessionId = req.headers.get("X-Jump-In-Session-Id");
  const safeRequestedSessionId =
    requestedSessionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedSessionId
    )
      ? requestedSessionId
      : null;

  const resetEligible =
    existing && isJumpInTokenResetEligible(existing, now);

  if (existing && isJumpInTokenExpired(existing, now) && !resetEligible) {
    console.log("Jump In analytics", {
      event: "session_expired",
      sessionId: existing.sessionId,
    });
    const response = NextResponse.json(
      { error: "Your 20-minute Jump In session has ended.", expired: true },
      { status: 403 }
    );

    if (existing.needsResign) {
      response.cookies.set(
        JUMP_IN_COOKIE_NAME,
        createJumpInToken(existing.startedAt, existing.sessionId),
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          expires: new Date(getJumpInTokenAbsoluteExpiry(existing)),
          maxAge: getJumpInTokenRemainingCookieSeconds(existing, now),
          path: "/",
        }
      );
    }

    return response;
  }

  const activeExisting = resetEligible ? null : existing;
  const session =
    activeExisting ?? {
      startedAt: now,
      sessionId: safeRequestedSessionId ?? crypto.randomUUID(),
    };

  const response = await handleMrRequest(req, {
    maxUrlViewports: JUMP_IN_MAX_URL_VIEWPORTS,
    maxPastedTextWords: JUMP_IN_MAX_PASTED_WORDS,
  });

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

    if (!activeExisting) {
      console.log("Jump In analytics", {
        event: "first_analysis_performed",
        sessionId: session.sessionId,
      });
    }
  }

  response.headers.set("X-Jump-In-Started-At", String(session.startedAt));
  return response;
}
