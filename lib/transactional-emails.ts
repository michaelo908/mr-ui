const SUPPORT_EMAIL = "support@multirrupt.ai";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] || character);
}

function accessEmail(input: {
  heading: string;
  introduction: string;
  appUrl: string;
}) {
  const loginUrl = new URL("/login", input.appUrl).toString();
  const safeLoginUrl = escapeHtml(loginUrl);
  const html = `<!doctype html>
<html><body style="margin:0;background:#0b1015;color:#e8edf2;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:0 auto;padding:32px 22px">
    <h1 style="font-size:24px;margin:0 0 18px">${escapeHtml(input.heading)}</h1>
    <p style="line-height:1.6">${escapeHtml(input.introduction)}</p>
    <p style="line-height:1.6">Use the same email address you used at checkout. Gravitas will send you a secure magic login link.</p>
    <p style="margin:28px 0"><a href="${safeLoginUrl}" style="display:inline-block;background:#d4ae57;color:#111820;text-decoration:none;font-weight:700;padding:14px 22px;border-radius:8px">Open Gravitas</a></p>
    <p style="line-height:1.6">If the button does not work, open:<br><a href="${safeLoginUrl}" style="color:#69aefc">${safeLoginUrl}</a></p>
    <p style="line-height:1.6">Need help? <a href="mailto:${SUPPORT_EMAIL}" style="color:#69aefc">${SUPPORT_EMAIL}</a></p>
  </div>
</body></html>`;
  const text = `${input.heading}\n\n${input.introduction}\n\nUse the same email address you used at checkout. Gravitas will send you a secure magic login link.\n\nOpen Gravitas: ${loginUrl}\n\nNeed help? ${SUPPORT_EMAIL}`;
  return { html, text, loginUrl };
}

export function dayPassAccessEmail(appUrl: string) {
  return {
    subject: "Your Gravitas Day Pass is ready",
    ...accessEmail({
      heading: "Your Gravitas Day Pass is active",
      introduction: "Your 48-hour Gravitas access is active from the time of purchase.",
      appUrl,
    }),
  };
}

export function subscriptionActivationEmail(appUrl: string) {
  return {
    subject: "Your Gravitas subscription is active",
    ...accessEmail({
      heading: "Your Gravitas subscription is active",
      introduction: "Your Gravitas subscription access is now active.",
      appUrl,
    }),
  };
}
