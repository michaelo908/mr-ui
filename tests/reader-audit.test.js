/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeUrls,
  stageBudget,
  BUDGETS,
} = require("../lib/audit/contracts.ts");
test("audit scope accepts only explicit URLs including the homepage", () => {
  assert.deepEqual(
    normalizeUrls(
      ["example.com", "https://example.com/about#team"],
      "comprehensive",
    ),
    ["https://example.com/", "https://example.com/about"],
  );
  assert.deepEqual(normalizeUrls(["https://example.com/en-au/"], "mini"), ["https://example.com/en-au/"]);
  assert.throws(() =>
    normalizeUrls(
      ["https://example.com/", "https://example.com/"],
      "comprehensive",
    ),
  );
  assert.throws(() =>
    normalizeUrls(
      ["https://example.com/", "https://example.com/about"],
      "mini",
    ),
  );
  assert.throws(() =>
    normalizeUrls(Array(6).fill("https://example.com/"), "comprehensive"),
  );
  assert.throws(() => normalizeUrls(["file:///etc/passwd"], "mini"));
  assert.throws(() =>
    normalizeUrls(["https://user:pass@example.com/"], "mini"),
  );
});
test("five-page stages stay within total token and retry allowances", () => {
  for (let n = 1; n <= 5; n++) {
    const p = stageBudget("comprehensive", n, false),
      s = stageBudget("comprehensive", n, true);
    assert.ok(p.input * n + s.input <= BUDGETS.comprehensive.input);
    assert.ok(p.output * n + s.output <= BUDGETS.comprehensive.output);
    assert.ok(
      2 *
        ((p.input * 10 + p.output * 50 + 18000) * n +
          s.input * 10 +
          s.output * 50) <=
        BUDGETS.comprehensive.reserve,
    );
  }
  const m = stageBudget("mini", 1, false);
  assert.ok(2 * (m.input * 10 + m.output * 50 + 18000) <= BUDGETS.mini.reserve);
});
test("audit metrics retain unknown failure cost and correlate only identified visitors", () => {
  const { auditMetrics } = require("../lib/audit/metrics.ts");
  const events = [
    {
      signal_name: "audit.completed",
      verified: true,
      visitor_id: "v1",
      properties: { audit_kind: "mini" },
    },
    {
      signal_name: "audit.purchased",
      verified: true,
      visitor_id: "v1",
      properties: { audit_kind: "comprehensive" },
    },
    {
      signal_name: "audit.completed",
      verified: true,
      visitor_id: "v2",
      properties: { audit_kind: "mini" },
    },
    {
      signal_name: "audit.purchased",
      verified: true,
      visitor_id: null,
      properties: { audit_kind: "comprehensive" },
    },
  ];
  const result = auditMetrics(events, [
    {
      reserved_microusd: 263000,
      actual_microusd: null,
      metrics: {},
      reader_audits: { kind: "mini" },
    },
    {
      reserved_microusd: 263000,
      actual_microusd: 100000,
      metrics: { input_tokens: 1000, output_tokens: 100 },
      reader_audits: { kind: "mini" },
    },
  ]);
  assert.equal(result.conversion, 0.5);
  assert.equal(result.costs[0].cost, 0.363);
  assert.equal(result.costs[0].uncertain, 1);
});

test("readiness HTML observations preserve technical uncertainty and do not follow links", () => {
 const {supportingHtmlEvidence}=require("../lib/audit/html-evidence.ts");
 const result=supportingHtmlEvidence('<h1>Clear purpose</h1><meta name="robots" content="noindex"><script>"<h1>Fake heading</h1>"</script><script type="application/ld+json">{}</script>',200,'text/html');
 assert.match(result,/H1: Clear purpose/);assert.match(result,/robots: noindex/);assert.doesNotMatch(result,/Fake heading/);assert.match(result,/accuracy not verified/);assert.match(result,/crawler-specific responses.*not tested/);
});
