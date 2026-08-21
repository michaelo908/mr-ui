import { createHash } from "node:crypto";

type MailchimpSignup = { email: string; firstName: string; tag: string; consentTag: string };
type MailchimpBuyer = { email: string };

export type MailchimpSignupResult = {
  mode: "draft" | "live";
  outcome: "captured" | "draft" | "restricted";
  tagged: boolean;
  contactStatus: string | null;
};

export type MailchimpFailureCategory =
  | "missing_configuration"
  | "member_rejected"
  | "tag_rejected"
  | "network_error"
  | "invalid_response";

export class MailchimpIntegrationError extends Error {
  constructor(
    public readonly category: MailchimpFailureCategory,
    public readonly providerStatus: number | null = null
  ) {
    super(`Mailchimp integration failed: ${category}`);
    this.name = "MailchimpIntegrationError";
  }
}

export function describeMailchimpFailure(error: unknown) {
  if (error instanceof MailchimpIntegrationError) {
    return { category: error.category, providerStatus: error.providerStatus };
  }
  return { category: "network_error" as const, providerStatus: null };
}

async function mailchimpFetch(url: string, init: RequestInit) {
  try {
    return await fetch(url, init);
  } catch {
    throw new MailchimpIntegrationError("network_error");
  }
}

export async function addMailchimpLead(input: MailchimpSignup): Promise<MailchimpSignupResult> {
  const mode = process.env.MAILCHIMP_SIGNUP_MODE;
  if (mode === "draft") {
    return { mode: "draft", outcome: "draft", tagged: false, contactStatus: null };
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey?.split("-").at(-1);
  if (mode !== "live" || !apiKey || !audienceId || !server) {
    throw new MailchimpIntegrationError("missing_configuration");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const memberHash = createHash("md5").update(normalizedEmail).digest("hex");
  const endpoint = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`;
  const authorization = `Basic ${Buffer.from(`gravitas:${apiKey}`).toString("base64")}`;

  const memberResponse = await mailchimpFetch(endpoint, {
    method: "PUT",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: normalizedEmail,
      status_if_new: "subscribed",
      merge_fields: { FNAME: input.firstName.trim() },
    }),
  });
  if (!memberResponse.ok) {
    throw new MailchimpIntegrationError("member_rejected", memberResponse.status);
  }

  const member = await memberResponse.json().catch(() => null) as { status?: unknown } | null;
  if (!member || typeof member.status !== "string") {
    throw new MailchimpIntegrationError("invalid_response", memberResponse.status);
  }
  if (member.status !== "subscribed") {
    return {
      mode: "live",
      outcome: "restricted",
      tagged: false,
      contactStatus: member.status,
    };
  }

  const tagResponse = await mailchimpFetch(`${endpoint}/tags`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({
      tags: [input.tag, input.consentTag].map((name) => ({ name, status: "active" })),
    }),
  });
  if (!tagResponse.ok) {
    throw new MailchimpIntegrationError("tag_rejected", tagResponse.status);
  }
  return { mode: "live", outcome: "captured", tagged: true, contactStatus: member.status };
}

export async function tagExistingMailchimpDayPassBuyer(input: MailchimpBuyer) {
  const mode = process.env.MAILCHIMP_SIGNUP_MODE;
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey?.split("-").at(-1);
  if (mode !== "live" || !apiKey || !audienceId || !server) {
    throw new MailchimpIntegrationError("missing_configuration");
  }

  const normalizedEmail = input.email.trim().toLowerCase();
  const memberHash = createHash("md5").update(normalizedEmail).digest("hex");
  const endpoint = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`;
  const authorization = `Basic ${Buffer.from(`gravitas:${apiKey}`).toString("base64")}`;
  const memberResponse = await mailchimpFetch(endpoint, {
    method: "GET",
    headers: { Authorization: authorization },
  });
  if (memberResponse.status === 404) return { outcome: "not_permitted" as const, tagged: false };
  if (!memberResponse.ok) {
    throw new MailchimpIntegrationError("member_rejected", memberResponse.status);
  }
  const member = await memberResponse.json().catch(() => null) as { status?: unknown } | null;
  if (!member || typeof member.status !== "string") {
    throw new MailchimpIntegrationError("invalid_response", memberResponse.status);
  }
  if (member.status !== "subscribed") {
    return { outcome: "restricted" as const, tagged: false };
  }

  const tagResponse = await mailchimpFetch(`${endpoint}/tags`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ tags: [{ name: "gravitas-day-pass-buyer", status: "active" }] }),
  });
  if (!tagResponse.ok) {
    throw new MailchimpIntegrationError("tag_rejected", tagResponse.status);
  }
  return { outcome: "tagged" as const, tagged: true };
}
