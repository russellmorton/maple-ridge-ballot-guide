// The archived site is static: no server code, nothing that calls it, no
// analytics, and no candidates' personal email addresses or phone numbers.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const SERVED = ["index.html", "landing.js", "theme.js", "guide.css", "municipal/index.html", "municipal/app.js", "municipal/data.js", "provincial/index.html", "provincial/app.js", "provincial/data.js"];

test("no server code or calls to it", () => {
  assert.ok(!existsSync(new URL("../api", import.meta.url)), "api/ is gone");
  assert.ok(!JSON.parse(read("vercel.json")).functions, "no function settings");
  for (const f of SERVED) {
    const s = read(f);
    assert.ok(!/\/api\//.test(s), `${f} calls /api/`);
    assert.ok(!/chat\.js|_vercel\/insights/.test(s), `${f} loads chat or analytics`);
  }
});

test("no candidate emails or phone numbers", () => {
  for (const f of ["municipal/data.js", "provincial/data.js"]) {
    const sandbox = { window: {} };
    vm.runInNewContext(read(f), sandbox);
    for (const c of sandbox.window.GUIDE.candidates) {
      assert.deepEqual(Object.keys(c.links || {}).filter((k) => k !== "website"), [], `${f}: ${c.id}`);
    }
  }
});

test("both guides are marked archived", () => {
  for (const f of ["municipal/data.js", "provincial/data.js"]) {
    const sandbox = { window: {} };
    vm.runInNewContext(read(f), sandbox);
    assert.match(sandbox.window.GUIDE.archived || "", /^\d{4}-\d{2}-\d{2}$/, f);
  }
});
