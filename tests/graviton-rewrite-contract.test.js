/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  extractRewriteOrRaw,
  gravitonRewriteInstruction,
  isRewriteCapableGraviton,
  isValidRewriteCandidate,
  removeStructuredRewrite,
  replaceStructuredRewrite,
  rewriteOnlyInstruction,
} = require("../lib/graviton-rewrite.ts");
const { cadenceInstruction } = require("../lib/cadence.ts");
const { buildAnalysisInput } = require("../lib/gravitas-analysis-request.ts");
const { buildRenderedUrlAnalysisInput } = require("../lib/sources.ts");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const credibility = "What builds credibility?";
const visualFit = "Which images best fit the narrative and emotional context?";

test("URL credibility analysis with Dynamic requests a specialist-led first rewrite", () => {
  const renderedUrl = buildRenderedUrlAnalysisInput(
    "Trusted by teams. Contact us today.",
    credibility
  );
  const input = buildAnalysisInput({
    inputMode: "url",
    raw: renderedUrl,
    selectedGraviton: credibility,
    imageCount: 0,
  });
  const rewriteContract = gravitonRewriteInstruction(credibility);
  const cadence = cadenceInstruction("dynamic");

  assert.match(input, /Analysis Lens:\nWhat builds credibility\?/);
  assert.match(input, /ordered rendered webpage viewports/);
  assert.match(rewriteContract, /REWRITE CAPABILITY: REQUIRED/);
  assert.match(rewriteContract, /first actual rewrite immediately/);
  assert.match(rewriteContract, /completed specialist analysis as the editorial basis/);
  assert.match(rewriteContract, /credibility signals are expressed more convincingly/);
  assert.match(cadence, /DYNAMIC CADENCE/);
  assert.match(cadence, /APPLY TO REWRITE OUTPUT ONLY/);
});

test("placeholder and credibility-analysis-shaped rewrite fields are rejected", () => {
  assert.equal(
    isValidRewriteCandidate("The user did not request a rewrite."),
    false
  );
  assert.equal(
    isValidRewriteCandidate(
      "The landing page builds credibility through its customer logos, detailed claims, and restrained visual hierarchy."
    ),
    false
  );
  assert.equal(
    isValidRewriteCandidate(
      "Trusted by operations teams who need every handoff accounted for. See the complete workflow, the evidence behind each result, and the people responsible before you decide."
    ),
    true
  );
});

test("an invalid initial rewrite can be replaced without disturbing its specialist analysis", () => {
  const report = `Editor's Summary\nCredibility arrives too late.\n\nNarrative Performance\nThe visitor must infer proof.\n\nEditor's Notes in Depth\nProof appears after the principal claim.\n\nRewrite\nThe user did not request a rewrite.\n\nEditor's Debrief\n• **Proof moved:** Evidence now precedes the claim.`;
  const replacement =
    "Trusted by operations teams who need every handoff accounted for. Review the evidence behind each result before you decide.";
  const repaired = replaceStructuredRewrite(report, replacement);

  assert.equal(extractRewriteOrRaw(repaired), replacement);
  assert.match(repaired, /Credibility arrives too late/);
  assert.match(repaired, /Proof appears after the principal claim/);
  assert.doesNotMatch(repaired, /did not request a rewrite/);

  const rejected = removeStructuredRewrite(report);
  assert.match(rejected, /Credibility arrives too late/);
  assert.doesNotMatch(rejected, /did not request a rewrite/);
  assert.doesNotMatch(rejected, /Editor's Debrief/);
});

test("image-oriented Gravitons remain outside the rewrite contract", () => {
  assert.equal(isRewriteCapableGraviton(visualFit), false);
  assert.match(gravitonRewriteInstruction(visualFit), /REWRITE CAPABILITY: OMIT/);
  assert.equal(isRewriteCapableGraviton(credibility), true);
});

test("rewrite-only requests reject analysis and require finished copy", () => {
  const instruction = rewriteOnlyInstruction(credibility, "initial");
  assert.match(instruction, /supplied specialist analysis/);
  assert.match(instruction, /only finished rewritten source copy/);

  const route = read("app/api/mr/route.ts");
  assert.match(route, /initial-rewrite-repair/);
  assert.match(route, /isValidRewriteCandidate\(extractRewriteOrRaw\(json\.output\)\)/);
});

test("client repairs invalid initial output and keeps the rewrite panel collapsed", () => {
  const app = read("components/GravitasApp.tsx");

  assert.match(app, /requestKind: "initial-rewrite-repair"/);
  assert.match(app, /SPECIALIST ANALYSIS TO USE AS THE EDITORIAL BASIS/);
  assert.match(app, /selectedGraviton,/);
  assert.match(app, /sourceIdentity\?\.type === "url" \? "rendered-url"/);
  assert.match(app, /replaceStructuredRewrite/);
  assert.match(app, /The rewrite could not be completed\. Please try again\./);
  assert.match(app, /"X-Gravitas-Analysis-Id": runId/);
  assert.doesNotMatch(app, /`\$\{runId\}:initial-rewrite`/);
  assert.doesNotMatch(
    app,
    /if \(rewrites\.length > 0\) setShowRewrite\(true\)/
  );
  assert.match(app, /rewrites\.length > 0 && !showRewrite && showRewriteButton/);
});

test("fresh and restored analyses always initialise with closed rewrite panels", () => {
  const app = read("components/GravitasApp.tsx");
  const workspace = read("lib/gravitas-workspace.ts");

  assert.match(app, /const \[showRewrite, setShowRewrite\] = useState\(false\)/);
  assert.match(app, /setShowRewrite\(false\)/);
  assert.doesNotMatch(
    app,
    /if \(interactionLocked && rewrites\.length > 0\) \{\s*setShowRewrite\(true\)/
  );
  assert.doesNotMatch(app, /const handleRewriteClick = \(\) => \{\s*if \(interactionLocked\) return/);
  assert.doesNotMatch(workspace, /showRewrite|rewritePanelOpen/);
});
