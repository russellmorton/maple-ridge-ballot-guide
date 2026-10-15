// Address → riding lookup. Uses made-up square "districts" so the geometry and
// the handler's decisions can be checked without the network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { makeHandler } from "../api/riding.js";
import { distanceToEdge, geocoderUrl, inMultiPolygon, locate, normalizeName, readGeocode, wfsUrl } from "../lib/riding-lookup.js";

const square = (x0, y0, size) => [[[x0, y0], [x0 + size, y0], [x0 + size, y0 + size], [x0, y0 + size], [x0, y0]]];
// West: 0–1000 m with a 100 m hole in the middle. East: 1000–2000 m.
const WEST = { name: "West Riding", polygons: [[...square(0, 0, 1000), square(450, 450, 100)[0]]] };
const EAST = { name: "East Riding", polygons: [square(1000, 0, 1000)] };
const DISTRICTS = [WEST, EAST];

const geocode = (x, y, props = {}) => ({
  features: [{ geometry: { coordinates: [x, y] }, properties: { fullAddress: "1 Test St, Maple Ridge, BC", matchPrecision: "CIVIC_NUMBER", score: 98, ...props } }],
});

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

test("point in polygon respects holes", () => {
  assert.equal(inMultiPolygon([100, 100], WEST.polygons), true);
  assert.equal(inMultiPolygon([500, 500], WEST.polygons), false, "inside the hole");
  assert.equal(inMultiPolygon([1500, 500], WEST.polygons), false);
});

test("distance to the nearest boundary", () => {
  assert.equal(distanceToEdge([100, 500], WEST.polygons), 100);
  assert.equal(distanceToEdge([500, 300], WEST.polygons), 150, "hole edge is closer than outer edge");
});

test("locate names the district and the nearest boundary across districts", () => {
  assert.deepEqual(locate([200, 200], DISTRICTS), { district: "West Riding", edgeMetres: 200 });
  assert.deepEqual(locate([1040, 500], DISTRICTS), { district: "East Riding", edgeMetres: 40 });
  assert.deepEqual(locate([5000, 500], DISTRICTS), { district: null, edgeMetres: 3000 });
  assert.deepEqual(locate([1, 1], []), { district: null, edgeMetres: null });
});

test("geocoder matches that can't place a home are flagged", () => {
  assert.equal(readGeocode({ features: [] }).problem, "not-found");
  assert.equal(readGeocode(geocode(1, 1, { matchPrecision: "LOCALITY" })).problem, "imprecise");
  assert.equal(readGeocode(geocode(1, 1, { matchPrecision: "STREET" })).problem, "imprecise");
  assert.equal(readGeocode(geocode(1, 1, { score: 50 })).problem, "low-score");
  // Real geocoder answer for "Lougheed Hwy and 287 St, Maple Ridge": wrong town.
  const cumberland = { fullAddress: "287 Maple St, Cumberland, BC", matchPrecision: "BLOCK", score: 77, faults: [{ element: "INITIAL_GARBAGE", fault: "notAllowed" }, { element: "LOCALITY", fault: "missing" }, { element: "FAULTS", fault: "tooMany" }] };
  assert.equal(readGeocode(geocode(1, 1, cumberland)).problem, "low-score");
  assert.equal(readGeocode(geocode(1, 1, { score: 95, faults: [{ element: "LOCALITY", fault: "notMatched" }] })).problem, "low-score");
  // Real answers: "Langley" is an alias of "Township of Langley", and a wrong
  // city ("Haney Pl, Pitt Meadows") is corrected to Maple Ridge. Both are fine.
  assert.equal(readGeocode(geocode(1, 1, { matchPrecision: "BLOCK", score: 97, faults: [{ element: "LOCALITY", fault: "isAlias", penalty: 1 }, { element: "PROVINCE", fault: "missing", penalty: 1 }] })).problem, undefined);
  assert.equal(readGeocode(geocode(1, 1, { score: 95, faults: [{ element: "LOCALITY", fault: "isAlias", penalty: 4 }] })).problem, undefined);
  // A clean match only misses the province (score 99).
  assert.equal(readGeocode(geocode(1, 1, { score: 99, faults: [{ element: "PROVINCE", fault: "missing", penalty: 1 }] })).problem, undefined);
  const ok = readGeocode(geocode(10, 20, { matchPrecision: "block" }));
  assert.equal(ok.problem, undefined);
  assert.deepEqual(ok.point, [10, 20]);
});

// Real geocoder answers (trimmed) for addresses typed without a city.
const feature = (fullAddress, localityName, matchPrecision, score, faults = []) => ({ geometry: { coordinates: [1252000, 470000] }, properties: { fullAddress, localityName, matchPrecision, score, faults } });
const NO_CITY = [{ element: "LOCALITY", fault: "missing", penalty: 10 }, { element: "PROVINCE", fault: "missing", penalty: 1 }];

test("a unit number with no city is a precise match", () => {
  // "12 100 Test St"
  const r = readGeocode({ features: [
    feature("UNIT 12 -- 100 Test St, Maple Ridge, BC", "Maple Ridge", "UNIT", 89, [{ element: "UNIT_DESIGNATOR", fault: "missing", penalty: 0 }, ...NO_CITY]),
    feature("Test St, Maple Ridge, BC", "Maple Ridge", "STREET", 66, NO_CITY),
  ] });
  assert.equal(r.problem, undefined);
  assert.equal(r.precision, "UNIT");
  assert.equal(r.address, "Unit 12, 100 Test St, Maple Ridge, BC");
  // "12000 224 St": the other towns' 224 St only match at street level.
  const r2 = readGeocode({ features: [
    feature("12000 224 St, Maple Ridge, BC", "Maple Ridge", "BLOCK", 88, NO_CITY),
    feature("224 St, Pitt Meadows, BC", "Pitt Meadows", "STREET", 66, NO_CITY),
    feature("224 St, Township of Langley, BC", "Township of Langley", "STREET", 66, NO_CITY),
  ] });
  assert.equal(r2.problem, undefined);
});

