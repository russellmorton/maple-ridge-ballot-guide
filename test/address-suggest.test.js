// Address suggestions while typing. Made-up addresses and a made-up square
// "district", so nothing here touches the network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHandler } from "../api/address-suggest.js";
import { boundsOf, readSuggestions, suggestUrl } from "../lib/riding-lookup.js";

const DISTRICTS = [{ name: "Test Riding", polygons: [[[[1000, 2000], [5000, 2000], [5000, 9000], [1000, 9000], [1000, 2000]]]] }];

const feature = (fullAddress, matchPrecision = "CIVIC_NUMBER") => ({ geometry: { coordinates: [1, 1] }, properties: { fullAddress, matchPrecision, score: 81 } });

function call(handler, { body, method = "POST", origin = "https://site.test", ip = "203.0.113.1" } = {}) {
  const req = { method, body, headers: { origin, host: "site.test", "x-forwarded-for": ip } };
  const res = {
    statusCode: 200, headers: {}, payload: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(p) { this.payload = p; return this; },
  };
  return handler(req, res).then(() => res);
}

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter}`;

test("suggestions stay near the covered ridings", () => {
  assert.deepEqual(boundsOf(DISTRICTS, 500), [500, 1500, 5500, 9500]);
  assert.equal(boundsOf([]), null, "no bundled boundaries: all of BC");
});

test("suggestion URL asks for completions precise enough to place a home", () => {
  const u = new URL(suggestUrl("1 Test S", [1, 2, 3, 4]));
  assert.equal(u.searchParams.get("addressString"), "1 Test S");
  assert.equal(u.searchParams.get("autoComplete"), "true");
  assert.equal(u.searchParams.get("matchPrecision"), "SITE,UNIT,CIVIC_NUMBER,BLOCK");
  assert.equal(u.searchParams.get("outputSRS"), "3005");
  assert.equal(u.searchParams.get("bbox"), "1,2,3,4");
  assert.equal(new URL(suggestUrl("1 Test S", null)).searchParams.has("bbox"), false);
});

test("suggestions are tidied, precise and not repeated", () => {
  const list = readSuggestions({ features: [
    feature("UNIT 12 -- 100 Test St, Maple Ridge, BC", "UNIT"),
    feature("100 Test St, Maple Ridge, BC"),
    feature("100 Test St, Maple Ridge, BC", "BLOCK"),
    feature("Test St, Maple Ridge, BC", "STREET"),
    feature("100 Test St, Mission, BC", "BLOCK"),
    feature(""),
  ] });
  assert.deepEqual(list, ["Unit 12, 100 Test St, Maple Ridge, BC", "100 Test St, Maple Ridge, BC", "100 Test St, Mission, BC"]);
  assert.deepEqual(readSuggestions({}), []);
  assert.equal(readSuggestions({ features: Array.from({ length: 9 }, (_, i) => feature(`${i} Test St, Maple Ridge, BC`)) }).length, 5);
});

test("handler: returns suggestions from a box around the bundled ridings", async () => {
  const urls = [];
  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async (url) => { urls.push(url); return { features: [feature("100 Test St, Maple Ridge, BC")] }; } });
  const res = await call(handler, { body: { text: "  100   Test " }, ip: freshIp() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(res.payload, { ok: true, suggestions: ["100 Test St, Maple Ridge, BC"] });
  const u = new URL(urls[0]);
  assert.equal(u.searchParams.get("addressString"), "100 Test");
  assert.equal(u.searchParams.get("bbox"), "-1000,0,7000,11000");
});

test("handler: rejects bad requests without asking the geocoder", async () => {
  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async () => assert.fail("should not fetch") });
  assert.equal((await call(handler, { method: "GET", ip: freshIp() })).statusCode, 405);
  assert.equal((await call(handler, { body: { text: "100 Test" }, origin: "https://elsewhere.test", ip: freshIp() })).statusCode, 403);
  assert.equal((await call(handler, { body: { text: "100" }, ip: freshIp() })).statusCode, 400);
  assert.equal((await call(handler, { body: { text: ["100 Test"] }, ip: freshIp() })).statusCode, 400);
  assert.equal((await call(handler, { body: { text: "x".repeat(201) }, ip: freshIp() })).statusCode, 400);
});

test("handler: geocoder outage is a 503, and heavy use is rate limited", async () => {
  const down = makeHandler({ districts: DISTRICTS, fetchJson: async () => { throw new Error("timeout"); } });
  const res = await call(down, { body: { text: "100 Test" }, ip: freshIp() });
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.ok, false);

  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async () => ({ features: [] }) });
  const ip = freshIp();
  for (let i = 0; i < 150; i++) assert.equal((await call(handler, { body: { text: "100 Test" }, ip })).statusCode, 200);
  assert.equal((await call(handler, { body: { text: "100 Test" }, ip })).statusCode, 429);
});
