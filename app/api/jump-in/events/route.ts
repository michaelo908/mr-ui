import { NextResponse } from "next/server";

const EVENTS = new Set([
  "session_started",
  "session_expired",
  "day_pass_clicked",
]);

export async function POST(req: Request) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event =
    typeof body === "object" && body !== null && "event" in body
      ? String(body.event)
      : "";
  const sessionId =
    typeof body === "object" && body !== null && "sessionId" in body
      ? String(body.sessionId)
      : "";

  if (!EVENTS.has(event) || !sessionId) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  console.log("Jump In analytics", { event, sessionId });
  return NextResponse.json({ recorded: true });
}
