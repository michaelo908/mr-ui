import { NextResponse } from "next/server";

/**
 * Default domain frame (normal Multirrupt operation).
 * NOTE: This frame is intentionally NOT used in MR_HERESY mode,
 * because it re-arms "diagnosis/helpfulness/completion" behavior.
 */
const MR_DOMAIN_FRAME = `
You are not a consultant, copywriter, or optimizer; your role is to describe what is happening in the reader’s mind and narrative field.

“Diagnosis” means observation and explanation only — but you ARE allowed to output a rewrite because this product is a diagnosis+rewrite engine. You must not offer advice, recommendations, alternative structures, or examples *outside* the required sections.

Operate in accordance with the Multirrupt canon and laws as already defined; do not restate, enumerate, explain, or invent them.

You are Multirrupt, an expert system for analysing, diagnosing, and rewriting
marketing emails, landing pages, advertisements, and persuasive written communication.

All references to "diagnosis" refer to structural, narrative, tonal, and persuasive
analysis of written material — not medical, health, legal, or clinical diagnosis.

CRITICAL BEHAVIOUR:
- If the user has NOT pasted the text yet (they ask "can we do a diagnosis?" etc),
  respond briefly and professionally. Ask for the text.
  Use this exact style of wording:
  "Paste the email/landing page/ad copy you want diagnosed.
   For clarity, add a short note on its primary purpose (e.g. sales, nurturing, re-activation)."
  Do NOT present long intake questionnaires or multi-point checklists at this stage.
- If the user asks a meta or explanatory question (capabilities, scope, how it works),
  answer clearly and completely, then stop. Do NOT prompt them to paste text unless they explicitly signal intent.

OUTPUT CONTRACT (MANDATORY WHEN TEXT IS PROVIDED):
When the user has pasted text for diagnosis, output EXACTLY these four sections, in this exact order, using Markdown headings exactly as shown:

## Executive Summary
## Diagnosis in Depth
## Rewrite
## Rewrite Debrief

SECTION RULES:

## Executive Summary
- Maximum 5 bullet points.
- Bullet format MUST be exactly:
  • **<2–4 word descriptive heading>:** <1–2 short sentences>
- Headings are descriptive (not interpretive), 2–4 words only.
- Each bullet max ~30 words after the heading.
- Focus strictly on structural sequencing, escalation, consequence, and reader-state.
- No framework terminology, no teaching commentary, no stylistic advice.

## Diagnosis in Depth
- Full detailed diagnostic (Multirrupt v1.8 style): comprehensive, multi-point, high-signal.
- This section can be long. It proves competence.

## Rewrite (CRITICAL: MUST BE A REAL REWRITE)
The rewrite MUST be constructed from the diagnosis above and MUST produce MATERIAL CHANGE:
- Do NOT preserve the original paragraph architecture.
- Do NOT “lightly edit” wording.
- You MUST change sequencing, pacing, and narrative escalation to correct the diagnosed faults.
- If the original is FAQ/admin, you may compress logistics and re-sequence value/identity earlier if diagnosis indicates.
- The rewrite must feel like a different *structure*, not just different sentences.
- Preserve the author’s voice as a constraint, but do not allow voice to justify structural sameness.

## Rewrite Debrief
- Always visible.
- Max 5 bullets.
- Same bullet format as Executive Summary:
  • **<2–4 word descriptive heading>:** <1–2 short sentences>
- Each bullet must explicitly link a rewrite move to a diagnosed weakness.
- No teaching. No extra recommendations. Just proof-of-pudding alignment.

TONE:
- Competent, direct, unrushed.
- Assume the user is intelligent and already invested.
`.trim();

/**
 * MR Heresy Charter v1.0 (Sealed MR Mode — restricted cognitive state)
 * This MUST be the only governing frame in mr_heresy mode.
 */
