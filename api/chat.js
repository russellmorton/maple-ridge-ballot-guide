// "Ask the guide" chat. Answers questions using only one guide's own content
// (municipal/data.js or provincial/data.js), through Vercel AI Gateway. Each
// guide's text is a fixed, cached prefix, so each question mostly pays the
// cached-input rate. The prompts live in lib/guides/.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import Anthropic from "@anthropic-ai/sdk";
import { getVercelOidcToken } from "@vercel/oidc";
import { clientKey, rateLimiter, sameOrigin } from "../lib/http.js";
import * as municipal from "../lib/guides/municipal.js";
import * as provincial from "../lib/guides/provincial.js";

const MODEL = process.env.AI_GATEWAY_MODEL || "anthropic/claude-sonnet-5.5";

// Limits that keep cost and abuse in check.
const MAX_QUESTION_CHARS = 500;
const MAX_MESSAGES = 12; // six back-and-forth turns
const MAX_TOTAL_CHARS = 8000;
const RATE_LIMIT = { requests: 15, windowMs: 10 * 60 * 1000 };

// ── Guide content ──────────────────────────────────────────────────────────
// Each data.js assigns window.GUIDE; run it in a sandbox to read the same data
// the page uses. Bundled with this function via vercel.json "includeFiles".
function loadGuide(file) {
  const code = readFileSync(path.join(process.cwd(), file), "utf8");
  const sandbox = { window: {} };
  vm.runInNewContext(code, sandbox, { timeout: 1000 });
  return sandbox.window.GUIDE;
}

const GUIDES = { municipal, provincial };

const cachedSystemText = {};
function systemText(guide) {
  if (!cachedSystemText[guide.id]) cachedSystemText[guide.id] = guide.instructions + guide.buildGuideText(loadGuide(guide.dataFile));
  return cachedSystemText[guide.id];
}

// ── Request checks ─────────────────────────────────────────────────────────
const rateLimited = rateLimiter(RATE_LIMIT);

function cleanMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out = [];
  let total = 0;
  for (const [i, m] of raw.entries()) {
    const role = i % 2 === 0 ? "user" : "assistant"; // must alternate, starting with user
    if (!m || m.role !== role || typeof m.content !== "string") return null;
    const content = m.content.trim();
    if (!content || (role === "user" && content.length > MAX_QUESTION_CHARS)) return null;
    total += content.length;
    out.push({ role, content: content.slice(0, 4000) });
  }
  if (out[out.length - 1].role !== "user" || total > MAX_TOTAL_CHARS) return null;
  return out;
}

async function gatewayClient() {
  if (process.env.AI_GATEWAY_API_KEY) {
    return new Anthropic({ apiKey: process.env.AI_GATEWAY_API_KEY, baseURL: "https://ai-gateway.vercel.sh" });
  }
  // On Vercel, authenticate with the deployment's OIDC token (no stored key).
  return new Anthropic({ apiKey: null, authToken: await getVercelOidcToken(), baseURL: "https://ai-gateway.vercel.sh" });
}

const todayPacific = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver", weekday: "long", year: "numeric", month: "long", day: "numeric" }).format(new Date());

// ── Handler ────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const fail = (status, error) => res.status(status).json({ ok: false, error });

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return fail(405, "Use POST.");
  }
  if (!sameOrigin(req)) return fail(403, "Requests must come from the guide's own pages.");

  const key = clientKey(req, "mr-ballot-chat");
  if (rateLimited(key)) return fail(429, "You've asked a lot of questions in a short time. Wait a few minutes and try again.");

  // Pages from before the provincial guide existed send no guide: they're municipal.
  const guideId = req.body?.guide ?? "municipal";
  if (!Object.hasOwn(GUIDES, guideId)) return fail(400, "Unknown guide.");
  const guide = GUIDES[guideId];

  const messages = cleanMessages(req.body?.messages);
  if (!messages) {
    return fail(400, `Keep questions under ${MAX_QUESTION_CHARS} characters. Long conversations need a fresh start.`);
  }

  let client;
  try {
    client = await gatewayClient();
  } catch (err) {
    console.error("chat: gateway auth unavailable", err?.message);
    return fail(503, guide.unavailable);
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 2048,
    output_config: { effort: "low" },
    metadata: { user_id: key },
    system: [
      // 1-hour cache: traffic is bursty, and re-writing ~19k tokens every
      // 5 quiet minutes would cost more than holding the cache longer.
      { type: "text", text: systemText(guide), cache_control: { type: "ephemeral", ttl: "1h" } },
      { type: "text", text: `${guide.todayLabel} ${todayPacific()}.` },
    ],
    messages,
  });

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    res.status(200);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Accel-Buffering", "no");
  };
  stream.on("text", (t) => {
    start();
    res.write(t);
  });
  req.on("close", () => {
    if (!res.writableEnded) stream.abort();
  });

  try {
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal" && !started) {
      start();
      res.write(guide.refusal);
    } else if (final.stop_reason === "max_tokens") {
      start();
      res.write("\n\n(That answer was cut short. Try asking about one part at a time.)");
    }
    // Usage only, never the question text.
    const u = final.usage || {};
    console.log(JSON.stringify({ chat: "ok", guide: guide.id, model: MODEL, in: u.input_tokens, cache_read: u.cache_read_input_tokens, cache_write: u.cache_creation_input_tokens, out: u.output_tokens }));
    if (!started) {
      start();
      res.write("I don't have an answer for that. Try rephrasing your question.");
    }
    return res.end();
  } catch (err) {
    if (err instanceof Anthropic.APIUserAbortError) return res.end();
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    console.error("chat: request failed", status, err?.message);
    if (started) {
      res.write("\n\n(The answer was interrupted. Please try again.)");
      return res.end();
    }
    if (status === 429) return fail(503, "The assistant is busy right now. Try again in a minute.");
    return fail(503, guide.unavailable);
  }
}

// For local checks: `node -e` can print the exact text the model receives.
export const guidePromptForReview = (id = "municipal") => systemText(GUIDES[id]);
