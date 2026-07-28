/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const { cadenceInstruction } = require("../lib/cadence.ts");

test("Dynamic Cadence is limited to rewrite rhythm", () => {
  const instruction = cadenceInstruction("dynamic");
  assert.match(instruction, /APPLY TO REWRITE OUTPUT ONLY/);
  assert.match(instruction, /shorter sentences and paragraphs/);
  assert.match(instruction, /does not grant permission to compress/);
  assert.match(instruction, /Do not let Cadence\s+alter the Executive Summary/);
});

test("Sustained Cadence requests traditional long-form rhythm", () => {
  const instruction = cadenceInstruction("sustained");
  assert.match(instruction, /fuller paragraphs/);
  assert.match(instruction, /longer, more varied sentence structures/);
  assert.match(instruction, /short sentences rarely and deliberately/);
});
