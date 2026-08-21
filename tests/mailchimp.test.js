/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.resolve(__dirname, "../lib/mailchimp.ts"), "utf8");

function loadMailchimp(env, fetchImpl) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const testModule = { exports: {} };
  vm.runInNewContext(compiled, {
    module: testModule,
    exports: testModule.exports,
    require,
    process: { env: { ...env } },
    fetch: fetchImpl,
    Buffer,
    Request,
    Response,
  });
  return testModule.exports;
}

const input = {
  email: "Person@Example.net",
  firstName: "  Alex  ",
  tag: "gravitas_email_check_lead",
  consentTag: "gravitas_doorway_consent_v1",
};

test("explicit draft mode is the only non-live success path", async () => {
  let calls = 0;
  const api = loadMailchimp({ MAILCHIMP_SIGNUP_MODE: "draft" }, async () => { calls += 1; });
  const result = await api.addMailchimpLead(input);
  assert.deepEqual({ ...result }, { mode: "draft", outcome: "draft", tagged: false, contactStatus: null });
  assert.equal(calls, 0);
});

test("missing or partial configuration fails truthfully without a provider request", async () => {
  for (const env of [
    {},
    { MAILCHIMP_SIGNUP_MODE: "live" },
    { MAILCHIMP_SIGNUP_MODE: "live", MAILCHIMP_API_KEY: "secret-us6" },
  ]) {
    let calls = 0;
    const api = loadMailchimp(env, async () => { calls += 1; });
    await assert.rejects(api.addMailchimpLead(input), (error) => {
      const failure = api.describeMailchimpFailure(error);
      return failure.category === "missing_configuration" && failure.providerStatus === null;
    });
    assert.equal(calls, 0);
  }
});

test("live capture preserves identity fields and applies doorway and consent tags", async () => {
  const calls = [];
  const api = loadMailchimp({
    MAILCHIMP_SIGNUP_MODE: "live",
    MAILCHIMP_API_KEY: "secret-us6",
    MAILCHIMP_AUDIENCE_ID: "audience",
    MAILCHIMP_SERVER_PREFIX: "us6",
  }, async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return new Response(JSON.stringify({ status: "subscribed" }), { status: 200 });
    return new Response(null, { status: 204 });
  });

  const result = await api.addMailchimpLead(input);
  assert.deepEqual({ ...result }, { mode: "live", outcome: "captured", tagged: true, contactStatus: "subscribed" });
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /lists\/audience\/members\/[a-f0-9]{32}$/);
  const memberBody = JSON.parse(calls[0].init.body);
  assert.equal(memberBody.email_address, "person@example.net");
  assert.equal(memberBody.merge_fields.FNAME, "Alex");
  assert.equal(memberBody.status_if_new, "subscribed");
  assert.equal(Object.hasOwn(memberBody, "status"), false);
  const tagBody = JSON.parse(calls[1].init.body);
  assert.deepEqual(tagBody.tags, [
    { name: "gravitas_email_check_lead", status: "active" },
    { name: "gravitas_doorway_consent_v1", status: "active" },
  ]);
});

test("restricted contacts are not resubscribed or tagged", async () => {
  const calls = [];
  const api = loadMailchimp({
    MAILCHIMP_SIGNUP_MODE: "live",
    MAILCHIMP_API_KEY: "secret-us6",
    MAILCHIMP_AUDIENCE_ID: "audience",
  }, async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: "unsubscribed" }), { status: 200 });
  });
  const result = await api.addMailchimpLead(input);
  assert.deepEqual({ ...result }, { mode: "live", outcome: "restricted", tagged: false, contactStatus: "unsubscribed" });
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(JSON.parse(calls[0].init.body), "status"), false);
});

test("provider failures expose only safe category and status", async () => {
  const secret = "do-not-log-this-us6";
  const api = loadMailchimp({
    MAILCHIMP_SIGNUP_MODE: "live",
    MAILCHIMP_API_KEY: secret,
    MAILCHIMP_AUDIENCE_ID: "audience",
  }, async () => new Response(JSON.stringify({ detail: secret }), { status: 400 }));
  await assert.rejects(api.addMailchimpLead(input), (error) => {
    const failure = api.describeMailchimpFailure(error);
    assert.deepEqual({ ...failure }, { category: "member_rejected", providerStatus: 400 });
    assert.equal(String(error).includes(secret), false);
    assert.equal(JSON.stringify(failure).includes(secret), false);
    return true;
  });
});

test("invalid success payload and network failure are classified safely", async () => {
  const env = {
    MAILCHIMP_SIGNUP_MODE: "live",
    MAILCHIMP_API_KEY: "secret-us6",
    MAILCHIMP_AUDIENCE_ID: "audience",
  };
  const invalidApi = loadMailchimp(env, async () => new Response("{}", { status: 200 }));
  await assert.rejects(invalidApi.addMailchimpLead(input), (error) =>
    invalidApi.describeMailchimpFailure(error).category === "invalid_response");
  const networkApi = loadMailchimp(env, async () => { throw new Error("offline"); });
  await assert.rejects(networkApi.addMailchimpLead(input), (error) =>
    networkApi.describeMailchimpFailure(error).category === "network_error");
});
