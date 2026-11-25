import { handleUrlSourceRequest } from "@/app/api/sources/url/route";
import { JUMP_IN_MAX_URL_VIEWPORTS } from "@/lib/jump-in";
import { cookies } from "next/headers";
import { isJumpInSameOrigin, readJumpInToken, isJumpInTokenExpired, JUMP_IN_COOKIE_NAME } from "@/lib/jump-in-server";

export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "syd1";

export async function POST(req: Request) {
  if (!isJumpInSameOrigin(req)) return Response.json({ error: "Invalid origin" }, { status: 403 });
  const session = readJumpInToken((await cookies()).get(JUMP_IN_COOKIE_NAME)?.value);
  if (!session) return Response.json({ error: "Start your Jump In session first." }, { status: 401 });
  if (isJumpInTokenExpired(session)) return Response.json({ error: "Your 20-minute Jump In session has ended.", expired: true }, { status: 403 });
  return handleUrlSourceRequest(req, JUMP_IN_MAX_URL_VIEWPORTS);
}