test("the same address in several towns asks for the city", () => {
  // "100 Main St"
  const r = readGeocode({ features: [
    feature("100 Main St, Lillooet, BC", "Lillooet", "CIVIC_NUMBER", 89, NO_CITY),
    feature("100 Main St, Penticton, BC", "Penticton", "CIVIC_NUMBER", 89, NO_CITY),
    feature("100 Main St, Barkerville, BC", "Barkerville", "BLOCK", 88, NO_CITY),
  ] });
  assert.equal(r.problem, "ambiguous");
  assert.deepEqual(r.alternatives, ["100 Main St, Penticton, BC", "100 Main St, Barkerville, BC"]);
  // A much weaker match elsewhere doesn't count.
  const r2 = readGeocode({ features: [feature("1 A St, Maple Ridge, BC", "Maple Ridge", "CIVIC_NUMBER", 99), feature("1 A St, Mission, BC", "Mission", "CIVIC_NUMBER", 90)] });
  assert.equal(r2.problem, undefined);
});

test("request URLs ask for BC Albers and query the point in that projection", () => {
  const g = new URL(geocoderUrl("11995 Haney Place, Maple Ridge"));
  assert.equal(g.searchParams.get("addressString"), "11995 Haney Place, Maple Ridge");
  assert.equal(g.searchParams.get("outputSRS"), "3005");
  assert.equal(g.searchParams.get("maxResults"), "3");
  assert.equal(new URL(wfsUrl([1234.5, 678])).searchParams.get("CQL_FILTER"), "INTERSECTS(SHAPE, SRID=3005;POINT(1234.5 678))");
});

test("district names compare across dash styles", () => {
  assert.equal(normalizeName("Maple Ridge – Pitt Meadows"), normalizeName("Maple Ridge-Pitt Meadows"));
});

test("handler: finds a covered riding and flags addresses near a boundary", async () => {
  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async () => geocode(1040, 500) });
  const res = await call(handler, { body: { address: "1 Test St, Maple Ridge" }, ip: freshIp() });
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["Cache-Control"], "no-store");
  assert.deepEqual(res.payload, { ok: true, status: "found", district: "East Riding", nearBoundary: true, matchedAddress: "1 Test St, Maple Ridge, BC", precision: "CIVIC_NUMBER" });
});

test("handler: outside the bundled ridings, asks DataBC for the name", async () => {
  const urls = [];
  const handler = makeHandler({
    districts: DISTRICTS,
    fetchJson: async (url) => {
      urls.push(url);
      return url.includes("openmaps") ? { features: [{ properties: { ED_NAME: "Mission-Abbotsford" } }] } : geocode(9000, 9000);
    },
  });
  const res = await call(handler, { body: { address: "1 Far Rd, Mission" }, ip: freshIp() });
  assert.equal(urls.length, 2);
  assert.equal(res.payload.status, "found");
  assert.equal(res.payload.district, "Mission-Abbotsford");
  assert.equal(res.payload.nearBoundary, false);
});

test("handler: unknown when DataBC fails, imprecise matches never reach the boundary step", async () => {
  const failing = makeHandler({ districts: [], fetchJson: async (url) => { if (url.includes("openmaps")) throw new Error("down"); return geocode(1, 1); } });
  const res = await call(failing, { body: { address: "1 Test St, Maple Ridge" }, ip: freshIp() });
  assert.deepEqual([res.payload.status, res.payload.nearBoundary], ["unknown", null]);

  let calls = 0;
  const vague = makeHandler({ districts: DISTRICTS, fetchJson: async () => { calls++; return geocode(1, 1, { matchPrecision: "LOCALITY", fullAddress: "Maple Ridge, BC" }); } });
  const res2 = await call(vague, { body: { address: "Maple Ridge" }, ip: freshIp() });
  assert.equal(res2.payload.status, "imprecise");
  assert.equal(res2.payload.matchedAddress, "Maple Ridge, BC");
  assert.equal(calls, 1);
});

test("handler: rejects bad requests", async () => {
  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async () => assert.fail("should not fetch") });
  assert.equal((await call(handler, { method: "GET", ip: freshIp() })).statusCode, 405);
  assert.equal((await call(handler, { body: { address: "1 Test St" }, origin: "https://elsewhere.test", ip: freshIp() })).statusCode, 403);
  assert.equal((await call(handler, { body: { address: "abc" }, ip: freshIp() })).statusCode, 400);
  assert.equal((await call(handler, { body: { address: { x: 1 } }, ip: freshIp() })).statusCode, 400);
  assert.equal((await call(handler, { body: { address: "x".repeat(201) }, ip: freshIp() })).statusCode, 400);
});

test("handler: geocoder outage is a 503, not a guess", async () => {
  const handler = makeHandler({ districts: DISTRICTS, fetchJson: async () => { throw new Error("timeout"); } });
  const res = await call(handler, { body: { address: "1 Test St, Maple Ridge" }, ip: freshIp() });
  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.ok, false);
});
