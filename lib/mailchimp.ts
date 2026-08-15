import { createHash } from "node:crypto";

type MailchimpSignup = { email: string; firstName: string; tag: string };

export type MailchimpSignupResult = { mode: "draft" | "live"; tagged: boolean };

export async function addMailchimpLead(input: MailchimpSignup): Promise<MailchimpSignupResult> {
  if (process.env.MAILCHIMP_SIGNUP_MODE !== "live") {
    return { mode: "draft", tagged: false };
  }

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const server = process.env.MAILCHIMP_SERVER_PREFIX || apiKey?.split("-").at(-1);
  if (!apiKey || !audienceId || !server) throw new Error("Mailchimp is not configured.");

  const normalizedEmail = input.email.trim().toLowerCase();
  const memberHash = createHash("md5").update(normalizedEmail).digest("hex");
  const endpoint = `https://${server}.api.mailchimp.com/3.0/lists/${audienceId}/members/${memberHash}`;
  const authorization = `Basic ${Buffer.from(`gravitas:${apiKey}`).toString("base64")}`;

  const memberResponse = await fetch(endpoint, {
    method: "PUT",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({
      email_address: normalizedEmail,
      status_if_new: "subscribed",
      merge_fields: { FNAME: input.firstName.trim() },
    }),
  });
  if (!memberResponse.ok) throw new Error("Mailchimp rejected the contact update.");

  const tagResponse = await fetch(`${endpoint}/tags`, {
    method: "POST",
    headers: { Authorization: authorization, "Content-Type": "application/json" },
    body: JSON.stringify({ tags: [{ name: input.tag, status: "active" }] }),
  });
  if (!tagResponse.ok) throw new Error("Mailchimp rejected the funnel tag.");
  return { mode: "live", tagged: true };
}
