import { after, NextResponse } from "next/server";
import { isClientSignalName } from "@/lib/signals/registry";
import { sanitizeClientSignalProperties } from "@/lib/signals/contracts";
import { consumeSignalRateLimit, recordSignal } from "@/lib/signals/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  try {
    const rateLimit = await consumeSignalRateLimit(req);
    if (rateLimit === "limited") return new NextResponse(null, { status: 429 });
    if (rateLimit === "unavailable") return new NextResponse(null, { status: 202 });
    const body = await req.json();
    if (!body || !isClientSignalName(String(body.name)) || body.version !== 1) {
      return NextResponse.json({ error: "Invalid signal" }, { status: 400 });
    }
    const visitorId = uuid.test(String(body.visitorId)) ? body.visitorId : null;
    const sessionId = uuid.test(String(body.sessionId)) ? body.sessionId : null;
    if (!visitorId || !sessionId) {
      return NextResponse.json({ error: "Invalid identity" }, { status: 400 });
    }
    const hostname = new URL(req.url).hostname;
    after(() => recordSignal(body.name, {
      visitorId,
      sessionId,
      surface: body.surface === "jump-in" || body.surface === "acquisition" ? body.surface : "paid",
      firstTouch: body.firstTouch,
      lastTouch: body.lastTouch,
      properties: sanitizeClientSignalProperties(body.name, body.properties),
      isTest: process.env.GRAVITAS_SIGNALS_TEST_MODE === "true" || hostname === "localhost" || hostname === "127.0.0.1",
      verified: false,
    }));
    return new NextResponse(null, { status: 202 });
  } catch {
    return new NextResponse(null, { status: 202 });
  }
}
