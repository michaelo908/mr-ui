import { after, NextResponse } from "next/server";
import {
  ACQUISITION_CONSENT_VERSION,
  getAcquisitionFunnel,
} from "@/lib/acquisition-funnels";
import {
  addMailchimpLead,
  describeMailchimpFailure,
  type MailchimpSignupResult,
} from "@/lib/mailchimp";
import { sanitizeAttribution } from "@/lib/signals/contracts";
import { consumeSignalRateLimit, recordSignal, signalContextFromRequest } from "@/lib/signals/server";
import { resolveLifecycleForEmail } from "@/lib/lifecycle-server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  try {
    const rateLimit = await consumeSignalRateLimit(req);
    if (rateLimit === "limited") return NextResponse.json({ error: "Please wait and try again." }, { status: 429 });
    const body = await req.json();
    const funnel = getAcquisitionFunnel(String(body?.funnel || ""));
    const firstName = String(body?.firstName || "").trim().slice(0, 60);
    const email = String(body?.email || "").trim().toLowerCase().slice(0, 254);
    if (!funnel || !firstName || !EMAIL.test(email)) {
      return NextResponse.json({ error: "Enter a valid name and email." }, { status: 400 });
    }

    const context = signalContextFromRequest(req);
    let mailchimp: MailchimpSignupResult | null = null;
    let failure: ReturnType<typeof describeMailchimpFailure> | null = null;
    let lifecycleState: "jump_in" | "day_pass" | "subscriber" | undefined;
    try {
      lifecycleState = (await resolveLifecycleForEmail(email)).state;
    } catch {
      console.warn("Acquisition lifecycle lookup failed", {
        category: "lifecycle_lookup_failed",
        funnel: funnel.slug,
      });
    }
    try {
      mailchimp = await addMailchimpLead({
        email,
        firstName,
        tag: funnel.mailchimpTag,
        consentTag: ACQUISITION_CONSENT_VERSION,
        lifecycleState,
      });
    } catch (error) {
      failure = describeMailchimpFailure(error);
      console.warn("Acquisition Mailchimp capture failed", {
        category: failure.category,
        providerStatus: failure.providerStatus,
        runtime: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
        funnel: funnel.slug,
      });
    }
    after(() => recordSignal("acquisition.signup_completed", {
      ...context,
      surface: "acquisition",
      firstTouch: sanitizeAttribution(body.firstTouch),
      lastTouch: sanitizeAttribution(body.lastTouch),
      properties: {
        funnel: funnel.slug,
        consent_version: ACQUISITION_CONSENT_VERSION,
        mailchimp_mode: mailchimp?.mode ?? "live",
        mailchimp_outcome: mailchimp?.outcome ?? "failed",
        mailchimp_failure_category: failure?.category ?? null,
        mailchimp_provider_status: failure?.providerStatus ?? null,
        tagged: mailchimp?.tagged ?? false,
      },
      verified: mailchimp?.outcome === "captured" && mailchimp.tagged,
      dedupeKey: context.sessionId ? `acquisition-signup:${context.sessionId}:${funnel.slug}` : null,
    }));
    return NextResponse.json({
      ok: true,
      integration: mailchimp?.outcome ?? "unavailable",
    });
  } catch (error) {
    console.warn("Acquisition signup failed", { reason: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ error: "We could not unlock the check. Please try again." }, { status: 502 });
  }
}
