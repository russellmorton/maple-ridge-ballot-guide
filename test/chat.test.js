// "Ask the guide": each guide gets its own prompt, and requests are checked
// before any model call.
import assert from "node:assert/strict";
import { test } from "node:test";
import handler, { guidePromptForReview } from "../api/chat.js";

function call(body, { origin = "https://site.test" } = {}) {
  const req = { method: "POST", body, headers: { origin, host: "site.test", "x-forwarded-for": "192.0.2.10" }, on() {} };
  const res = {
    statusCode: 200, payload: undefined, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  return handler(req, res).then(() => res);
}

test("each guide's prompt is about its own election", () => {
  const m = guidePromptForReview("municipal");
  const p = guidePromptForReview("provincial");
  assert.match(m, /October 17, 2026 Maple Ridge/);
  assert.match(m, /Dan Ruimy/);
  assert.match(m, /vote-maple-ridge\.vercel\.app\/provincial/, "municipal points provincial questions elsewhere");
  assert.match(p, /October 24, 2026 B\.C\. provincial election/);
  assert.match(p, /RIDING: MAPLE RIDGE EAST/);
  assert.match(p, /vote-maple-ridge\.vercel\.app\/municipal/, "provincial points municipal questions elsewhere");
  assert.doesNotMatch(p, /Dan Ruimy/, "no municipal content in the provincial prompt");
});

test("unknown guides are refused before anything else happens", async () => {
  for (const guide of ["constructor", "__proto__", "federal", 7]) {
    const res = await call({ guide, messages: [{ role: "user", content: "Hi" }] });
    assert.equal(res.statusCode, 400, String(guide));
  }
});

test("bad messages are refused for either guide", async () => {
  for (const guide of [undefined, "municipal", "provincial"]) {
    const res = await call({ guide, messages: [{ role: "assistant", content: "Hi" }] });
    assert.equal(res.statusCode, 400);
  }
});

test("other sites can't use the chat", async () => {
  const res = await call({ guide: "provincial", messages: [{ role: "user", content: "Hi" }] }, { origin: "https://elsewhere.test" });
  assert.equal(res.statusCode, 403);
});
