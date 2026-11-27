import { NextResponse } from "next/server";
import {
  getSource,
  ownedAudit,
  requireAuditEnvironment,
} from "@/lib/audit/server";
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAuditEnvironment();
    const job = await ownedAudit((await params).id);
    const index = Number(new URL(req.url).searchParams.get("page"));
    if (!Number.isInteger(index) || index < 0 || index >= job.urls.length)
      throw new Error();
    return NextResponse.json(
      { source: await getSource(job, index) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Saved source unavailable." },
      { status: 404 },
    );
  }
}
