import { NextResponse } from "next/server";
import {
  advance,
  ownedAudit,
  publicAudit,
  requireAuditEnvironment,
  sameOrigin,
} from "@/lib/audit/server";
export const maxDuration = 300;
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    requireAuditEnvironment();
    sameOrigin(req);
    const id = (await params).id;
    await advance(await ownedAudit(id));
    return NextResponse.json({ audit: publicAudit(await ownedAudit(id)) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Audit step unavailable.",
      },
      { status: 409 },
    );
  }
}
