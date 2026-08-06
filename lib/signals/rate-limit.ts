import { createHmac } from "crypto";

export function buildSignalRateLimitBucket(address: string, secret: string, now: Date) {
  const day = now.toISOString().slice(0, 10);
  return createHmac("sha256", secret).update(`${day}:${address}`).digest("hex");
}
