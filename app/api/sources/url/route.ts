import { NextResponse } from "next/server";
import { authenticatedLifecycle } from "@/lib/lifecycle-server";
import { handleUrlSourceRequest } from "@/lib/url-source-request";
export const maxDuration = 60;
export const runtime = "nodejs";
export const preferredRegion = "syd1";
export async function POST(req: Request) {
  const access = await authenticatedLifecycle().catch(() => null);
  if (!access) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (access.lifecycle.state === "jump_in") {
    return NextResponse.json({ error: "Active Multirrupt access required" }, { status: 403 });
  }
  return handleUrlSourceRequest(req);
}
