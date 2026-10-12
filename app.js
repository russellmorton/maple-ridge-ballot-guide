(() => {
  const G = window.GUIDE;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const money = (n) => "$" + (n / 1e6).toLocaleString("en-CA") + "M";
  const dollars = (n) => "$" + n.toLocaleString("en-CA");
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter((ch) => /[A-Z]/.test(ch)).slice(0, 2).join("");
  const byId = Object.fromEntries(G.candidates.map((c) => [c.id, c]));
  const inRace = (race) => G.candidates.filter((c) => c.race === race);
  const RACES = ["mayor", "council", "trustee"];
  const SHORT = { mayor: "Mayor", council: "Council", trustee: "Trustee" };
  const CITY = ["mayor", "council"];

  const STANCE = {
    supports: { label: "For" },
    opposes: { label: "Against" },
    mixed: { label: "Mixed" },
    priority: { label: "Priority" },
    none: { label: "No statement" },
  };
  const pill = (stance, compact) => `<span class="st st-${stance}">${compact && stance === "none" ? "—" : STANCE[stance].label}</span>`;

  // ── Dates (Pacific time) ──
  const pacificToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const ELECTION_DATE = G.electionDay.slice(0, 10);
  const fmtDay = (iso) => {
    const d = new Date(iso + "T12:00:00Z");
    return {
      wd: d.toLocaleDateString("en-CA", { weekday: "short", timeZone: "UTC" }),
      day: d.getUTCDate(),
      mon: d.toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
    };
  };

  // ── Sources ──
  const srcUrl = (key, c) => {
    const s = G.sources[key];
    if (!s) return "#";
    return key === "cityBio" && c?.profile ? `${s.url}/${c.profile}` : s.url;
  };
  const srcLink = (key, c) => {
    if (Array.isArray(key)) return `<span class="src-group">${key.map((k) => srcLink(k, c)).join("")}</span>`;
    const s = G.sources[key];
    if (!s) return "";
    const label = key === "cityBio" ? "Candidate's City profile" : `${s.publisher}${s.date ? ", " + new Date(s.date + "T12:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" }) : ""}`;
    return `<a class="src" href="${esc(srcUrl(key, c))}" target="_blank" rel="noopener">Source: ${esc(label)}</a>`;
  };

  // ── Saved choices (this device only) ──
  const STORE_KEY = "mr-ballot-2026";
  const blank = () => ({ picks: { mayor: [], council: [], trustee: [] }, answers: {} });
  let saved = blank();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      saved = { ...blank(), ...parsed, picks: { ...blank().picks, ...(parsed.picks || {}) } };
      for (const r of RACES) saved.picks[r] = saved.picks[r].filter((id) => byId[id]?.race === r);
    }
  } catch { /* storage unavailable: start fresh */ }
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* ignore */ } };
  const isPicked = (c) => saved.picks[c.race].includes(c.id);
  const raceFull = (race) => saved.picks[race].length >= G.races[race].seats;
  const togglePick = (id) => {
    const c = byId[id];
    const list = saved.picks[c.race];
    if (list.includes(id)) list.splice(list.indexOf(id), 1);
    else if (!raceFull(c.race)) list.push(id);
    persist();
    renderAll();
  };
  const ovalBtn = (c) => {
    const on = isPicked(c);
    const full = !on && raceFull(c.race);
    const seats = G.races[c.race].seats;
    return `<button class="oval" type="button" data-pick="${c.id}" aria-pressed="${on}" ${full ? `disabled title="You've marked ${seats} of ${seats}. Remove one first."` : ""}><i aria-hidden="true"></i>${on ? "On my ballot" : full ? `${seats} of ${seats} marked` : "Mark on my ballot"}</button>`;
  };

  // ── UI state ──
  const ui = {
    race: "all", search: "", slate: "all",
    compareRace: "council", cell: null,
    sbs: { mayor: ["kok", "ruimy"], council: [], trustee: [] },
    confirmClear: false,
  };

  // ── START ──
  function renderStart() {
    const today = pacificToday();
    const counts = Object.fromEntries(RACES.map((r) => [r, inRace(r).length]));
    const dateTile = (iso, main) => {
      const f = fmtDay(iso);
      const past = dayDiff(today, iso) < 0;
      return `<div class="date ${past ? "past" : ""} ${main ? "main" : ""}" title="${past ? "Already passed" : ""}"><span>${f.wd}</span><b>${f.day}</b><span>${f.mon}</span></div>`;
    };
    const row = (href, race, title, rule, what) => `
      <a class="ballot-row" href="${href}" ${race ? `data-goto-race="${race}"` : ""}>
        <h3>${title}</h3><span class="rule">${rule}</span>
        <p class="what">${what}</p>
      </a>`;
    $("#view-start").innerHTML = `
      <div class="stack">
        <p class="lede">On Saturday, October 17, Maple Ridge elects a <em>mayor</em>, <em>six councillors</em> and <em>five school trustees</em>, and votes on borrowing <em>$393 million</em> for recreation.</p>
        <p class="prose muted">This guide covers every name on the City's official candidate list, explains each ballot question in plain language, and lets you compare candidates on what they've said in public. Every statement links to where it came from.</p>
      </div>

      <div class="ballot-paper">
        <header><span class="eyebrow">What's on your ballot</span><span class="eyebrow">4 parts</span></header>
        ${row("#candidates", "mayor", "Mayor", `${counts.mayor} running, vote for 1`, G.races.mayor.what)}
        ${row("#candidates", "council", "Councillor", `${counts.council} running, vote for up to 6`, G.races.council.what)}
        ${row("#candidates", "trustee", "School Trustee, SD42", `${counts.trustee} running, vote for up to 5`, G.races.trustee.what)}
        ${row("#questions", null, "Three recreation borrowing questions", "Yes or No on each", "An aquatic centre in Hammond, a park on the Golf Lane golf course site, and two new rinks at Albion. Each is a separate question.")}
      </div>
      <p class="muted" style="margin-top:-1rem;font-size:.9rem">You can vote for fewer candidates than there are seats. You don't have to answer every question.</p>

      <div class="grid-2">
        <div class="panel">
          <h3>Advance voting and General Voting Day</h3>
          <div class="dates">${G.advanceDates.map((d) => dateTile(d, false)).join("")}${dateTile(ELECTION_DATE, true)}</div>
          <p>All voting runs <strong>8 am to 8 pm</strong>. Advance voting locations are on the <a href="https://www.mapleridge.ca/your-government/municipal-elections/info-voters" target="_blank" rel="noopener">City's voter information page</a>.</p>
          <p><strong>Voting by mail:</strong> <a href="https://documents.mapleridge.ca/Forms/MailBallot" target="_blank" rel="noopener">apply online</a> or at City Hall. Your completed ballot must <em>arrive</em> by 8 pm on October 17.</p>
        </div>
        <div class="panel">
          <h3>You can vote if you are</h3>
          <ul>
            <li>18 or older on October 17, 2026</li>
            <li>A Canadian citizen</li>
            <li>Living in B.C. for at least six months, and</li>
            <li>Living in Maple Ridge, <em>or</em> an individual who has owned Maple Ridge property for 30+ days (non-resident property elector)</li>
          </ul>
          <p><strong>Already registered?</strong> You don't need ID. <a href="${G.sources.electionsBC.url}" target="_blank" rel="noopener">Check your registration</a>.</p>
          <p><strong>New or unregistered?</strong> Register at the voting place with two pieces of ID that together show who you are and where you live. One must have your signature.</p>
        </div>
      </div>

      <div class="panel">
        <h3>Voting places on October 17</h3>
        <p>The City lists these eight places. Check the City's <a href="https://www.mapleridge.ca/media/file/election-voting-place-map-2026" target="_blank" rel="noopener">voting place map</a> or call the elections office at 604-467-7423 if you're not sure where to go.</p>
        <ul class="places">${G.pollingPlaces.map(([n, a]) => `<li>${esc(n)}<small>${esc(a)}</small></li>`).join("")}</ul>
      </div>`;
  }

  // ── BALLOT QUESTIONS ──
  const Q_COLORS = { aquatic: "var(--brand)", arena: "var(--mark-fill)", park: "var(--green)" };
  function renderQuestions() {
    const total = G.ballotQuestions.reduce((s, q) => s + q.amount, 0);
    const order = ["aquatic", "arena", "park"].map((id) => G.ballotQuestions.find((q) => q.id === id));
    const cityCands = G.candidates.filter((c) => CITY.includes(c.race) && c.positions?.rec);
    const groups = ["supports", "mixed", "opposes", "none"].map((s) => ({ s, list: cityCands.filter((c) => (c.positions.rec.stance || "none") === s) }));

    $("#view-questions").innerHTML = `
      <div class="section-head">
        <h2>The recreation borrowing questions</h2>
        <p class="prose">Each question asks whether the City may borrow money, repaid over up to 25 years, to build one project. You answer Yes or No to each. A question passes if more than half the valid votes are Yes.</p>
      </div>

      <div class="stack">
        <div class="q-total"><b class="mono">${money(total)}</b><span class="muted">combined borrowing if all three pass (preliminary estimates, including contingencies)</span></div>
        <div class="amount-bar" role="img" aria-label="${order.map((q) => `${q.name} ${money(q.amount)}`).join(", ")}">
          ${order.map((q) => `<span style="flex:${q.amount};background:${Q_COLORS[q.id]}"></span>`).join("")}
        </div>
        <div class="legend">${order.map((q) => `<span><i class="swatch" style="background:${Q_COLORS[q.id]}"></i> ${esc(q.name.split(" (")[0])} <span class="mono">${money(q.amount)}</span></span>`).join("")}</div>
      </div>

      ${G.ballotQuestions.map((q) => `
        <article class="q-card" id="q-${q.id}">
          <div class="fig">
            <span class="eyebrow">Borrow up to</span>
            <b style="color:${Q_COLORS[q.id]}">${money(q.amount)}</b>
            <span class="muted" style="font-size:.85rem">repaid over up to ${q.term} years</span>
          </div>
          <div class="body">
            <h3>${esc(q.name)}</h3>
            <dl>
              <dt>Builds</dt><dd>${esc(q.builds)}</dd>
              <dt>Where</dt><dd>${esc(q.where)}</dd>
              <dt>Timing</dt><dd>${esc(q.start)}</dd>
              <dt>Bylaw</dt><dd class="mono" style="font-size:.88rem">${esc(q.bylaw)}</dd>
            </dl>
            <p class="wording">${esc(q.wording)}</p>
            ${srcLink("cityElections")}
          </div>
        </article>`).join("")}

      <div class="grid-2">
        <div class="panel">
          <span class="eyebrow">Who pays</span>
          <h3>About 60% from property taxes, 40% from development charges</h3>
          <p>The City says roughly 60% of the borrowing would be repaid through property taxes and 40% through Amenity Cost Charges paid by new development. It is also seeking grants that could reduce the amount borrowed.</p>
          <p>Its estimate for homeowners: about <strong>3% more per year for four years</strong> (2027–2030), then held at the 2030 level until the loans are repaid.</p>
          <div class="scroll-x"><table>
            <thead><tr><th>Home assessed at</th><th class="num">Extra in 2027</th><th class="num">Extra per year from 2030</th></tr></thead>
            <tbody>${G.taxExamples.map((t) => `<tr><td class="mono">${dollars(t.assessed)}</td><td class="num">${dollars(t.y2027)}</td><td class="num">${dollars(t.y2030)}</td></tr>`).join("")}</tbody>
          </table></div>
          ${srcLink("cityRec")}
        </div>
        <div class="panel">
          <span class="eyebrow">What your answer does</span>
          <h3>Yes or No on each project</h3>
          <p><strong>Yes</strong> means you support the City borrowing for that project. If a question passes, the new council then <em>considers</em> adopting the borrowing bylaw. Mayor Dan Ruimy has said: "If you have all three referendums successful, the council of the day still has the choice to say no."</p>
          ${srcLink("mrnKibosh")}
          <p><strong>No</strong> from more than half of voters means that borrowing is not approved. The City says that borrowing won't happen and staff would review next steps for council to consider.</p>
          <p>You can vote differently on each question. Several candidates have pointed out the plans are linked: the aquatic centre replaces the Hammond ballfields, and the Golf Lane park is where new diamonds would go.</p>
        </div>
      </div>

      <div class="panel">
        <span class="eyebrow">Mayor and council candidates</span>
        <h3>Where they stand on the recreation plan</h3>
        <div class="stack" style="gap:.6rem">
          ${groups.map((g) => `<div class="tally">${pill(g.s)} <span class="mono">${g.list.length}</span> <span class="muted" style="font-size:.9rem">${g.list.map((c) => `<button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button>`).join(", ") || "None"}</span></div>`).join("")}
        </div>
        <p class="muted" style="font-size:.88rem">"Mixed" mostly means the candidate has concerns or has said they will follow the vote. Most candidates say they will honour the result. <a href="#compare">See every quote in Compare</a>.</p>
      </div>`;
  }

  // ── CANDIDATES ──
  const affiliation = (c) => (c.race === "trustee" ? "" : c.slate ? `<span class="badge">${esc(c.slate)}</span>` : `<span class="badge">Independent</span>`);
  const badges = (c) => `${c.incumbent ? `<span class="badge inc">Incumbent</span>` : ""}${affiliation(c)}`;

  function card(c) {
    return `
      <article class="card ${isPicked(c) ? "picked" : ""}" data-card="${c.id}">
        <div class="card-top">
          <span class="mono-av" aria-hidden="true">${initials(c.name)}</span>
          <div style="min-width:0">
            <h3>${esc(c.name)}</h3>
            <div class="meta">${badges(c)}</div>
          </div>
        </div>
        <p class="bg">${esc(c.background)}</p>
        ${c.priorities.length ? `<div class="chips">${c.priorities.slice(0, 3).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>` : ""}
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
        <div class="card-foot">
          <button class="linkish" type="button" data-open="${c.id}">Positions &amp; contact</button>
          ${ovalBtn(c)}
        </div>
      </article>`;
  }

  function renderCandidates() {
    const view = $("#view-candidates");
    const q = ui.search.trim().toLowerCase();
    const match = (c) => {
      if (ui.slate !== "all") {
        if (c.race === "trustee") return false;
        if (ui.slate === "ind" ? c.slate : c.slate !== ui.slate) return false;
      }
      if (!q) return true;
      return [c.name, c.background, c.slate, ...c.priorities].join(" ").toLowerCase().includes(q);
    };
    const races = ui.race === "all" ? RACES : [ui.race];
    const groupsHtml = races.map((r) => {
      const list = inRace(r).filter(match);
      if (!list.length) return "";
      const meta = G.races[r];
      return `
        <div class="race-group">
          <header><h3 style="font-size:1.4rem">${meta.label}</h3><span class="eyebrow">${inRace(r).length} running, vote for ${meta.seats === 1 ? "1" : "up to " + meta.seats}</span></header>
          <div class="cards">${list.map(card).join("")}</div>
        </div>`;
    }).join("");

    // Keep the search box (and its focus) alive across re-renders
    if (!$("#cand-results", view)) {
      view.innerHTML = `
        <div class="section-head">
          <h2>Candidates</h2>
          <p class="prose muted">All ${G.candidates.length} candidates on the ballot, listed alphabetically by surname. Backgrounds and priorities come from each candidate's own City profile and local news coverage. Open a candidate to see their positions with sources and how to reach them.</p>
        </div>
        <div class="toolbar">
          <div class="seg" role="group" aria-label="Race" id="race-seg"></div>
          <input class="search" id="cand-search" type="search" placeholder="Search names, backgrounds, priorities" aria-label="Search candidates">
          <select id="slate-filter" aria-label="Affiliation">
            <option value="all">Any affiliation</option>
            <option value="A Better Maple Ridge">A Better Maple Ridge</option>
            <option value="ind">Independent</option>
          </select>
        </div>
        <div id="cand-results" class="stack" style="gap:2.25rem"></div>`;
      $("#cand-search", view).addEventListener("input", (e) => { ui.search = e.target.value; renderCandidates(); });
      $("#slate-filter", view).addEventListener("change", (e) => { ui.slate = e.target.value; renderCandidates(); });
    }
    $("#race-seg", view).innerHTML = [["all", "All"], ...RACES.map((r) => [r, SHORT[r]])]
      .map(([v, l]) => `<button type="button" data-race="${v}" aria-pressed="${ui.race === v}">${l}</button>`).join("");
    $("#slate-filter", view).value = ui.slate;
    $("#cand-results", view).innerHTML = groupsHtml || `<div class="empty">No candidates match. <button class="linkish" type="button" data-reset-filters>Clear filters</button></div>`;
  }

  // ── Candidate dialog ──
  const dialog = $("#cand-dialog");
  function openCandidate(id) {
    const c = byId[id];
    if (!c) return;
    const isCity = CITY.includes(c.race);
    const positions = isCity
      ? G.issues.map((iss) => {
          const p = c.positions?.[iss.id] || { stance: "none" };
          return `<div class="pos"><span class="lbl">${esc(iss.label)}</span><div class="txt">${pill(p.stance)}${p.text ? `<span>${esc(p.text)}</span>` : `<span class="muted">No public statement found in our sources.</span>`}${p.source ? srcLink(p.source, c) : ""}</div></div>`;
        }).join("")
      : G.topics.filter((t) => c.topics?.[t.id]).map((t) => `<div class="pos"><span class="lbl">${esc(t.label)}</span><div class="txt"><span>${esc(c.topics[t.id])}</span>${srcLink(c.topicSource || "cityBio", c)}</div></div>`).join("")
        || `<p class="muted">This candidate's profile doesn't address specific topics. Check their website or contact them directly.</p>`;
    const L = c.links || {};
    const contact = [
      L.website && ["Website", `<a href="${esc(L.website)}" target="_blank" rel="noopener">${esc(L.website.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a>`, true],
      L.email && ["Email", esc(L.email)],
      L.phone && ["Phone", esc(L.phone)],
    ].filter(Boolean);
    dialog.innerHTML = `
      <div class="dlg" tabindex="-1">
        <div class="dlg-head">
          <div class="stack" style="gap:.4rem">
            <span class="eyebrow">${esc(G.races[c.race].label)} candidate</span>
            <h2 id="dlg-name">${esc(c.name)}</h2>
            <div class="chips">${badges(c)}</div>
          </div>
          <button class="btn" type="button" data-close>Close</button>
        </div>
        <p>${esc(c.background)}</p>
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
        ${c.priorities.length ? `<div class="stack" style="gap:.5rem"><span class="eyebrow">Priority tags</span><div class="chips">${c.priorities.map((p, i) => `<span class="chip">${esc(p)}${c.tagSources?.[i] ? ` <span class="chip-src">· ${esc(G.sources[c.tagSources[i]].publisher)}</span>` : ""}</span>`).join("")}</div><p class="src">Short labels written by this guide. Unmarked tags come from the candidate's City profile.</p></div>` : ""}
        <div class="stack" style="gap:.4rem">
          <span class="eyebrow">${isCity ? "Positions on key issues" : "What they emphasize"}</span>
          <div class="pos-list">${positions}</div>
        </div>
        <div class="stack" style="gap:.5rem">
          <span class="eyebrow">Contact</span>
          ${contact.length ? `<dl class="contact">${contact.map(([k, v, isUrl]) => `<dt>${k}</dt><dd class="${isUrl ? "url" : ""}">${v}</dd>`).join("")}</dl>` : `<p class="muted">No contact details published.</p>`}
          ${c.profile ? `<a href="${esc(srcUrl("cityBio", c))}" target="_blank" rel="noopener">Read their full City profile</a>` : ""}
          <a href="#feedback" data-feedback="${c.id}" data-close>Report an error about ${esc(c.name)}</a>
        </div>
        <p class="src">Background, tags and position summaries were written by this guide with AI assistance, not by the candidate. <a href="#about" data-close>How this was made</a>.</p>
        <div class="card-foot">${ovalBtn(c)}<button class="btn" type="button" data-close>Close</button></div>
      </div>`;
    dialog.dataset.cid = id;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
      dialog.querySelector(".dlg")?.focus();
    }
  }
  dialog.addEventListener("click", (e) => { if (e.target === dialog || e.target.closest("[data-close]")) { if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open"); } });
  dialog.addEventListener("close", () => { delete dialog.dataset.cid; });

  // ── COMPARE ──
  function renderCompare() {
    const race = ui.compareRace;
    const isCity = CITY.includes(race);
    const cands = inRace(race).filter((c) => isCity ? Object.keys(c.positions || {}).length : true);
    const cols = isCity ? G.issues : G.topics;

    const head = `<tr><th class="cand">Candidate</th>${cols.map((col) => `<th title="${esc(col.question || col.label)}">${esc(col.short || col.label)}</th>`).join("")}</tr>`;
    const rows = cands.map((c) => `
      <tr class="${isPicked(c) ? "picked" : ""}">
        <td class="cand"><button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button>${c.incumbent ? ` <span class="badge inc">Inc.</span>` : ""}</td>
        ${cols.map((col) => {
          const selected = ui.cell && ui.cell.c === c.id && ui.cell.k === col.id;
          if (isCity) {
            const st = c.positions[col.id]?.stance || "none";
            return `<td><button class="cell" type="button" data-cell="${c.id}|${col.id}" aria-pressed="${selected}" aria-label="${esc(c.name)}, ${esc(col.label)}: ${STANCE[st].label}">${pill(st, true)}</button></td>`;
          }
          const has = !!c.topics?.[col.id];
          return `<td>${has ? `<button class="cell" type="button" data-cell="${c.id}|${col.id}" aria-pressed="${selected}" aria-label="${esc(c.name)}, ${esc(col.label)}: mentioned"><span class="dot"></span></button>` : `<span class="dot off" aria-label="not mentioned" style="display:inline-block;width:12px;height:12px;border-radius:50%;border:1.5px dashed var(--line)"></span>`}</td>`;
        }).join("")}
      </tr>`).join("");

    let detail = `<p class="muted">Select any cell to read what the candidate said and where it came from.</p>`;
    if (ui.cell && byId[ui.cell.c]?.race === race) {
      const c = byId[ui.cell.c];
      const col = cols.find((x) => x.id === ui.cell.k);
      if (isCity) {
        const p = c.positions[col.id] || { stance: "none" };
        detail = `<div class="stack" style="gap:.35rem"><span class="eyebrow">${esc(col.label)}</span><h3>${esc(c.name)} ${pill(p.stance)}</h3><p>${esc(p.text || "No public statement found in our sources.")}</p>${p.source ? srcLink(p.source, c) : ""}</div>`;
      } else {
        detail = `<div class="stack" style="gap:.35rem"><span class="eyebrow">${esc(col.label)}</span><h3>${esc(c.name)}</h3><p>${esc(c.topics[col.id])}</p>${srcLink(c.topicSource || "cityBio", c)}</div>`;
      }
    }

    // Side by side
    const pickedHere = saved.picks[race];
    if (!ui.sbs[race].length) ui.sbs[race] = (pickedHere.length ? pickedHere : cands.map((c) => c.id)).slice(0, race === "mayor" ? 2 : 3);
    const sel = ui.sbs[race];
    const slots = race === "mayor" ? 2 : 3;
    const pickers = Array.from({ length: slots }, (_, i) => `
      <select data-sbs="${i}" aria-label="Candidate ${i + 1}">
        <option value="">Choose a candidate</option>
        ${cands.map((c) => `<option value="${c.id}" ${sel[i] === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}
      </select>`).join("");
    const chosen = sel.map((id) => byId[id]).filter(Boolean);
    const sbsRows = cols.map((col) => `<tr><td class="sbs-issue">${esc(col.label)}</td>${chosen.map((c) => {
      if (isCity) {
        const p = c.positions[col.id] || { stance: "none" };
        return `<td data-label="${esc(c.name)}"><div class="stack" style="gap:.3rem;align-items:start">${pill(p.stance)}<span>${esc(p.text || "")}</span>${p.source && p.text ? srcLink(p.source, c) : ""}</div></td>`;
      }
      return `<td data-label="${esc(c.name)}">${c.topics?.[col.id] ? esc(c.topics[col.id]) : `<span class="muted">Not mentioned</span>`}</td>`;
    }).join("")}</tr>`).join("");

    $("#view-compare").innerHTML = `
      <div class="section-head">
        <h2>${isCity ? "Where candidates stand on the issues" : "What trustee candidates emphasize"}</h2>
        <p class="prose muted">${isCity
          ? "Each cell sums up what a candidate has said publicly on that issue. Select a cell for the quote and source."
          : "Trustee races rarely have yes/no issues, so this shows which topics each candidate raises in their own profile. A blank does not mean they oppose it."}</p>
      </div>
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Race">${RACES.map((r) => `<button type="button" data-crace="${r}" aria-pressed="${race === r}">${SHORT[r]}</button>`).join("")}</div>
      </div>
      ${isCity ? `<div class="legend stance-legend">${[["supports", "supports it"], ["opposes", "against it"], ["mixed", "concerns, or will follow the vote"], ["priority", "names it as a priority"], ["none", "nothing found (doesn't mean no view)"]].map(([s, t]) => `<span class="lg">${s === "none" ? `<span class="st legend-dash">—</span>` : pill(s)} ${t}</span>`).join("")}</div>` : `<div class="legend"><span><span class="dot" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:var(--brand);vertical-align:middle"></span> mentioned in their profile</span></div>`}
      <div class="stack" style="gap:.75rem">
        <div class="table-sheet scroll-x"><table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
        <div class="panel detail" aria-live="polite">${detail}</div>
      </div>
      <div class="sbs">
        <div class="section-head"><h3 style="font-size:1.4rem">Read ${slots} candidates' full answers together</h3></div>
        <div class="sbs-pickers">${pickers}</div>
        ${chosen.length ? `<div class="table-sheet scroll-x"><table class="sbs-table"><thead><tr><th>${isCity ? "Issue" : "Topic"}</th>${chosen.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${sbsRows}</tbody></table></div>` : `<div class="empty">Choose candidates above to compare them.</div>`}
      </div>`;
  }

  // ── MY BALLOT ──
  function renderBallot() {
    const answered = Object.values(saved.answers).filter(Boolean).length;
    const totalPicks = RACES.reduce((n, r) => n + saved.picks[r].length, 0);
    $("#view-ballot").innerHTML = `
      <div class="section-head">
        <h2>My ballot</h2>
        <p class="prose">Plan how you'll vote before you go. Tap the oval on any candidate's card to add them here, and choose Yes or No on each ballot question.</p>
        <div class="notice">
          <h3>This is not your vote</h3>
          <p>Nothing on this page is sent to the City or counted. To vote, go to a voting place by 8 pm on Saturday, October 17, or return a mail ballot by then.</p>
          <h3>Your choices are private</h3>
          <p>They're saved only on the phone or computer you're using now. We can't see them, and no one else can either. They won't be there if you use a different device or clear your browsing data.</p>
        </div>
        <div class="toolbar">
          ${CAN_PRINT
            ? `<button class="btn primary" type="button" data-print>Print my ballot</button><span class="muted" style="font-size:.88rem">${totalPicks || answered ? "Prints one page with your choices and where to vote, as a reminder." : "Nothing marked yet. It will print a blank sheet you can fill in by hand."}</span>`
            : `<span class="muted" style="font-size:.88rem">Printing isn't available in this preview. Open the site directly to print your ballot.</span>`}
        </div>
      </div>
      ${RACES.map((r) => {
        const meta = G.races[r];
        const list = saved.picks[r].map((id) => byId[id]);
        const empties = Math.max(0, meta.seats - list.length);
        return `
          <div class="my-race">
            <div class="race-group"><header><h3 style="font-size:1.3rem">${meta.label}</h3><span class="eyebrow mono">${list.length} of ${meta.seats} marked</span></header></div>
            <div class="slots">
              ${list.map((c) => `<div class="slot"><span><span class="x" aria-hidden="true">✕</span> ${esc(c.name)}</span><button class="linkish" type="button" data-pick="${c.id}" aria-label="Remove ${esc(c.name)}">Remove</button></div>`).join("")}
              ${Array.from({ length: empties }, () => `<a class="slot empty-slot" href="#candidates" data-goto-race="${r}">Open spot. Choose a candidate</a>`).join("")}
            </div>
            ${meta.seats > 1 ? `<p class="muted" style="font-size:.85rem">You may vote for fewer than ${meta.seats}.</p>` : ""}
          </div>`;
      }).join("")}
      <div class="panel">
        <span class="eyebrow">Ballot questions</span>
        ${G.ballotQuestions.map((q) => `
          <div class="answer-row">
            <span><strong>${esc(q.name)}</strong> <span class="mono muted">${money(q.amount)}</span></span>
            <div class="seg" role="group" aria-label="${esc(q.name)}">
              ${[["yes", "Yes"], ["no", "No"], ["", "Undecided"]].map(([v, l]) => `<button type="button" data-answer="${q.id}" data-val="${v}" aria-pressed="${(saved.answers[q.id] || "") === v}">${l}</button>`).join("")}
            </div>
          </div>`).join("")}
      </div>
      ${totalPicks || answered ? `<div>${ui.confirmClear
        ? `<span class="confirm">Remove all your choices from this device? <button class="btn danger" type="button" data-clear="yes">Remove all</button><button class="btn" type="button" data-clear="no">Keep them</button></span>`
        : `<button class="btn" type="button" data-clear="ask">Start over</button>`}</div>` : ""}`;
  }

  // ── PRINTABLE BALLOT ──
  // Embedded previews block the print dialog, so only offer printing on the real site.
  const CAN_PRINT = (() => { try { return window.self === window.top; } catch { return false; } })();
  function renderPrintSheet() {
    const today = pacificToday();
    const upcomingAdvance = G.advanceDates.filter((d) => dayDiff(today, d) >= 0);
    const dayName = (iso) => { const f = fmtDay(iso); return `${f.wd} ${f.mon} ${f.day}`; };
    const race = (r) => {
      const meta = G.races[r];
      const list = saved.picks[r].map((id) => byId[id]);
      const lines = [
        ...list.map((c) => `<li class="ps-line marked"><span class="ps-oval" aria-hidden="true"></span><span class="ps-name">${esc(c.name)}</span><span class="ps-meta">${[c.incumbent ? "Incumbent" : "", c.race !== "trustee" ? (c.slate || "Independent") : ""].filter(Boolean).join(" · ")}</span></li>`),
        ...Array.from({ length: Math.max(0, meta.seats - list.length) }, () => `<li class="ps-line"><span class="ps-oval" aria-hidden="true"></span><span class="ps-blank"></span></li>`),
      ];
      return `<section class="ps-race"><h2>${meta.label}<span>Vote for ${meta.seats === 1 ? "1" : "up to " + meta.seats}</span></h2><ol>${lines.join("")}</ol></section>`;
    };
    const box = (on) => `<span class="ps-box ${on ? "on" : ""}" aria-hidden="true">${on ? "✕" : ""}</span>`;
    $("#print-sheet").innerHTML = `
      <header class="ps-head">
        <div><p class="ps-kicker">Maple Ridge Ballot Guide</p><h1>My ballot</h1><p class="ps-note">A personal reminder. This is not an official ballot.</p></div>
        <p class="ps-when"><strong>General Voting Day: Saturday, October 17, 2026</strong><br>8 am – 8 pm${upcomingAdvance.length ? `<br>Advance voting: ${upcomingAdvance.map(dayName).join(", ")}, 8 am – 8 pm` : ""}</p>
      </header>
      <div class="ps-cols">
        ${race("mayor")}
        ${race("trustee")}
        ${race("council")}
        <section class="ps-race"><h2>Recreation borrowing<span>Yes or No on each</span></h2>
          <ol>${G.ballotQuestions.map((q) => {
            const v = saved.answers[q.id] || "";
            return `<li class="ps-q"><span class="ps-qname">${esc(q.name)} <span class="ps-meta">${money(q.amount)}</span></span><span class="ps-yn">${box(v === "yes")} Yes ${box(v === "no")} No</span></li>`;
          }).join("")}</ol>
        </section>
      </div>
      <section class="ps-foot">
        <div><h3>Where to vote on October 17</h3><ul>${G.pollingPlaces.map(([n, a]) => `<li>${esc(n)}, ${esc(a)}</li>`).join("")}</ul></div>
        <div><h3>Bring</h3><p>Registered voters don't need ID. New or unregistered voters need two pieces of ID that together show who you are and where you live, one with your signature.</p>
        <h3>Questions</h3><p>Maple Ridge Elections Office: 604-467-7423 · Election@MapleRidge.ca</p></div>
      </section>
      <p class="ps-fine">Printed ${esc(today)} from an independent voter guide. Not affiliated with the City of Maple Ridge, SD42, any candidate or elector organization. Candidate details last checked ${esc(G.lastChecked)}.</p>`;
  }

  // ── ABOUT ──
  function renderAbout() {
    const R = G.review || {};
    const statusLabel = { pending: "Review pending", "ai-checked": "AI-checked, human review pending", done: "Reviewed" }[R.status] || "Review pending";
    const incumbents = G.candidates.filter((c) => c.incumbent).map((c) => c.name);
    const n = Object.fromEntries(RACES.map((r) => [r, inRace(r).length]));
    const defs = [
      ["supports", "The candidate has said they back it."],
      ["opposes", "The candidate has said they are against it. For the golf course, this means against replacing the course with the new park."],
      ["mixed", "The candidate raised concerns, supports part of it, or said they will follow the referendum result without saying how they'd vote."],
      ["priority", "The candidate names this as a priority. Used where there's no yes-or-no question, such as taxes or safety."],
      ["none", "We found nothing in our sources. This does not mean the candidate has no view."],
    ];
    $("#view-about").innerHTML = `
      <div class="section-head">
        <h2>How this guide was made</h2>
        <p class="prose">This page explains where every piece of candidate information came from, who and what produced the summaries, how each label was chosen, and what we haven't checked. If anything here conflicts with an official City page, the City page is correct.</p>
      </div>

      <div class="status-banner" role="status">
        <span class="badge inc">${esc(statusLabel)}</span>
        <div class="stack" style="gap:.35rem">
          <p>${esc(R.aiDraft || "")}</p>
          <p>${esc(R.aiCheck || "")}</p>
          <p><strong>Human review:</strong> ${esc(R.human || "Not yet reviewed by a person.")}</p>
          <p class="muted" style="font-size:.9rem">Information last checked ${esc(G.lastChecked)}.</p>
        </div>
      </div>

      <div class="panel prose method">
        <h3>How the information was gathered</h3>
        <ol>
          <li><strong>Candidate list.</strong> Every name on the City of Maple Ridge's official Declaration of Election (September 21, 2026): ${n.mayor} for mayor, ${n.council} for council, ${n.trustee} for school trustee.</li>
          <li><strong>Candidate profiles.</strong> Each candidate's profile on the City website. Candidates write and submit these themselves, so they're the candidate's own words about themselves.</li>
          <li><strong>News coverage.</strong> Maple Ridge News reporting on the September 23 mayoral debate and council all-candidates meeting, its October 9 council profiles, and earlier articles on the recreation plan and the trustee race. This is the only news outlet used.</li>
          <li><strong>Ballot questions and voting details.</strong> The City's election page and its Recreation Ready project page.</li>
          <li><strong>AI-assisted drafting.</strong> An AI assistant (Claude, by Anthropic) read these pages and drafted the summaries. Its web tool returns a summary of each page instead of the full text, and the assistant then shortened those summaries again. Some wording has therefore been through two rounds of summarizing, which is why every position links back to its source.</li>
          <li><strong>AI fact-check.</strong> ${esc(R.aiCheck || "")} The first assistant then re-checked the most serious findings against the page text itself before applying them.</li>
          <li><strong>Human review.</strong> ${esc(R.human || "Not yet reviewed by a person.")}</li>
        </ol>
      </div>

      <div class="panel prose method">
        <h3>What each part of a candidate entry means</h3>
        <dl class="deflist">
          <dt>Background</dt>
          <dd>A short paraphrase of the candidate's City profile, sometimes with details from Maple Ridge News. Not the candidate's exact words.</dd>
          <dt>Priority tags</dt>
          <dd>The short tags on each card (up to three on the card, all of them in the detail view). <strong>We wrote these labels; they are not quotes.</strong> Most are condensed from the candidate's City profile. Tags that come from Maple Ridge News instead are marked with the publisher's name in the candidate's detail view. Some tags paraphrase loosely, for example Lou Jose's "Line-by-line scrutiny of city budgets" stands for his wish to help council "understand the hundreds of pages of line items". Use "Read their full City profile" in the detail view to compare.</dd>
          <dt>Incumbent</dt>
          <dd>Marked for ${incumbents.map(esc).join(", ")}. Dan Ruimy, Korleen Carreras and Mike Murray state on their City profiles that they currently hold the seat. Maple Ridge News describes Judy Dueck as an incumbent. School District 42's list of current trustees includes Elaine Yamamoto (chair), Pascale Shaw and Mike Murray.</dd>
          <dt>Slate or Independent</dt>
          <dd>"A Better Maple Ridge" appears on the candidate's own City profile and in Maple Ridge News. Every other mayor or council candidate is labelled "Independent". Trustees have no affiliation label because none was listed.</dd>
          <dt>Positions (mayor and council)</dt>
          <dd>A one- or two-sentence summary of what the candidate said publicly on each of seven issues, with a link to the source. Text inside quotation marks is meant to be the candidate's exact words as reported by the source.</dd>
          <dt>Stance labels</dt>
          <dd>Our judgment about the summary, not a label the candidate chose. Read the summary and source before relying on a label.
            <table class="def-table"><tbody>${defs.map(([s, d]) => `<tr><td>${pill(s)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table>
          </dd>
          <dt>Trustee topics</dt>
          <dd>Trustee races rarely have yes-or-no issues, so the trustee comparison only shows whether a topic is <em>mentioned</em> in the candidate's City profile. A blank means it wasn't mentioned, not that they oppose it. Pascale Shaw's topics come from Maple Ridge News, the rest from City profiles.</dd>
          <dt>Contact details</dt>
          <dd>Copied from the City's candidate profile pages. Websites are as listed by the candidate.</dd>
        </dl>
      </div>

      <div class="grid-2">
        <div class="panel prose method">
          <h3>Known gaps and judgment calls</h3>
          <ul>
            <li><strong>Candidate websites and social media were not reviewed.</strong> Only City profiles and Maple Ridge News were used. Many candidates say more on their own sites, so "no statement" cells may be filled there.</li>
            <li><strong>Derek Jeffery</strong> appeared on the City's September 11 list of nominations received but is not on the official Declaration of Election (September 21), so he is not on the ballot and not listed here. We found no public notice explaining why.</li>
            <li><strong>Descriptions of each office</strong> (what a mayor, councillor or trustee does) are general summaries, not taken from a cited source. Term lengths are confirmed by the City.</li>
            <li><strong>Lou Jose</strong> says his position on the recreation projects is on VoteJose.ca. We haven't reviewed that site, so it shows as no statement.</li>
            <li><strong>Lou Jose, Andrew Laity and Ryan Svendsen</strong> didn't attend the September 23 all-candidates meeting, so they have fewer recorded positions.</li>
            <li><strong>Lou Jose's growth position</strong> is labelled "Priority" rather than "Against". He opposes a particular kind of growth (low-cost, high-density housing), not growth in general.</li>
            <li><strong>Seven issues were chosen by us</strong>, based on what came up in the debates and news coverage. They may not be the issues that matter most to you.</li>
            <li><strong>Tax figures</strong> are the City's estimates for the recreation plan, not our own calculations.</li>
          </ul>
        </div>
        <div class="panel prose method">
          <h3>What this site doesn't do</h3>
          <ul>
            <li><strong>No endorsements, rankings or scores.</strong> Candidates are listed alphabetically by surname in every race.</li>
            <li><strong>No photos.</strong> Every candidate gets the same initials marker.</li>
            <li><strong>No affiliation.</strong> This site isn't connected to the City of Maple Ridge, School District 42, any candidate or any elector organization. It uses colours from the City's website palette, but it is not a City website and doesn't use the City's logo.</li>
            <li><strong>Visit counts only.</strong> We use Vercel Web Analytics to count page visits. It doesn't use cookies and doesn't identify you. It records the page, referring site, country, browser and device type. There's no advertising. Your "My ballot" choices are saved only on the device you're using. They're never sent to us, to analytics or anywhere else. Fonts are loaded from Google Fonts, which receives your IP address the way any website request does.</li>
            <li><strong>AI assistant.</strong> "Ask the guide" sends your questions to Anthropic's Claude (Sonnet 5.5) through Vercel AI Gateway, along with this guide's content, so it can answer from the guide. It's told not to recommend candidates or say how to vote. Answers can be wrong; check the sources it links. The conversation isn't saved on this site and disappears when you close the page.</li>
            <li><strong>Feedback.</strong> Messages sent through the feedback form go only to the publisher. They're stored privately in the site's Vercel account and emailed to him. Your name and email are optional.</li>
          </ul>
          ${G.maintainer ? `<p><strong>Published by:</strong> ${esc(G.maintainer)}. <a href="#feedback">Send feedback or report an error</a>.</p>` : ""}
        </div>
      </div>

      <div class="panel prose method" id="disclaimer">
        <h3>Disclaimer</h3>
        <p>This guide is an independent project provided for general information only. We've worked to make it accurate and fair, and every candidate summary links to its source, but it may contain errors or be out of date. It is provided "as is", without warranties of any kind, and Russell Morton is not liable for any loss or damage arising from its use or from reliance on it. It is not an official election publication and is not legal advice. Links to other websites are provided for convenience; we aren't responsible for their content. Answers from the "Ask the guide" assistant are generated by AI and may be inaccurate or incomplete.</p>
        <p><strong>Candidates:</strong> if anything about you is wrong or missing, tell us through the <a href="#feedback">feedback form</a> and we'll check it and correct it promptly.</p>
      </div>

      <div class="panel method">
        <h3>Sources and what we used from each</h3>
        <div class="scroll-x"><table>
          <thead><tr><th>Source</th><th>Used for</th></tr></thead>
          <tbody>${Object.values(G.sources).map((s) => `<tr><td style="min-width:14rem"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a><br><span class="muted" style="font-size:.85rem">${esc(s.publisher)}${s.date ? ", " + esc(s.date) : ""}</span></td><td style="min-width:16rem">${esc(s.usedFor || "")}</td></tr>`).join("")}</tbody>
        </table></div>
        <p class="muted" style="font-size:.88rem">All sources were accessed on ${esc(G.lastChecked)}. Each candidate's individual City profile is linked from their detail view.</p>
      </div>

      <div class="panel method">
        <h3>Change log</h3>
        <ul class="changelog">${(G.changes || []).slice().reverse().map((c) => `<li><span class="mono muted">${esc(c.date)}</span> ${esc(c.text)}</li>`).join("")}</ul>
      </div>`;
  }

  // ── FEEDBACK ──
  const fbState = { candidate: "", topic: "" };
  function renderFeedback() {
    const view = $("#view-feedback");
    view.innerHTML = `
      <div class="section-head">
        <h2>Send feedback</h2>
        <p class="prose">Spotted a mistake, or something missing? Tell us and we'll check it against the sources and fix it. Corrections are listed on the <a href="#about">About page</a>.</p>
      </div>
      <form class="fb-form" id="fb-form" novalidate>
        <div class="field">
          <label for="fb-topic">What's this about?</label>
          <select id="fb-topic" name="topic">
            <option value="candidate">A candidate's information</option>
            <option value="ballot">Ballot questions or voting information</option>
            <option value="site">Something on the site isn't working</option>
            <option value="other">Other feedback</option>
          </select>
        </div>
        <div class="field" id="fb-cand-field">
          <label for="fb-candidate">Which candidate?</label>
          <select id="fb-candidate" name="candidate">
            <option value="">Choose a candidate</option>
            ${RACES.map((r) => `<optgroup label="${esc(G.races[r].label)}">${inRace(r).map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="fb-message">Your message</label>
          <span class="hint" id="fb-message-hint">If something is wrong, say what it should be and where you saw the correct information.</span>
          <textarea id="fb-message" name="message" required maxlength="4000" aria-describedby="fb-message-hint"></textarea>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="fb-name">Your name <span class="hint">(optional)</span></label>
            <input id="fb-name" name="name" type="text" autocomplete="name" maxlength="100">
          </div>
          <div class="field">
            <label for="fb-email">Email <span class="hint">(optional, only if you'd like a reply)</span></label>
            <input id="fb-email" name="email" type="email" autocomplete="email" maxlength="200">
          </div>
        </div>
        <div class="hp" aria-hidden="true"><label for="fb-website">Leave this empty</label><input id="fb-website" name="website" type="text" tabindex="-1" autocomplete="off"></div>
        <p class="hint" style="font-size:.88rem;color:var(--muted)">Your message goes only to Russell Morton, who publishes this guide. It's stored privately and isn't shown on the site.</p>
        <p class="fb-error" id="fb-error" role="alert" hidden></p>
        <div><button class="btn primary" type="submit" id="fb-submit">Send feedback</button></div>
      </form>
      <div class="fb-done panel" id="fb-done" hidden>
        <h3>Thanks, your feedback was sent</h3>
        <p>Russell Morton will review it. If it's a correction, the fix will appear in the change log on the About page.</p>
        <div><button class="btn" type="button" id="fb-again">Send another</button></div>
      </div>`;
    const form = $("#fb-form"), topic = $("#fb-topic"), candField = $("#fb-cand-field");
    let startedAt = Date.now();
    const syncTopic = () => { candField.hidden = topic.value !== "candidate"; };
    topic.addEventListener("change", syncTopic);
    syncTopic();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#fb-error"), btn = $("#fb-submit");
      const data = Object.fromEntries(new FormData(form));
      if (data.topic !== "candidate") data.candidate = "";
      if ((data.message || "").trim().length < 5) {
        err.textContent = "Write a message of at least a few words.";
        err.hidden = false;
        $("#fb-message").focus();
        return;
      }
      err.hidden = true;
      btn.disabled = true;
      btn.textContent = "Sending…";
      try {
        const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, startedAt }) });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.ok) throw new Error(out.error || "Your feedback didn't send. Try again in a minute.");
        form.reset();
        form.hidden = true;
        $("#fb-done").hidden = false;
      } catch (ex) {
        err.textContent = ex instanceof TypeError ? "Your feedback didn't send. Check your connection and try again." : ex.message;
        err.hidden = false;
      } finally {
        btn.disabled = false;
        btn.textContent = "Send feedback";
      }
    });
    $("#fb-again").addEventListener("click", () => {
      $("#fb-done").hidden = true;
      form.hidden = false;
      startedAt = Date.now();
      syncTopic();
    });
  }
  const prefillFeedback = (id) => {
    const c = byId[id];
    if (!c) return;
    $("#fb-topic").value = "candidate";
    $("#fb-candidate").value = c.name;
    $("#fb-cand-field").hidden = false;
  };

  // ── Header bits ──
  function renderChrome() {
    const today = pacificToday();
    const d = dayDiff(today, ELECTION_DATE);
    const now = Date.now();
    let html;
    if (d > 1) html = `<b>${d}</b><span class="cd-text"><strong>days until voting day</strong><span>Saturday, Oct 17, 8 am to 8 pm</span></span>`;
    else if (d === 1) html = `<b class="word">Tmrw</b><span class="cd-text"><strong>Voting day is tomorrow</strong><span>Saturday, Oct 17, 8 am to 8 pm</span></span>`;
    else if (d === 0 && now < Date.parse(G.pollsClose)) html = `<b class="word">Today</b><span class="cd-text"><strong>Polls are open</strong><span>Until 8 pm</span></span>`;
    else html = `<span class="cd-text closed">Voting has closed. Results will be posted by the <a href="https://www.mapleridge.ca/your-government/municipal-elections" target="_blank" rel="noopener">City of Maple Ridge</a>.</span>`;
    $("#countdown").innerHTML = html;
    const n = RACES.reduce((s, r) => s + saved.picks[r].length, 0);
    const badge = $("#ballot-count");
    badge.hidden = !n;
    badge.textContent = n;
    $("#checked").textContent = `Information last checked ${G.lastChecked}.`;
  }

  function renderAll() {
    renderChrome();
    renderStart();
    renderQuestions();
    renderCandidates();
    renderCompare();
    renderBallot();
    renderPrintSheet();
    renderAbout();
    if (dialog.open && dialog.dataset.cid) openCandidate(dialog.dataset.cid);
  }

  // ── Routing ──
  const VIEWS = ["start", "questions", "candidates", "compare", "ballot", "about", "feedback"];
  let current = null;
  function route() {
    let h = location.hash.slice(1);
    let open = null;
    if (h.startsWith("c-") && byId[h.slice(2)]) { open = h.slice(2); h = "candidates"; }
    if (!VIEWS.includes(h)) h = "start";
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== h;
    document.body.dataset.view = h;
    document.querySelectorAll(".tabs a").forEach((a) => { if (a.getAttribute("href") === "#" + h) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const nav = $(".tabs"), cur = $(".tabs a[aria-current]");
    if (nav && cur && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2, behavior: current ? "smooth" : "auto" });
    if (current !== h) { window.scrollTo({ top: 0 }); current = h; }
    if (open) openCandidate(open);
  }

  // ── Events (delegated) ──
  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, a");
    if (!t) {
      const cardEl = e.target.closest("[data-card]");
      if (cardEl && !window.getSelection()?.toString()) openCandidate(cardEl.dataset.card);
      return;
    }
    const d = t.dataset;
    if (d.feedback) { prefillFeedback(d.feedback); if (dialog.open) dialog.close?.(); return; }
    if (d.gotoRace) { ui.race = d.gotoRace; ui.slate = "all"; renderCandidates(); return; }
    if (d.pick) { togglePick(d.pick); return; }
    if (d.open) { openCandidate(d.open); return; }
    if (d.race && t.closest("#race-seg")) { ui.race = d.race; renderCandidates(); return; }
    if ("resetFilters" in d) { ui.race = "all"; ui.slate = "all"; ui.search = ""; $("#cand-search").value = ""; renderCandidates(); return; }
    if (d.crace) { ui.compareRace = d.crace; ui.cell = null; renderCompare(); return; }
    if (d.cell) {
      const [c, k] = d.cell.split("|");
      ui.cell = ui.cell && ui.cell.c === c && ui.cell.k === k ? null : { c, k };
      renderCompare();
      return;
    }
    if (d.answer !== undefined) { saved.answers[d.answer] = d.val; persist(); renderBallot(); renderPrintSheet(); return; }
    if ("print" in d) { renderPrintSheet(); window.print(); return; }
    if (d.clear) {
      if (d.clear === "ask") ui.confirmClear = true;
      else { if (d.clear === "yes") saved = blank(); persist(); ui.confirmClear = false; }
      renderAll();
    }
  });
  document.addEventListener("change", (e) => {
    const s = e.target.closest("[data-sbs]");
    if (!s) return;
    const sel = ui.sbs[ui.compareRace];
    sel[+s.dataset.sbs] = s.value;
    ui.sbs[ui.compareRace] = Array.from({ length: Math.max(sel.length, +s.dataset.sbs + 1) }, (_, i) => sel[i] || "");
    renderCompare();
  });
  window.addEventListener("hashchange", route);

  // ── Theme: sun/moon toggle. Follows the device until the visitor picks. ──
  const themeBtn = document.getElementById("theme-toggle");
  const setTheme = (t) => {
    document.documentElement.dataset.theme = t;
    const next = t === "dark" ? "light" : "dark";
    themeBtn.setAttribute("aria-label", `Switch to ${next} mode`);
    themeBtn.title = `Switch to ${next} mode`;
  };
  const savedTheme = () => { try { return localStorage.getItem("mr-theme"); } catch { return null; } };
  themeBtn.addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("mr-theme", t); } catch { /* ignore */ }
    setTheme(t);
  });
  const deviceDark = matchMedia("(prefers-color-scheme: dark)");
  deviceDark.addEventListener?.("change", (e) => { if (!savedTheme()) setTheme(e.matches ? "dark" : "light"); });
  setTheme(document.documentElement.dataset.theme || (deviceDark.matches ? "dark" : "light"));

  renderAll();
  renderFeedback();
  route();
})();
