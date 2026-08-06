"use client";

import type { SignalAttribution } from "@/lib/signals/contracts";
import type { SignalName } from "@/lib/signals/registry";

const VISITOR_KEY = "gravitasVisitorIdV1";
const SESSION_KEY = "gravitasSessionIdV1";
const FIRST_TOUCH_KEY = "gravitasFirstTouchV1";
const LAST_TOUCH_KEY = "gravitasLastTouchV1";

function safeStorage(storage: Storage, key: string, fallback: string) {
  try {
    const existing = storage.getItem(key);
    if (existing) return existing;
    storage.setItem(key, fallback);
  } catch {}
  return fallback;
}

function clean(value: string | null) {
  return value?.trim().slice(0, 240) || undefined;
}

export function captureAttribution(): SignalAttribution {
  const query = new URLSearchParams(window.location.search);
  let referrerHost: string | undefined;
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname : undefined; } catch {}
  return {
    landingPath: window.location.pathname,
    referrerHost,
    utmSource: clean(query.get("utm_source")),
    utmMedium: clean(query.get("utm_medium")),
    utmCampaign: clean(query.get("utm_campaign")),
    utmContent: clean(query.get("utm_content")),
    metaCampaignId: clean(query.get("campaign_id") ?? query.get("meta_campaign_id")),
    metaAdSetId: clean(query.get("adset_id") ?? query.get("meta_adset_id")),
    metaAdId: clean(query.get("ad_id") ?? query.get("meta_ad_id")),
    creativeHypothesis: clean(query.get("creative_hypothesis") ?? query.get("hypothesis")),
  };
}

function readJson(key: string): SignalAttribution | undefined {
  try { return JSON.parse(localStorage.getItem(key) || "null") || undefined; } catch { return undefined; }
}

export function initializeSignalIdentity() {
  const visitorId = safeStorage(localStorage, VISITOR_KEY, crypto.randomUUID());
  const sessionId = safeStorage(sessionStorage, SESSION_KEY, crypto.randomUUID());
  const touch = captureAttribution();
  const firstTouch = readJson(FIRST_TOUCH_KEY) ?? touch;
  try {
    if (!localStorage.getItem(FIRST_TOUCH_KEY)) localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouch));
    localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
  } catch {}
  return { visitorId, sessionId, firstTouch, lastTouch: touch };
}

export function signalHeaders(surface: "jump-in" | "paid") {
  const identity = initializeSignalIdentity();
  return {
    "X-Gravitas-Visitor-Id": identity.visitorId,
    "X-Gravitas-Session-Id": identity.sessionId,
    "X-Gravitas-Surface": surface,
    ...(location.hostname === "localhost" ? { "X-Gravitas-Test": "1" } : {}),
  };
}

export function emitSignal(
  name: SignalName,
  surface: "jump-in" | "paid",
  properties: Record<string, unknown> = {}
) {
  try {
    const identity = initializeSignalIdentity();
    void fetch("/api/signals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        name,
        version: 1,
        ...identity,
        surface,
        properties,
        isTest: location.hostname === "localhost",
      }),
    }).catch(() => undefined);
  } catch {}
}

export function toSignalIdentifier(value: string, fallback = "unknown") {
  const identifier = value.toLowerCase().trim().replace(/[^a-z0-9._~-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return identifier || fallback;
}
