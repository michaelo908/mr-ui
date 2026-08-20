/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(
  path.resolve(__dirname, "../components/GravitasApp.tsx"),
  "utf8"
);

test("rewrite copy-format controls wrap intact within narrow report rows", () => {
  assert.match(
    app,
    /className="mb-4 flex flex-wrap items-center justify-between gap-3 sm:flex-nowrap"/
  );
  assert.match(
    app,
    /className="ml-auto flex items-center gap-2" data-copy-ui="true"/
  );
  assert.match(
    app,
    /id=\{`mr-copy-format-\$\{variant\.id\}`\}[\s\S]*?className="h-\[42px\] rounded-xl/
  );
});
