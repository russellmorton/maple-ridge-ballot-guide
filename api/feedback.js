// Receives the site's feedback form. Each message is stored privately in
// Vercel Blob and, when RESEND_API_KEY and FEEDBACK_TO_EMAIL are set, emailed
// to the publisher.
import { put } from "@vercel/blob";

const GUIDES = { municipal: "Municipal guide", provincial: "Provincial guide" };

const TOPICS = {
  candidate: "Correction to a candidate's information",
  party: "A party's platform or information",
  riding: "Riding lookup or riding information",
  ballot: "Ballot questions or voting information",
  voting: "Voting information",
  site: "Something on the site isn't working",
  other: "Other feedback",
};

const clean = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Use POST." });
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};

  // Spam traps: a hidden field people never fill, and a minimum time on the form.
  // Bots get a normal-looking success so they don't retry.
  const startedAt = Number(body.startedAt) || 0;
  if (clean(body.website, 200) || !startedAt || Date.now() - startedAt < 3000) {
    return res.status(200).json({ ok: true });
  }

  // Pages from before the provincial guide existed send no guide: they're municipal.
  const guide = Object.hasOwn(GUIDES, body.guide) ? body.guide : "municipal";
  const topic = Object.hasOwn(TOPICS, body.topic) ? body.topic : "other";
  const message = clean(body.message, 4000);
  const name = clean(body.name, 100);
  const email = clean(body.email, 200);
  const candidate = clean(body.candidate, 80);

  if (message.length < 5) {
    return res.status(400).json({ ok: false, error: "Write a message of at least a few words." });
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: "That email address doesn't look right. Check it, or leave it blank." });
  }

  const receivedAt = new Date().toISOString();
  const record = { receivedAt, guide: GUIDES[guide], topic: TOPICS[topic], candidate: candidate || null, message, name: name || null, email: email || null };

  try {
    const id = Math.random().toString(36).slice(2, 8);
    await put(`feedback/${receivedAt.replace(/[:.]/g, "-")}-${id}.json`, JSON.stringify(record, null, 2), {
      access: "private",
      contentType: "application/json",
      addRandomSuffix: false,
    });
  } catch (err) {
    console.error("feedback: blob write failed", err);
    return res.status(500).json({ ok: false, error: "Your message couldn't be saved. Try again in a minute." });
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.FEEDBACK_TO_EMAIL;
  if (key && to) {
    const text = [
      `Guide: ${GUIDES[guide]}`,
      `Topic: ${TOPICS[topic]}`,
      candidate ? `Candidate: ${candidate}` : null,
      `From: ${name || "(no name)"} ${email ? `<${email}>` : "(no email)"}`,
      `Received: ${receivedAt}`,
      "",
      message,
    ].filter((l) => l !== null).join("\n");
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: "Maple Ridge Ballot Guide <onboarding@resend.dev>",
          to: [to],
          subject: `Ballot guide feedback (${guide}): ${TOPICS[topic]}${candidate ? ` (${candidate})` : ""}`,
          text,
          ...(email ? { reply_to: email } : {}),
        }),
      });
      if (!r.ok) console.error("feedback: email failed", r.status, await r.text());
    } catch (err) {
      // The message is already saved, so the visitor still gets a success.
      console.error("feedback: email failed", err);
    }
  }

  return res.status(200).json({ ok: true });
}
