import { NextResponse } from "next/server";
import {
  ownedAudit,
  publicAudit,
  requireAuditEnvironment,
} from "@/lib/audit/server";
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAuditEnvironment();
    return NextResponse.json({
      audit: publicAudit(await ownedAudit((await params).id)),
    });
  } catch {
    return NextResponse.json({ error: "Audit unavailable." }, { status: 404 });
  }
}
