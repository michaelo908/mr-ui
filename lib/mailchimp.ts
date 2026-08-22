import { createHash } from "node:crypto";
import { higherLifecycle, type GravitasLifecycleState } from "@/lib/lifecycle";

type MailchimpSignup = {
  email: string;
  firstName: string;
  tag: string;
  consentTag: string;
  lifecycleState?: GravitasLifecycleState;
};
type MailchimpBuyer = { email: string };
type MailchimpLifecycle = {
  email: string;
  state: GravitasLifecycleState;
  permanentTags?: string[];
  authoritative?: boolean;
};

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

function config() {
  const mode = process.env.MAILCHIMP_SIGNUP_MODE;
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey?.split("-").at(-1);
  if (mode !== "live" || !apiKey || !audienceId || !server) {
    throw new MailchimpIntegrationError("missing_configuration");
  }
  return {
    audienceId,
    server,
    authorization: `Basic ${Buffer.from(`gravitas:${apiKey}`).toString("base64")}`,
  };
}

function endpointFor(email: string, audienceId: string, server: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const memberHash = createHash("md5").update(normalizedEmail).digest("hex");
  return {
    normalizedEmail,
    endpoint: `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`,
  };
}

async function updateLifecycleField(input: {
  endpoint: string;
  authorization: string;
  current?: unknown;
  proposed: GravitasLifecycleState;
  authoritative?: boolean;
}) {
  const current = ["jump_in", "day_pass", "subscriber"].includes(String(input.current))
    ? input.current as GravitasLifecycleState
    : null;
  const state = input.authoritative
    ? input.proposed
    : higherLifecycle(current, input.proposed);
  const response = await mailchimpFetch(input.endpoint, {
    method: "PATCH",
    headers: { Authorization: input.authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ merge_fields: { GRAVSTATE: state } }),
  });
  if (!response.ok) throw new MailchimpIntegrationError("member_rejected", response.status);
  return state;
}

export async function addMailchimpLead(input: MailchimpSignup): Promise<MailchimpSignupResult> {
  const mode = process.env.MAILCHIMP_SIGNUP_MODE;
  if (mode === "draft") {
    return { mode: "draft", outcome: "draft", tagged: false, contactStatus: null };
  }

  const { audienceId, server, authorization } = config();
  const { normalizedEmail, endpoint } = endpointFor(input.email, audienceId, server);

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

  const member = await memberResponse.json().catch(() => null) as {
    status?: unknown;
    merge_fields?: Record<string, unknown>;
  } | null;
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

  if (input.lifecycleState) {
    await updateLifecycleField({
      endpoint,
      authorization,
      current: member.merge_fields?.GRAVSTATE,
      proposed: input.lifecycleState,
    });
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
  return syncExistingMailchimpLifecycle({
    email: input.email,
    state: "day_pass",
    permanentTags: ["gravitas-day-pass-buyer"],
  });
}

export async function syncExistingMailchimpLifecycle(input: MailchimpLifecycle) {
  const { audienceId, server, authorization } = config();
  const { endpoint } = endpointFor(input.email, audienceId, server);
  const memberResponse = await mailchimpFetch(endpoint, {
    method: "GET",
    headers: { Authorization: authorization },
  });
  if (memberResponse.status === 404) return { outcome: "not_permitted" as const, tagged: false };
  if (!memberResponse.ok) {
    throw new MailchimpIntegrationError("member_rejected", memberResponse.status);
  }
  const member = await memberResponse.json().catch(() => null) as {
    status?: unknown;
    merge_fields?: Record<string, unknown>;
  } | null;
  if (!member || typeof member.status !== "string") {
    throw new MailchimpIntegrationError("invalid_response", memberResponse.status);
  }
  if (member.status !== "subscribed") {
    return { outcome: "restricted" as const, tagged: false };
  }

  const state = await updateLifecycleField({
    endpoint,
    authorization,
    current: member.merge_fields?.GRAVSTATE,
    proposed: input.state,
    authoritative: input.authoritative,
  });

  const permanentTags = [...new Set(input.permanentTags ?? [])];
  if (permanentTags.length) {
    const tagResponse = await mailchimpFetch(`${endpoint}/tags`, {
      method: "POST",
      headers: { Authorization: authorization, "Content-Type": "application/json" },
      body: JSON.stringify({ tags: permanentTags.map((name) => ({ name, status: "active" })) }),
    });
    if (!tagResponse.ok) {
      throw new MailchimpIntegrationError("tag_rejected", tagResponse.status);
    }
  }
  return { outcome: "tagged" as const, tagged: permanentTags.length > 0, state };
}
