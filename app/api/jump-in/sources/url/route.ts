import { handleUrlSourceRequest } from "@/app/api/sources/url/route";
import { JUMP_IN_MAX_URL_VIEWPORTS } from "@/lib/jump-in";
import { hasAuthenticatedJumpInUser } from "@/lib/jump-in-auth";

export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "syd1";

export async function POST(req: Request) {
  if (!(await hasAuthenticatedJumpInUser())) {
    return Response.json({ error: "Sign in to start your Jump In." }, { status: 401 });
  }
  return handleUrlSourceRequest(req, JUMP_IN_MAX_URL_VIEWPORTS);
}
