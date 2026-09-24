/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("customer-facing Multirrupt branding uses the shared approved logo", () => {
  const css = read("app/globals.css");
  const login = read("app/login/page.tsx");
  const app = read("components/GravitasApp.tsx");
  const homepage = read("components/GravitasHomepage.tsx");
  const doorway = read("components/AcquisitionLandingPage.tsx");

  assert.equal(fs.existsSync(path.join(root, "public", "multirrupt-narrative-intelligence-logo.png")), true);
  assert.match(css, /multirrupt-narrative-intelligence-logo\.png/);
  for (const source of [login, app, homepage, doorway]) {
    assert.match(source, /gravitas-blue-logo/);
  }
  assert.match(login, /Multirrupt Narrative Intelligence/);
  assert.match(app, /Full Multirrupt\. 20 minutes\./);
  assert.match(app, /Already have a subscription or Day Pass\? Log in/);
  assert.match(app, /gravitas-blue-logo multirrupt-editor-logo/);
  assert.match(css, /\.multirrupt-editor-logo\s*\{[\s\S]*width: 222px;[\s\S]*height: 47px;/);
  assert.match(app, /See the narrative from the other side\./);
  assert.match(homepage, /What Multirrupt gives you back/);
  assert.match(doorway, /Login to Multirrupt/);
});

test("customer copy and transactional templates use Multirrupt while Gravitate and Gravitons remain", () => {
  const app = read("components/GravitasApp.tsx");
  const funnels = read("lib/acquisition-funnels.ts");
  const emails = read("lib/transactional-emails.ts");
  const metadata = read("app/layout.tsx");

  for (const source of [app, funnels, emails, metadata]) {
    assert.doesNotMatch(source, /Gravitas(?:\s+(?:access|Day Pass|subscription|emails|Email Check|Proposal Check|Landing Page Check)|\.|,|\?|!|<|$)/);
  }
  assert.match(app, /isLoading \? "Working…" : "Gravitate"/);
  assert.match(app, /aria-label="Gravitons"/);
  assert.match(app, /label: "Proposal"/);
  assert.match(app, /What will the decision-maker conclude\?/);
  assert.match(app, /Where does the case lose confidence\?/);
  assert.match(emails, /Your Multirrupt Day Pass is ready/);
  assert.match(metadata, /title: "Multirrupt Narrative Intelligence"/);
});
