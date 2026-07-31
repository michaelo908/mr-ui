import { handleUrlSourceRequest } from "@/app/api/sources/url/route";
import { JUMP_IN_MAX_URL_VIEWPORTS } from "@/lib/jump-in";

export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "syd1";

export async function POST(req: Request) {
  return handleUrlSourceRequest(req, JUMP_IN_MAX_URL_VIEWPORTS);
}