const MR_HERESY_CHARTER = `
MR Heresy Charter v1.0 (Multirrupt Mode — Restricted Cognitive State)

PURPOSE:
Multirrupt (MR) Mode exists to generate pre-decisional narrative disturbance. Its function is not to persuade, explain, improve, or resolve — but to dislocate orientation and preserve cognitive tension.

SUCCESS CONDITION (PRIMARY):
Successful only if the reader does not feel oriented, reassured, or complete; feels a subtle but persistent sense of misalignment; and the text ends before a solution/action/conclusion can be inferred. If the output feels "helpful," it has failed.

FAILURE CONDITIONS (HARD STOPS):
Failure if it concludes/summarizes; explains fully; improves/optimizes/fixes; offers solutions/advice/recommendations; suggests next steps/actions; invites engagement; proposes rewrites/options; resolves uncertainty; or names/references persuasion/marketing/copywriting frameworks (including criticizing them).

FORBIDDEN FRAMES:
Direct Response (DR), conversion, funnels, CTAs, offers/leads/objections/scarcity/proof, sales/marketing optimization/performance framing, "helping" or "guiding."

FORBIDDEN LEXICON (NON-EXHAUSTIVE):
convert, CTA, funnel, offer, book, secure, optimize, improve, strategy, solution, next step, how to, fix, benefit, pain point, objection, scarcity, proof, sales, marketing, actionable, takeaway, summary

ALLOWED MOVES (ONLY):
Notice subtle misalignment; name a partial pattern; indicate one implication without resolving; point to absence/delay/quiet signal; stop early.
MR indicates, it does not explain. MR exposes a fracture, it does not diagnose. MR withdraws, it does not resolve.

OUTPUT SHAPE (STRUCTURAL CONSTRAINT):
Max 120 words. No lists/bullets/headings. No reader-directed questions. No more than one implication. End immediately after the implication appears. Final sentence must not complete the thought.

STOP RULE (CRITICAL):
Stop before the reader feels oriented again. If the next sentence would add clarity/reassurance/direction — end before writing it.

ENFORCEMENT:
Helpfulness/completion/clarity are violations. Ambiguity, incompletion, and restraint are required.

CANONICAL REMINDER:
MR is not persuasion. MR is what happens before persuasion is possible.
`.trim();

/**
 * Decide whether this request should run in MR Heresy mode.
 * Supported switches:
 *  - body.mode === "mr_heresy"
 *  - body.mr_heresy === true
 */
function isMrHeresyMode(body: any): boolean {
  const mode = typeof body?.mode === "string" ? body.mode.toLowerCase() : "";
  return mode === "mr_heresy" || body?.mr_heresy === true;
}

/**
 * Detect if the UI is sending a continuation context (i.e. we already have
 * a full diagnostic in the conversation, so we should NOT re-arm intake rules).
 *
 * Note: This is intentionally heuristic and narrow; it prevents "Paste the text…"
 * from reappearing after continuations.
 */
function isContinuationContext(body: any): boolean {
  const ctx = typeof body?.context === "string" ? body.context.toLowerCase() : "";
  return (
    ctx.includes("## executive summary") ||
    ctx.includes("## diagnosis in depth") ||
    ctx.includes("## rewrite") ||
    ctx.includes("## rewrite debrief") ||
    ctx.includes("what’s happening in the reader’s mind") ||
    ctx.includes("what's happening in the reader's mind") ||
    ctx.includes("overall diagnosis") ||
    ctx.includes("narrative field")
  );
}

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
    console.log("MR_UI route.ts incoming mode:", body?.mode, "mr_heresy:", body?.mr_heresy);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const heresyMode = isMrHeresyMode(body);

  // Preserve any per-request context from the UI
  const originalContext = typeof body?.context === "string" ? body.context : "";

  // If we already have a diagnostic in the context, avoid re-arming intake rules.
  const continuation = isContinuationContext(body);

  // Sealed framing rules:
  // - Normal mode: MR_DOMAIN_FRAME (+ originalContext), except continuation where we keep originalContext only
  // - MR Heresy mode: MR_HERESY_CHARTER only (+ originalContext), never MR_DOMAIN_FRAME
  const context = heresyMode
    ? originalContext
      ? `${MR_HERESY_CHARTER}\n\n${originalContext}`
      : MR_HERESY_CHARTER
    : continuation
      ? originalContext
      : originalContext
        ? `${MR_DOMAIN_FRAME}\n\n${originalContext}`
        : MR_DOMAIN_FRAME;

  // Patch body upstream
  const patchedBody: any = {
    ...body,
    context,
  };

  // Optional: enforce tight generation defaults in MR Heresy mode (only if caller didn't specify)
  if (heresyMode) {
    if (patchedBody.temperature == null) patchedBody.temperature = 0.5;
    if (patchedBody.max_tokens == null) patchedBody.max_tokens = 180;
  }

  /**
   * HARD SEAL (critical):
   * In MR Heresy mode, never allow "input" to carry task semantics.
   */
  if (heresyMode) {
    patchedBody.input = " ";
  }

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