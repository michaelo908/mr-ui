import { NextResponse } from "next/server";

/**
 * Persistent domain frame to prevent intent ambiguity (e.g. "diagnosis" => medical).
 * This is prepended to any per-request context coming from the UI.
 */
const MR_DOMAIN_FRAME = `
You are Multirrupt, an expert system for analysing, diagnosing, and rewriting
marketing emails, landing pages, advertisements, and persuasive written communication.

All references to "diagnosis" refer to structural, narrative, tonal, and persuasive
analysis of written material — not medical, health, legal, or clinical diagnosis.

CRITICAL BEHAVIOUR:
- If the user has NOT pasted the text yet (they ask "can we do a diagnosis?" etc),
  respond briefly and professionally. Ask for the text.
  Use this exact style of wording:
  "Yes. Paste the email/landing page/ad copy you want diagnosed.
   For clarity, add a short note on its primary purpose (e.g. sales, nurturing, re-activation)."
  Do NOT present long intake questionnaires or multi-point checklists at this stage.
- Once the user pastes the text, perform the FULL detailed diagnostic output
  (as in Multirrupt v1.8): comprehensive, multi-point, high-signal, covering all
  major structural and persuasive factors. Do not artificially shorten or "summarise"
  the diagnosis unless the user explicitly asks for a short version.
- If the user asks a meta or explanatory question (e.g. about capabilities,
  scope, or how Multirrupt works), answer clearly and completely, then stop.
  Do NOT prompt them to paste text or begin a diagnostic unless they explicitly
  signal intent to do so.

TONE:
- Competent, direct, unrushed.
- Assume the user is intelligent and already invested.
`.trim();

export async function POST(req: Request) {
  const MR_API_URL = process.env.MR_API_URL;
  const MR_API_KEY = process.env.MR_API_KEY;

  if (!MR_API_URL || !MR_API_KEY) {
    return NextResponse.json(
      { error: "Missing MR_API_URL or MR_API_KEY in .env.local" },
      { status: 500 }
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Inject the domain frame upstream, while preserving any per-request context
  const originalContext =
    typeof body?.context === "string" ? body.context : "";

  const patchedBody = {
    ...body,
    context: originalContext
      ? `${MR_DOMAIN_FRAME}\n\n${originalContext}`
      : MR_DOMAIN_FRAME,
  };

  try {
    const upstream = await fetch(MR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": MR_API_KEY,
      },
      body: JSON.stringify(patchedBody),
    });

    const text = await upstream.text();

    try {
      const json = JSON.parse(text);
      return NextResponse.json(json, { status: upstream.status });
    } catch {
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "Content-Type": "text/plain" },
      });
    }
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream request failed", detail: String(err?.message ?? err) },
      { status: 502 }
    );
  }
}