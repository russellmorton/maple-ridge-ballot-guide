// "Find your riding" for the provincial guide. Takes an address, asks the BC
// Address Geocoder where it is, and checks that point against official
// electoral district boundaries. See lib/riding-lookup.js for the method.
//
// The address is sent to the BC government's geocoder and nowhere else. It is
// never logged or stored.
import districtData from "../lib/districts.js";
import { clientKey, rateLimiter, sameOrigin } from "../lib/http.js";
import { NEAR_BOUNDARY_M, geocoderUrl, locate, readGeocode, readWfsName, wfsUrl } from "../lib/riding-lookup.js";

const RATE_LIMIT = { requests: 20, windowMs: 10 * 60 * 1000 };
const TIMEOUT_MS = 6000;
const MIN_CHARS = 5;
const MAX_CHARS = 200;

const rateLimited = rateLimiter(RATE_LIMIT);

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { Accept: "application/json", ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Built from parts so tests can swap in their own boundaries and network.
export function makeHandler({ districts, fetchJson }) {
  return async function handler(req, res) {
    const fail = (status, error) => res.status(status).json({ ok: false, error });
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(405, "Use POST.");
    }
    if (!sameOrigin(req)) return fail(403, "Requests must come from the guide's own pages.");
    if (rateLimited(clientKey(req, "mr-ballot-riding"))) return fail(429, "That's a lot of lookups in a short time. Wait a few minutes and try again.");

    const raw = req.body?.address;
    const address = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    if (address.length < MIN_CHARS || address.length > MAX_CHARS) {
      return fail(400, "Enter a street address, for example 11995 Haney Place, Maple Ridge.");
    }

    let match;
    try {
      const key = process.env.GEOCODER_API_KEY; // optional; the geocoder works without one at low volume
      match = readGeocode(await fetchJson(geocoderUrl(address), key ? { apikey: key } : {}));
    } catch (err) {
      console.error("riding: geocoder failed", err?.name, err?.message);
      return fail(503, "The address lookup isn't working right now.");
    }

    const base = { ok: true, matchedAddress: match.address || null, precision: match.precision || null };
    if (match.problem) return res.status(200).json({ ...base, status: match.problem });

    // nearBoundary: true/false against the bundled boundaries, null if we
    // can't tell (no bundled boundaries).
    const here = locate(match.point, districts);
    const nearBoundary = here.edgeMetres === null ? null : here.edgeMetres < NEAR_BOUNDARY_M;
    let district = here.district;

    // Outside the bundled ridings: name the riding if DataBC answers.
    if (!district) {
      try {
        district = readWfsName(await fetchJson(wfsUrl(match.point)));
      } catch (err) {
        console.error("riding: district layer failed", err?.name, err?.message);
      }
    }
    if (!district) return res.status(200).json({ ...base, status: "unknown", nearBoundary });
    return res.status(200).json({ ...base, status: "found", district, nearBoundary });
  };
}

export default makeHandler({ districts: districtData.districts, fetchJson: getJson });
