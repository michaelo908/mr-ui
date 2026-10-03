type MetaPurchase = {
  eventId: string;
  eventTime: number;
  amountTotal: number | null;
  currency: string | null;
  product: "day_pass" | "subscription";
};

const META_GRAPH_API_VERSION = "v22.0";
const MULTIRRUPT_EVENT_URL = "https://www.multirrupt.ai/";

/**
 * Send the one authoritative Meta conversion: a payment Stripe has verified.
 *
 * Deliberately excludes customer identity, submitted writing, report content,
 * attribution details, and product URLs. The browser pixel provides the
 * optional quality signals; this server event provides purchase certainty.
 */
export async function sendMetaPurchase(input: MetaPurchase) {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return;

  const value = typeof input.amountTotal === "number"
    ? Number((input.amountTotal / 100).toFixed(2))
    : undefined;
  const customData: Record<string, string | number> = {
    content_name: input.product === "day_pass" ? "Day Pass" : "Subscription",
  };
  if (value !== undefined) customData.value = value;
  if (input.currency) customData.currency = input.currency.toLowerCase();

  try {
    const response = await fetch(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${encodeURIComponent(pixelId)}/events`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: [{
            event_name: "Purchase",
            event_time: input.eventTime,
            event_id: input.eventId,
            action_source: "website",
            event_source_url: MULTIRRUPT_EVENT_URL,
            custom_data: customData,
          }],
          access_token: accessToken,
        }),
      },
    );
    if (!response.ok) {
      console.warn("Meta Conversions API purchase event was rejected", { status: response.status });
    }
  } catch {
    // Measurement must never delay or jeopardise access to a paid product.
    console.warn("Meta Conversions API purchase event could not be sent");
  }
}
