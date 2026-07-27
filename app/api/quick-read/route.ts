import { NextResponse } from "next/server";

const QUICK_READ_FRAME = `
You are Gravitas Quick Read.

Analyse the pasted commercial writing from the reader's side.

This is a public, limited quick-read version of Gravitas. It should be genuinely useful, specific, and diagnostic, but it must not produce the full Gravitas analysis or any rewrite.

Return ONLY valid JSON in this exact shape:

{
  "risk": "60–80 words. Specific to the pasted text. Identify the main way the reader may lose attention, trust, clarity, urgency, or momentum. Do not give generic copywriting advice.",
  "adjustment": "60–80 words. Give one specific improvement based on the actual pasted text. Explain why it would change the reader's experience.",
  "fullAnalysis": "60–80 words. Explain that a full Gravitas analysis typically produces 7–10 diagnostic points because messages usually fail as a sequence, not as one sentence. Mention attention, trust, momentum, assumptions, and rewrite options."
}

Rules:
- Return JSON only.
- Do not wrap the JSON in markdown.
- Do not produce a full rewrite.
- Do not offer multiple options.
- Do not ask follow-up questions.
- Do not mention AI.
- Do not exceed 260 words total.
- Be specific to the supplied text.
`.trim();

function countWords(text: string) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export async function POST(req: Request) {
  const MR_API_URL = process.env.MR_API_URL;
  const MR_API_KEY = process.env.MR_API_KEY;

  if (!MR_API_URL || !MR_API_KEY) {
    return NextResponse.json(
      { error: "Missing MR_API_URL or MR_API_KEY" },
      { status: 500 }
    );
  }

  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = typeof body?.input === "string" ? body.input.trim() : "";

  if (!input) {
    return NextResponse.json({ error: "Missing input" }, { status: 400 });
  }

  if (countWords(input) > 500) {
    return NextResponse.json(
      { error: "Quick Read is limited to 500 words." },
      { status: 400 }
    );
  }

  const payload = {
    mode: "general",
    input,
    context: QUICK_READ_FRAME,
    constraints: {},
    temperature: 0.4,
    max_tokens: 520,
  };

  try {
    const upstream = await fetch(MR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": MR_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();

    try {
  const json = JSON.parse(text);

  const output =
    typeof json?.output === "string"
      ? json.output.trim()
      : typeof json === "string"
        ? json.trim()
        : JSON.stringify(json);

  try {
    const parsedOutput = JSON.parse(output);

    return NextResponse.json(
      {
        risk: parsedOutput.risk || "",
        adjustment: parsedOutput.adjustment || "",
        fullAnalysis: parsedOutput.fullAnalysis || "",
      },
      { status: upstream.status }
    );
  } catch {
    return NextResponse.json(
      {
        risk: "",
        adjustment: "",
        fullAnalysis: output,
      },
      { status: upstream.status }
    );
  }
} catch {
  return NextResponse.json(
    {
      risk: "",
      adjustment: "",
      fullAnalysis: text,
    },
    { status: upstream.status }
  );
}
  } catch (err: any) {
    return NextResponse.json(
      { error: "Upstream request failed", detail: String(err?.message ?? err) },
      { status: 502 }
    );
  }
}