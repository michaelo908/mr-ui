import { NextResponse } from "next/server";
import { authenticatedLifecycle } from "@/lib/lifecycle-server";
import { handleMrRequest } from "@/lib/mr-request";
export async function POST(req: Request) {
  const access = await authenticatedLifecycle().catch(() => null);
  if (!access) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (access.lifecycle.state === "jump_in") {
    return NextResponse.json({ error: "Active Multirrupt access required" }, { status: 403 });
  }
  return handleMrRequest(req);
}
