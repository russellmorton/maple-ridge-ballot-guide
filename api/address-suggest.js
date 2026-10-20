// Address suggestions for "Find your riding", as the voter types. Asks the BC
// Address Geocoder to complete what's been typed so far, near the ridings this
// guide covers. Picking a suggestion goes through /api/riding as usual.
//
// POST, so the partial address never ends up in a URL or request log. It is
// sent to the BC government's geocoder and nowhere else, and never logged or
// stored.
import districtData from "../lib/districts.js";
import { clientKey, rateLimiter, sameOrigin } from "../lib/http.js";
import { boundsOf, readSuggestions, suggestUrl } from "../lib/riding-lookup.js";

// One request per pause in typing; a long address with a few corrections
// takes a few dozen.
const RATE_LIMIT = { requests: 150, windowMs: 10 * 60 * 1000 };
const TIMEOUT_MS = 4000;
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
  const bbox = boundsOf(districts);
  return async function handler(req, res) {
    const fail = (status, error) => res.status(status).json({ ok: false, error });
    res.setHeader("Cache-Control", "no-store");

    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return fail(405, "Use POST.");
    }
    if (!sameOrigin(req)) return fail(403, "Requests must come from the guide's own pages.");
    if (rateLimited(clientKey(req, "mr-ballot-suggest"))) return fail(429, "Too many suggestions in a short time.");

    const raw = req.body?.text;
    const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
    if (text.length < MIN_CHARS || text.length > MAX_CHARS) return fail(400, "Type a few more characters of the address.");

    try {
      const key = process.env.GEOCODER_API_KEY; // optional; the geocoder works without one at low volume
      const suggestions = readSuggestions(await fetchJson(suggestUrl(text, bbox), key ? { apikey: key } : {}));
      return res.status(200).json({ ok: true, suggestions });
    } catch (err) {
      console.error("address-suggest: geocoder failed", err?.name, err?.message);
      return fail(503, "Address suggestions aren't working right now.");
    }
  };
}

export default makeHandler({ districts: districtData.districts, fetchJson: getJson });
