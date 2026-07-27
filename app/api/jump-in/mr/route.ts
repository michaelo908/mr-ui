import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { handleMrRequest } from "@/app/api/mr/route";
import {
  createJumpInToken,
  isJumpInTokenExpired,
  JUMP_IN_COOKIE_NAME,
  readJumpInToken,
} from "@/lib/jump-in-server";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const existing = readJumpInToken(cookieStore.get(JUMP_IN_COOKIE_NAME)?.value);
  const now = Date.now();
  const requestedSessionId = req.headers.get("X-Jump-In-Session-Id");
  const safeRequestedSessionId =
    requestedSessionId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      requestedSessionId
    )
      ? requestedSessionId
      : null;

  if (existing && isJumpInTokenExpired(existing, now)) {
    console.log("Jump In analytics", {
      event: "session_expired",
      sessionId: existing.sessionId,
    });
    return NextResponse.json(
      { error: "Your 20-minute Jump In session has ended.", expired: true },
      { status: 403 }
    );
  }

  const session =
    existing ?? {
      startedAt: now,
      sessionId: safeRequestedSessionId ?? crypto.randomUUID(),
    };

  const response = await handleMrRequest(req);

  if (!existing) {
    response.cookies.set(
      JUMP_IN_COOKIE_NAME,
      createJumpInToken(session.startedAt, session.sessionId),
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60,
        path: "/",
      }
    );

    console.log("Jump In analytics", {
      event: "first_analysis_performed",
      sessionId: session.sessionId,
    });
  }

  response.headers.set("X-Jump-In-Started-At", String(session.startedAt));
  return response;
}
