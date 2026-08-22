import { NextResponse } from "next/server";
import { authenticatedLifecycle } from "@/lib/lifecycle-server";

export async function GET() {
  try {
    const access = await authenticatedLifecycle();
    if (!access) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    return NextResponse.json(access.lifecycle);
  } catch {
    console.warn("Lifecycle access lookup failed", {
      provider: "supabase",
      category: "lifecycle_lookup_failed",
    });
    return NextResponse.json({ error: "Access lookup failed" }, { status: 503 });
  }
}
