// "Ask the guide" chat panel, shared by both guides. Talks to /api/chat, which
// answers from the current guide's own content (<body data-guide="...">).
// The conversation lives only in this page's memory.
(() => {
  const $ = (id) => document.getElementById(id);
  const launch = $("chat-launch");
  const panel = $("chat-panel");
  const log = $("chat-log");
  const form = $("chat-form");
  const input = $("chat-input");
  const sendBtn = $("chat-send");
  if (!launch || !panel) return;

  const GUIDE = document.body.dataset.guide === "provincial" ? "provincial" : "municipal";
  const COPY = {
    municipal: {
      intro: "Hi. Ask me about the candidates, the three recreation borrowing questions, or how and where to vote. I only use what's in this guide, and I don't recommend candidates.",
      suggestions: [
        "What are the three ballot questions about?",
        "Which council candidates oppose the recreation plan?",
        "Where and when can I vote?",
        "What ID do I need to vote?",
      ],
    },
    provincial: {
      intro: "Hi. Ask me about the candidates in the ridings this guide covers, what the parties are promising, or how and where to vote on October 24. I only use what's in this guide, and I don't recommend candidates or parties.",
      suggestions: [
        "Who is running in Maple Ridge East?",
        "What are the parties promising on housing?",
        "When is advance voting?",
        "What ID do I need to vote?",
      ],
    },
  }[GUIDE];
  const MAX_SENT = 11; // last five exchanges plus the new question
  const MAX_CHARS = 7000;

  let history = []; // [{ role: "user" | "assistant", content }]
  let busy = false;

  const esc = (s) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  // Turn URLs into links. Split on the raw text first, then escape each part,
  // so escaping can never be mistaken for part of a URL.
  function render(text) {
    const out = [];
    const re = /https?:\/\/[^\s<>"()]+/g;
    let last = 0;
    for (const m of text.matchAll(re)) {
      let url = m[0];
      const trail = url.match(/[.,;:!?']+$/);
      if (trail) url = url.slice(0, -trail[0].length);
      out.push(esc(text.slice(last, m.index)));
      out.push(`<a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a>`);
      last = m.index + url.length;
    }
    out.push(esc(text.slice(last)));
    return out.join("");
  }

  function bubble(role, html, extra = "") {
    const el = document.createElement("div");
    el.className = `msg msg-${role} ${extra}`.trim();
    el.innerHTML = html;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }

  function showIntro() {
    log.innerHTML = "";
    const intro = bubble("bot", esc(COPY.intro));
    intro.classList.add("msg-intro");
    const chips = document.createElement("div");
    chips.className = "chat-suggest";
    chips.innerHTML = COPY.suggestions.map((q) => `<button type="button" class="chip-btn">${esc(q)}</button>`).join("");
    chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip-btn");
      if (b) send(b.textContent);
    });
    log.appendChild(chips);
  }

  function setBusy(on) {
    busy = on;
    sendBtn.disabled = on;
    sendBtn.textContent = on ? "Answering…" : "Send";
  }

  // Keep requests small: the newest exchanges, always starting with a question.
  function outgoing() {
    let msgs = history.slice(-MAX_SENT);
    if (msgs[0]?.role !== "user") msgs = msgs.slice(1);
    while (msgs.length > 1 && msgs.reduce((n, m) => n + m.content.length, 0) > MAX_CHARS) msgs = msgs.slice(2);
    return msgs;
  }

  async function send(raw) {
    const q = (raw ?? input.value).trim();
    if (!q || busy) return;
    if (q.length > 500) {
      bubble("bot", "Please keep questions under 500 characters.", "msg-error");
      return;
    }
    log.querySelector(".chat-suggest")?.remove();
    input.value = "";
    autosize();
    history.push({ role: "user", content: q });
    bubble("user", esc(q));
    const answer = bubble("bot", '<span class="typing">Looking through the guide…</span>');
    setBusy(true);

    let text = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guide: GUIDE, messages: outgoing() }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "The assistant isn't available right now. The rest of the guide still works.");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        answer.innerHTML = render(text);
        log.scrollTop = log.scrollHeight;
      }
      text += decoder.decode();
      answer.innerHTML = render(text || "I don't have an answer for that. Try rephrasing your question.");
      history.push({ role: "assistant", content: text || "(no answer)" });
    } catch (err) {
      history.pop(); // drop the unanswered question so the next one starts clean
      answer.classList.add("msg-error");
      answer.textContent = err instanceof TypeError ? "Couldn't reach the assistant. Check your connection and try again." : err.message;
    } finally {
      setBusy(false);
      input.focus();
    }
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
  }

  function open() {
    panel.hidden = false;
    launch.setAttribute("aria-expanded", "true");
    launch.hidden = true;
    if (!log.childElementCount) showIntro();
    input.focus();
  }
  function close() {
    panel.hidden = true;
    launch.hidden = false;
    launch.setAttribute("aria-expanded", "false");
    launch.focus();
  }

  launch.addEventListener("click", open);
  // Close the chat and bring the About page's Disclaimer section into view.
  $("chat-disclaimer").addEventListener("click", () => {
    close();
    setTimeout(() => document.getElementById("disclaimer")?.scrollIntoView({ block: "start" }), 50);
  });
  $("chat-close").addEventListener("click", close);
  $("chat-reset").addEventListener("click", () => {
    if (busy) return;
    history = [];
    showIntro();
    input.focus();
  });
  panel.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    send();
  });
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
})();
