/* eslint-disable @typescript-eslint/no-require-imports */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const app = fs.readFileSync(
  path.resolve(__dirname, "../components/GravitasApp.tsx"),
  "utf8"
);

test("rewrite copy-format controls may shrink within narrow report rows", () => {
  assert.match(
    app,
    /className="flex min-w-0 items-center gap-2" data-copy-ui="true"/
  );
  assert.match(
    app,
    /id=\{`mr-copy-format-\$\{variant\.id\}`\}[\s\S]*?className="h-\[42px\] min-w-0 rounded-xl/
  );
});
