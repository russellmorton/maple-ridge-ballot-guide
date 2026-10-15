// Landing page: puts the next election first, labels where each one stands
// today, and fills the "what's different" table.
// Keep these facts in step with municipal/data.js and provincial/data.js.
(() => {
  const DIFF = [
    ["You're electing", "A mayor, six councillors and five SD42 school trustees, plus Yes or No on three recreation borrowing questions", "One MLA for your riding. The party that can hold the confidence of the legislature forms government, and its leader becomes premier."],
    ["Run by", "City of Maple Ridge: 604-467-7423", "Elections BC: 1-800-661-8683"],
    ["Who can vote", "18 or older, a Canadian citizen, six months in B.C., and living in Maple Ridge or owning property there for 30+ days", "18 or older, a Canadian citizen, and living in B.C. for the six months before voting day. Owning property doesn't give you a vote."],
    ["ID", "Registered voters don't need ID. New or unregistered voters register at the voting place with two pieces of ID.", "Every voter shows ID that proves their name and home address, or has someone vouch for them."],
    ["Where to vote", "The voting places the City lists for Maple Ridge", "Any voting place or district electoral office in B.C."],
    ["Advance voting", "October 7, 10, 14 and 15", "October 16 to 21, every day"],
    ["By mail", "Your ballot must arrive by 8 pm on October 17", "Ask for a mail ballot by October 18. It must arrive by 8 pm on October 24."],
  ];
  const rows = document.getElementById("diff-rows");
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  if (rows) rows.innerHTML = DIFF.map(([k, m, p]) => `<tr><td>${esc(k)}</td><td data-label="Municipal, October 17">${esc(m)}</td><td data-label="Provincial, October 24">${esc(p)}</td></tr>`).join("");

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
  // Open elections first, soonest first; closed ones last.
  cards
    .sort((a, b) => (a.dataset.closed === b.dataset.closed ? a.dataset.day.localeCompare(b.dataset.day) : a.dataset.closed === "true" ? 1 : -1))
    .forEach((c) => list.appendChild(c));
})();
