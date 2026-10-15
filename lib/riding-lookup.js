// Address → provincial riding (electoral district).
//
// 1. The BC Address Geocoder turns the address into a point in BC Albers
//    (EPSG:3005, metres), so distances below are plain metres.
// 2. The point is checked against the official district boundaries in
//    lib/districts.json (the ridings this guide covers, from DataBC).
// 3. Points outside those ridings are looked up in DataBC's full district
//    layer, so we can still name the riding.
//
// Elections BC says boundary files shouldn't be the final word on a voter's
// district, so every answer links to Elections BC's own lookup, and points
// close to a boundary are flagged.

export const GEOCODER_URL = "https://geocoder.api.gov.bc.ca/addresses.json";
export const DISTRICTS_WFS = "https://openmaps.gov.bc.ca/geo/pub/wfs";
export const DISTRICT_LAYER = "pub:WHSE_ADMIN_BOUNDARIES.EBC_PROV_ELECTORAL_DIST_SVW";

// Within this many metres of a boundary, tell the voter to double-check.
export const NEAR_BOUNDARY_M = 150;
// Geocoder matches less precise than a civic number or block can't place a home.
const PRECISE = new Set(["CIVIC_NUMBER", "BLOCK"]);
// Clean matches score 98-99. Lower scores can be a different town entirely:
// "Lougheed Hwy and 287 St, Maple Ridge" came back as a BLOCK match in
// Cumberland scoring 77, with LOCALITY and "tooMany" faults.
const MIN_SCORE = 90;
// A locality alias is fine ("Langley" for "Township of Langley"); a missing
// or unmatched locality, or too many faults, is not.
const BAD_FAULT = (f) => (f?.element === "LOCALITY" && f.fault !== "isAlias") || f?.element === "FAULTS";

// ── Geometry (planar, EPSG:3005 metres) ───────────────────────────────────
// polygons: GeoJSON MultiPolygon coordinates: [polygon][ring][point][x, y].
function inRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inMultiPolygon(pt, polygons) {
  // Outer ring in, and not inside any hole.
  return polygons.some(([outer, ...holes]) => inRing(pt, outer) && !holes.some((h) => inRing(pt, h)));
}

function segDist([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function distanceToEdge(pt, polygons) {
  let best = Infinity;
  for (const poly of polygons) {
    for (const ring of poly) {
      for (let i = 1; i < ring.length; i++) best = Math.min(best, segDist(pt, ring[i - 1], ring[i]));
    }
  }
  return best;
}

// Which covered district contains the point, and how close is the nearest boundary.
export function locate(pt, districts) {
  const hit = districts.find((d) => inMultiPolygon(pt, d.polygons)) || null;
  // Distance to the nearest boundary of any covered district: a point just
  // outside one riding is also near the edge of its neighbour.
  const edge = Math.min(...districts.map((d) => distanceToEdge(pt, d.polygons)));
  return { district: hit?.name || null, edgeMetres: Number.isFinite(edge) ? Math.round(edge) : null };
}

// ── Geocoder ──────────────────────────────────────────────────────────────
export function geocoderUrl(address) {
  const u = new URL(GEOCODER_URL);
  u.search = new URLSearchParams({
    addressString: address,
    maxResults: "1",
    outputSRS: "3005",
    echo: "false",
    provinceCode: "BC",
  });
  return u.toString();
}

// Reads the geocoder's GeoJSON. Returns { point, address, precision, score }
// or { problem } when the match can't place a home.
export function readGeocode(json) {
  const f = json?.features?.[0];
  const p = f?.properties || {};
  const c = f?.geometry?.coordinates;
  if (!f || !Array.isArray(c) || c.length < 2 || !c.every(Number.isFinite)) return { problem: "not-found" };
  const precision = String(p.matchPrecision || "").toUpperCase();
  const score = Number(p.score) || 0;
  const match = { point: [c[0], c[1]], address: p.fullAddress || "", precision, score };
  if (!PRECISE.has(precision)) return { ...match, problem: "imprecise" };
  if (score < MIN_SCORE || (p.faults || []).some(BAD_FAULT)) return { ...match, problem: "low-score" };
  return match;
}

// ── DataBC fallback: name any BC district at a point ─────────────────────
export function wfsUrl([x, y]) {
  const u = new URL(DISTRICTS_WFS);
  u.search = new URLSearchParams({
    service: "WFS",
    version: "2.0.0",
    request: "GetFeature",
    typeName: DISTRICT_LAYER,
    outputFormat: "application/json",
    propertyName: "ED_NAME",
    count: "1",
    // Native SRS is BC Albers, so no axis-order surprises.
    CQL_FILTER: `INTERSECTS(SHAPE, SRID=3005;POINT(${x} ${y}))`,
  });
  return u.toString();
}

export const readWfsName = (json) => json?.features?.[0]?.properties?.ED_NAME || null;

// Elections BC uses hyphens in district names; DataBC sometimes uses en dashes.
export const normalizeName = (s) => String(s || "").replace(/[‐-―]/g, "-").replace(/\s*-\s*/g, "-").trim().toLowerCase();
