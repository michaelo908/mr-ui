const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const referencePattern = new RegExp(`^ji_(${UUID})_(${UUID})$`, "i");

// Anonymous correlation only. Never use this client-supplied reference to grant access.
export function readJumpInPurchaseReference(value: string | null | undefined) {
  const match = value?.match(referencePattern);
  return match ? { visitorId: match[1], sessionId: match[2], surface: "jump-in" as const } : null;
}

export function jumpInPurchaseUrl(url: string, identity: { visitorId: string; sessionId: string }) {
  const reference = `ji_${identity.visitorId}_${identity.sessionId}`;
  if (!readJumpInPurchaseReference(reference)) return url;
  const target = new URL(url);
  target.searchParams.set("client_reference_id", reference);
  return target.toString();
}
