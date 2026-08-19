/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

test("Jump In omits the obsolete no-signup claim", () => {
  const app = fs.readFileSync(
    path.join(root, "components/GravitasApp.tsx"),
    "utf8"
  );

  assert.match(app, /Full Gravitas\. 20 minutes\./);
  assert.doesNotMatch(app, new RegExp(["No", "signup", "required\\."].join(" ")));
});
