// Landing page: puts the next election first and labels where each one stands
// today. Both have closed, so in the archive they read "Voting has closed".
(() => {

  // Dates in Pacific time.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  const days = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

  const list = document.getElementById("elections");
  const cards = [...list.querySelectorAll(".election")];
  for (const card of cards) {
    const day = card.dataset.day;
    const closed = Date.now() >= Date.parse(card.dataset.close);
    const advanceToday = (card.dataset.advance || "").split(",").includes(today);
    const n = days(today, day);
    let text;
    if (closed) text = "Voting has closed";
    else if (n === 0) text = "Voting day is today, until 8 pm";
    else if (advanceToday) text = `Advance voting today · ${n === 1 ? "Voting day is tomorrow" : `${n} days to voting day`}`;
    else if (n === 1) text = "Voting day is tomorrow";
    else text = `${n} days to voting day`;
    const chip = card.querySelector("[data-status]");
    chip.textContent = text;
    chip.classList.toggle("closed", closed);
    card.dataset.closed = closed;
  }
  // Open elections first, soonest first; closed ones last. The buttons under
  // the headline follow the same order.
  const quick = document.getElementById("quick-go");
  cards
    .sort((a, b) => (a.dataset.closed === b.dataset.closed ? a.dataset.day.localeCompare(b.dataset.day) : a.dataset.closed === "true" ? 1 : -1))
    .forEach((c) => {
      list.appendChild(c);
      const btn = quick?.querySelector(`[data-guide="${c.dataset.guide}"]`);
      if (!btn) return;
      quick.appendChild(btn);
      btn.classList.toggle("closed", c.dataset.closed === "true");
      if (c.dataset.closed === "true") btn.querySelector("[data-when]").textContent = "Results and archive";
    });
})();
