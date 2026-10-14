/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { cadenceInstruction } = require("../lib/cadence.ts");

test("Dynamic Cadence is limited to rewrite rhythm", () => {
  const instruction = cadenceInstruction("dynamic");
  assert.match(instruction, /APPLY TO REWRITE OUTPUT ONLY/);
  assert.match(instruction, /shorter sentences and paragraphs/);
  assert.match(instruction, /does not grant permission to compress/);
  assert.match(instruction, /Do not let Cadence\s+alter the Editor's Summary/);
});

test("Sustained Cadence requests traditional long-form rhythm", () => {
  const instruction = cadenceInstruction("sustained");
  assert.match(instruction, /developed, connected paragraphs/);
  assert.match(instruction, /longer and more varied sentence structures/);
  assert.match(instruction, /isolated short lines rarely/);
  assert.match(instruction, /Do not produce repetitive one-sentence paragraphs/);
  assert.match(instruction, /SaaS-style staccato/);
  assert.match(instruction, /valid rewrite should read as connected prose/);
  assert.match(instruction, /clear\s+transitions between ideas/);
});

test("selected cadence reaches every rewrite prompt path", () => {
  const app = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../components/GravitasApp.tsx"),
    "utf8"
  );
  const route = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../app/api/mr/route.ts"),
    "utf8"
  );

  assert.match(app, /cadence,\s*selectedGraviton/);
  assert.match(app, /requestKind: "initial-rewrite-repair"[\s\S]*cadence,/);
  assert.match(app, /requestKind:\s*"alternate-rewrite"[\s\S]*cadence,/);
  assert.match(app, /cadenceInstruction\(cadence\)/);
  assert.match(route, /const cadence: CadenceMode =[\s\S]*isCadenceMode\(body\?\.cadence\) \? body.cadence : "dynamic"/);
  assert.match(route, /const rewriteCadenceContext = heresyMode \? "" : cadenceInstruction\(cadence\)/);
  assert.match(route, /rewriteOnlyInstruction\([\s\S]*selectedGraviton[\s\S]*initialRewriteRepair \? "initial" : "alternate"[\s\S]*\)/);
});

test("selected cadence is used when validating rewrite output", () => {
  const app = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../components/GravitasApp.tsx"),
    "utf8"
  );
  const route = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../app/api/mr/route.ts"),
    "utf8"
  );

  assert.match(app, /isValidRewriteCandidate\(alternateRewrite, content, cadence\)/);
  assert.match(app, /isValidRewriteCandidate\(initialRewriteContent, specialistAnalysisContext, cadence\)/);
  assert.match(app, /isValidRewriteCandidate\(repairedRewrite, specialistAnalysisContext, cadence\)/);
  assert.match(route, /isValidRewriteCandidate\(extractRewriteOrRaw\(json\.output\), "", cadence\)/);
});


test("all four cadences validate, with Preserve taking priority over rhythm", () => {
  const { CADENCE_OPTIONS, isCadenceMode } = require("../lib/cadence.ts");
  assert.deepEqual(CADENCE_OPTIONS.map((option) => option.value), ["dynamic", "dynamic-preserve", "sustained", "sustained-preserve"]);
  for (const { value } of CADENCE_OPTIONS) assert.equal(isCadenceMode(value), true);
  for (const value of [undefined, null, "unknown", {}, "Dynamic"]) assert.equal(isCadenceMode(value), false);
  for (const mode of ["dynamic-preserve", "sustained-preserve"]) {
    const instruction = cadenceInstruction(mode);
    assert.match(instruction, /top 2–3 critical reader-side problems/);
    assert.match(instruction, /OVERRIDES RHYTHM/);
    assert.match(instruction, /humour and useful anecdotes/);
    assert.match(instruction, /Leave everything else intact/);
  }
  assert.doesNotMatch(cadenceInstruction("dynamic"), /PRESERVE —/);
  assert.doesNotMatch(cadenceInstruction("sustained"), /PRESERVE —/);
});

test("Graviton guidance covers every offered lens and uses valid pairings", () => {
  const { GRAVITON_GUIDANCE } = require("../lib/graviton-guidance.ts");
  const { isCadenceMode } = require("../lib/cadence.ts");
  const app = require("node:fs").readFileSync(require("node:path").join(__dirname, "../components/GravitasApp.tsx"), "utf8");
  const groups = app.split("const gravitonGroups = [")[1].split("\n];")[0];
  const options = [...groups.matchAll(/options: \[([\s\S]*?)\]/g)].flatMap((match) => [...match[1].matchAll(/"([^"]+)"/g)].map((option) => option[1]));
  assert.equal(options.length, Object.keys(GRAVITON_GUIDANCE).length);
  for (const option of options) {
    const guidance = GRAVITON_GUIDANCE[option];
    assert.ok(guidance?.description.startsWith("Best for"), option);
    assert.ok(guidance.recommendedCadence === null || isCadenceMode(guidance.recommendedCadence));
  }
});
