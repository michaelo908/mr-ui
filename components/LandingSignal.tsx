import Script from "next/script";

// This is intentionally an inline, before-interactive signal. It runs before
// the editor bundle hydrates, so a person who lands from an ad and leaves
// quickly is still counted as a landing rather than disappearing from Signals.
const landingSignal = String.raw`(function () {
  try {
    if (window.location.pathname !== "/") return;

    var visitorKey = "gravitasVisitorIdV1";
    var sessionKey = "gravitasSessionIdV1";
    var firstTouchKey = "gravitasFirstTouchV1";
    var lastTouchKey = "gravitasLastTouchV1";
    var landingKey = "gravitasSignalLandingViewedV1";
    var testKey = "multirruptSignalsBrowserExcludedV1";

    function uuid() {
      if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
      return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (character) {
        var random = Math.random() * 16 | 0;
        var value = character === "x" ? random : (random & 0x3 | 0x8);
        return value.toString(16);
      });
    }

    function stored(storage, key) {
      try {
        var value = storage.getItem(key);
        if (value) return value;
        value = uuid();
        storage.setItem(key, value);
        return value;
      } catch (_) {
        return uuid();
      }
    }

    function readJson(storage, key) {
      try { return JSON.parse(storage.getItem(key) || "null") || undefined; } catch (_) { return undefined; }
    }

    try {
      if (window.sessionStorage.getItem(landingKey)) return;
      window.sessionStorage.setItem(landingKey, "1");
    } catch (_) {}

    var visitorId = stored(window.localStorage, visitorKey);
    var sessionId = stored(window.sessionStorage, sessionKey);
    var query = new URLSearchParams(window.location.search);
    var referrerHost;
    try { referrerHost = document.referrer ? new URL(document.referrer).hostname : undefined; } catch (_) {}
    var touch = {
      landingPath: window.location.pathname,
      referrerHost: referrerHost,
      utmSource: query.get("utm_source") || undefined,
      utmMedium: query.get("utm_medium") || undefined,
      utmCampaign: query.get("utm_campaign") || undefined,
      utmContent: query.get("utm_content") || undefined,
      metaCampaignId: query.get("campaign_id") || query.get("meta_campaign_id") || undefined,
      metaAdSetId: query.get("adset_id") || query.get("meta_adset_id") || undefined,
      metaAdId: query.get("ad_id") || query.get("meta_ad_id") || undefined,
      creativeHypothesis: query.get("creative_hypothesis") || query.get("hypothesis") || undefined
    };
    var firstTouch = readJson(window.localStorage, firstTouchKey) || touch;
    try {
      if (!window.localStorage.getItem(firstTouchKey)) window.localStorage.setItem(firstTouchKey, JSON.stringify(firstTouch));
      window.localStorage.setItem(lastTouchKey, JSON.stringify(touch));
    } catch (_) {}
    var isTest = false;
    try { isTest = window.localStorage.getItem(testKey) === "1"; } catch (_) {}

    void fetch("/api/signals", {
      method: "POST",
      keepalive: true,
      headers: Object.assign({ "Content-Type": "application/json" }, isTest ? { "X-Gravitas-Test": "1" } : {}),
      body: JSON.stringify({
        name: "discovery.landing_viewed",
        version: 1,
        visitorId: visitorId,
        sessionId: sessionId,
        surface: "jump-in",
        firstTouch: firstTouch,
        lastTouch: touch,
        properties: { entry_path: window.location.pathname },
        isTest: isTest
      })
    });
  } catch (_) {}
})();`;

export default function LandingSignal() {
  return <Script id="multirrupt-landing-signal" strategy="beforeInteractive">{landingSignal}</Script>;
}
