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
  assert.match(route, /const cadence: CadenceMode =[\s\S]*body\?\.cadence === "sustained" \? "sustained" : "dynamic"/);
  assert.match(route, /const rewriteCadenceContext = heresyMode \? "" : cadenceInstruction\(cadence\)/);
  assert.match(route, /rewriteOnlyInstruction\([\s\S]*selectedGraviton[\s\S]*initialRewriteRepair \? "initial" : "alternate"[\s\S]*\)/);
});
