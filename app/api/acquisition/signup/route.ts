import { after, NextResponse } from "next/server";
import { getAcquisitionFunnel } from "@/lib/acquisition-funnels";
import { addMailchimpLead } from "@/lib/mailchimp";
import { sanitizeAttribution } from "@/lib/signals/contracts";
import { consumeSignalRateLimit, recordSignal, signalContextFromRequest } from "@/lib/signals/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const rateLimit = await consumeSignalRateLimit(req);
    if (rateLimit === "limited") return NextResponse.json({ error: "Please wait and try again." }, { status: 429 });
    const body = await req.json();
    const funnel = getAcquisitionFunnel(String(body?.funnel || ""));
    const firstName = String(body?.firstName || "").trim().slice(0, 60);
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 254);
    if (!funnel || !firstName || !EMAIL.test(email) || body?.consent !== true) {
      return NextResponse.json({ error: "Enter a valid name and email and confirm consent." }, { status: 400 });
    }

    const mailchimp = await addMailchimpLead({ email, firstName, tag: funnel.mailchimpTag });
    const context = signalContextFromRequest(req);
    after(() => recordSignal("acquisition.signup_completed", {
      ...context,
      surface: "acquisition",
      firstTouch: sanitizeAttribution(body.firstTouch),
      lastTouch: sanitizeAttribution(body.lastTouch),
      properties: { funnel: funnel.slug, mailchimp_mode: mailchimp.mode, tagged: mailchimp.tagged },
      verified: mailchimp.mode === "live" && mailchimp.tagged,
      dedupeKey: context.sessionId ? `acquisition-signup:${context.sessionId}:${funnel.slug}` : null,
    }));
    return NextResponse.json({ ok: true, mode: mailchimp.mode });
  } catch (error) {
    console.warn("Acquisition signup failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "We could not unlock the check. Please try again." }, { status: 502 });
  }
}
