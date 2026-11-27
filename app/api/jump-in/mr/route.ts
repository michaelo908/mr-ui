import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleMrRequest } from "@/lib/mr-request";
import {
  createJumpInToken,
  getJumpInTokenAbsoluteExpiry,
  getJumpInTokenRemainingCookieSeconds,
  isJumpInTokenExpired,
  JUMP_IN_COOKIE_NAME,
  readJumpInToken,
} from "@/lib/jump-in-server";
import {
  JUMP_IN_MAX_PASTED_WORDS,
  JUMP_IN_MAX_URL_VIEWPORTS,
} from "@/lib/jump-in";
import { isJumpInSameOrigin } from "@/lib/jump-in-server";

export async function POST(req: Request) {
  if (!isJumpInSameOrigin(req)) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const cookieStore = await cookies();
  const now = Date.now();
  const existing = readJumpInToken(
    cookieStore.get(JUMP_IN_COOKIE_NAME)?.value,
    now
  );

  if (!existing) return NextResponse.json({ error: "Start your Jump In session first.", sessionRequired: true }, { status: 401 });
  if (isJumpInTokenExpired(existing, now)) {
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

  const response = await handleMrRequest(req, {
    maxUrlViewports: JUMP_IN_MAX_URL_VIEWPORTS,
    maxPastedTextWords: JUMP_IN_MAX_PASTED_WORDS,
  });

  if (existing.needsResign) {
    response.cookies.set(JUMP_IN_COOKIE_NAME,
      createJumpInToken(existing.startedAt, existing.sessionId), {
        httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
        expires: new Date(getJumpInTokenAbsoluteExpiry(existing)),
        maxAge: getJumpInTokenRemainingCookieSeconds(existing, now), path: "/",
      });
  }

  response.headers.set("X-Jump-In-Started-At", String(existing.startedAt));
  return response;
}
