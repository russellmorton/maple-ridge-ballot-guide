(() => {
  const G = window.GUIDE;
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).filter((ch) => /[A-Z]/.test(ch)).slice(0, 2).join("");
  const byId = Object.fromEntries(G.candidates.map((c) => [c.id, c]));
  const ridingById = Object.fromEntries(G.ridings.map((r) => [r.id, r]));
  const partyById = Object.fromEntries(G.parties.map((p) => [p.id, p]));
  const inRiding = (id) => G.candidates.filter((c) => c.riding === id);
  const partyOf = (c) => (c.party ? partyById[c.party] : null);
  const partyName = (c) => partyOf(c)?.name || (c.unaffiliated ? "Unaffiliated" : "Independent");
  const HOME = G.ridings.filter((r) => r.home);
  const NEAR = G.ridings.filter((r) => !r.home);
  const V = G.voting || {};
  const NUM = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

  // Elections BC writes district names with hyphens; other sources use dashes.
  const norm = (s) => String(s || "").replace(/[‐-―]/g, "-").replace(/\s*-\s*/g, "-").trim().toLowerCase();
  const ridingByName = (name) => G.ridings.find((r) => norm(r.name) === norm(name)) || null;

  const STANCE = {
    supports: { label: "For" },
    opposes: { label: "Against" },
    mixed: { label: "Mixed" },
    priority: { label: "Priority" },
    none: { label: "No statement" },
  };
  const pill = (stance, compact) => `<span class="st st-${stance}">${compact && stance === "none" ? "—" : STANCE[stance].label}</span>`;
  // Party answers to yes-or-no questions: "none" means the platform doesn't say.
  const qpill = (stance) => (stance === "none" ? `<span class="st st-none">Not addressed</span>` : pill(stance));

  // ── Dates (Pacific time) ──
  const pacificToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Vancouver" }).format(new Date());
  const dayDiff = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
  const ELECTION_DATE = G.electionDay.slice(0, 10);
  const fmtDay = (iso) => {
    const d = new Date(iso + "T12:00:00Z");
    return {
      wd: d.toLocaleDateString("en-CA", { weekday: "short", timeZone: "UTC" }),
      long: d.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }),
      day: d.getUTCDate(),
      mon: d.toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" }),
    };
  };
  const shortDate = (iso) => new Date(iso + "T12:00:00Z").toLocaleDateString("en-CA", { month: "short", day: "numeric", timeZone: "UTC" });
  const pollsOpen = () => Date.now() < Date.parse(G.pollsClose);
  const advanceToday = () => G.advanceDates.includes(pacificToday());

  // ── Sources ──
  // "profile" is the candidate's own party page; every other key is in G.sources.
  const srcLink = (key, c) => {
    if (Array.isArray(key)) return `<span class="src-group">${key.map((k) => srcLink(k, c)).join("")}</span>`;
    if (key === "profile") return c?.profile ? `<a class="src" href="${esc(c.profile.url)}" target="_blank" rel="noopener">Source: ${esc(c.profile.label)}</a>` : "";
    const s = G.sources[key];
    if (!s) return "";
    const label = key === "candidate" ? "Sent to us by the candidate" : s.short || `${s.publisher}${s.date ? ", " + shortDate(s.date) : ""}`;
    if (!s.url) return `<span class="src">Source: ${esc(label)}</span>`;
    return `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener">Source: ${esc(label)}</a>`;
  };
  // A riding's advance voting places and district electoral office.
  const placesHtml = (r) => `
    ${r.advance?.length ? `<div class="stack" style="gap:.3rem"><span class="eyebrow">Advance voting places in ${esc(r.name)}</span><ul class="places">${r.advance.map(([n, a, d]) => `<li>${esc(n)}<small>${esc(a)} · ${esc(d)}</small></li>`).join("")}</ul></div>` : ""}
    ${r.office ? `<p style="font-size:.92rem"><strong>District electoral office:</strong> ${esc(r.office.address)} · ${esc(r.office.phone)} · ${esc(r.office.email)}</p>` : ""}
    <span class="src-group">${srcLink("ebcAdvance")}${srcLink("ebcOffices")}</span>`;
  const whereToVote = (text = "Elections BC's Where to Vote") =>
    V.whereToVoteUrl ? `<a href="${esc(V.whereToVoteUrl)}" target="_blank" rel="noopener">${esc(text)}</a>` : `<a href="${esc(G.sources.electionsBC.url)}" target="_blank" rel="noopener">Elections BC</a>`;
  const pending = `<p class="muted">Being confirmed with Elections BC.</p>`;

  // ── Saved plan (this device only). Never the address. ──
  const STORE_KEY = "mr-prov-2026";
  const blank = () => ({ riding: null, pick: null, when: "" });
  let saved = blank();
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      saved = { ...blank(), ...p };
      if (!ridingById[saved.riding]) saved.riding = null;
      if (!byId[saved.pick] || byId[saved.pick].riding !== saved.riding) saved.pick = null;
    }
  } catch { /* storage unavailable: start fresh */ }
  const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(saved)); } catch { /* ignore */ } };
  const setRiding = (id) => {
    if (saved.riding === id) return;
    saved.riding = id;
    if (saved.pick && byId[saved.pick]?.riding !== id) saved.pick = null;
    ui.compareRiding = id;
    ui.cell = null;
    persist();
  };
  const togglePick = (id) => {
    const c = byId[id];
    if (!c) return;
    if (saved.pick === id) saved.pick = null;
    else {
      if (!saved.riding) setRiding(c.riding);
      if (c.riding !== saved.riding) return;
      saved.pick = id;
    }
    persist();
    renderAll();
  };
  const ovalBtn = (c) => {
    const on = saved.pick === c.id;
    const elsewhere = saved.riding && c.riding !== saved.riding;
    const taken = !on && saved.pick && !elsewhere;
    const title = elsewhere ? `title="Not in your riding (${esc(ridingById[saved.riding].name)}). Change your riding in My vote plan."` : taken ? `title="You've marked ${esc(byId[saved.pick].name)}. Marking this candidate replaces them."` : "";
    return `<button class="oval" type="button" data-pick="${c.id}" aria-pressed="${on}" ${elsewhere ? "disabled" : ""} ${title}><i aria-hidden="true"></i>${on ? "On my vote plan" : elsewhere ? "Not in your riding" : "Mark on my vote plan"}</button>`;
  };

  // ── UI state ──
  const ui = {
    lookup: null, // last "Find your riding" answer, kept in memory only
    candRiding: saved.riding || "all", party: "all", search: "",
    issue: G.issues[0]?.id,
    compareRiding: saved.riding || G.ridings[0]?.id, cell: null, qcell: null,
    confirmClear: false,
  };
  const ridingOptions = (sel, withAll) => `${withAll ? `<option value="all">All ridings</option>` : ""}${[["Maple Ridge", HOME], ["Next door", NEAR]].filter(([, l]) => l.length).map(([g, l]) => `<optgroup label="${g}">${l.map((r) => `<option value="${r.id}" ${sel === r.id ? "selected" : ""}>${esc(r.name)}${saved.riding === r.id ? " (yours)" : ""}</option>`).join("")}</optgroup>`).join("")}`;
  const ridingButtons = (attr) => G.ridings.map((r) => `<button type="button" ${attr}="${r.id}" aria-pressed="${saved.riding === r.id}">${esc(r.name)}</button>`).join("");

  // ── START ──
  function renderStart() {
    const view = $("#view-start");
    const today = pacificToday();
    const dateTile = (iso, main) => {
      const f = fmtDay(iso);
      const past = dayDiff(today, iso) < 0;
      return `<div class="date ${past ? "past" : ""} ${main ? "main" : ""}" title="${past ? "Already passed" : ""}"><span>${f.wd}</span><b>${f.day}</b><span>${f.mon}</span></div>`;
    };
    const list = (items) => (items?.length ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : pending);
    const C = G.context || {};
    // Build once so the address box keeps its text and focus; later renders
    // only refresh the parts that change.
    if (!$("#finder", view)) {
      view.innerHTML = `
        <div class="stack">
          <p class="lede">On Saturday, October 24, B.C. elects all <em>${C.seats || 93} MLAs</em>. Maple Ridge is split between <em>two ridings</em>, and you vote for one candidate in yours.</p>
          <p class="prose muted">This guide covers every candidate in Maple Ridge's two ridings${NEAR.length ? ` and the ${NUM[NEAR.length] || NEAR.length} ridings next door` : ""}, what each party is promising, and how to vote. Every statement links to where it came from.</p>
        </div>

        <div class="panel finder" id="finder">
          <div class="stack" style="gap:.3rem">
            <h3 style="font-size:1.35rem">Find your riding</h3>
            <p class="muted">Enter your home address. The guide checks it against the official riding boundaries and shows who's on your ballot.</p>
          </div>
          <form id="finder-form" novalidate>
            <label class="sr-only" for="addr">Home address</label>
            <input id="addr" name="address" type="text" autocomplete="street-address" maxlength="200" placeholder="e.g. 11995 Haney Place, Maple Ridge">
            <button class="btn primary" type="submit" id="addr-go">Find my riding</button>
          </form>
          <p class="fine">Your address is sent to the B.C. government's address service to find where it is. It isn't stored anywhere, including on this device.</p>
          <div id="finder-result" aria-live="polite"></div>
          <div class="pick-riding" id="pick-riding"></div>
        </div>

        <div class="ballot-paper">
          <header><span class="eyebrow">How the election works</span></header>
          <div class="ballot-row"><h3>Your ballot: one MLA</h3><span class="rule">Vote for 1</span><p class="what">Mark one candidate in your riding. The candidate with the most votes wins the seat, even without a majority.</p></div>
          <div class="ballot-row"><h3>Forming government</h3><span class="rule">${C.majority || 47} of ${C.seats || 93} seats</span><p class="what">The party that can win the support of most MLAs in the legislature forms government, and its leader becomes premier. ${C.majority || 47} seats is a majority.</p></div>
          <div class="ballot-row"><h3>The premier isn't on your ballot</h3><span class="rule">Only in their own riding</span><p class="what">You don't vote for premier directly. Party leaders appear on the ballot only in the riding where they're running.</p></div>
        </div>

        <div class="grid-2">
          <div class="panel">
            <h3>Advance voting and Final Voting Day</h3>
            <div class="dates">${G.advanceDates.map((d) => dateTile(d, false)).join("")}${dateTile(ELECTION_DATE, true)}</div>
            ${V.hours ? `<p>${esc(V.hours)}</p>` : pending}
            ${V.mailText ? `<p><strong>Voting by mail:</strong> ${esc(V.mailText)}</p>` : ""}
            ${V.workTime ? `<p><strong>Time off work:</strong> ${esc(V.workTime)}</p>` : ""}
          </div>
          <div class="panel">
            <h3>You can vote if you are</h3>
            ${list(V.eligibility)}
            <h3>What to bring</h3>
            ${list(V.id)}
          </div>
        </div>

        <div class="panel">
          <h3>Where to vote</h3>
          ${V.where ? `<p>${esc(V.where)}</p>` : pending}
          <p>Your Where to Vote card from Elections BC lists your assigned voting place. You can also look it up on ${whereToVote()}.</p>
          <div id="start-where"></div>
          ${V.accessible ? `<p><strong>Accessibility:</strong> ${esc(V.accessible)}</p>` : ""}
          <span class="src-group">${srcLink(V.source)}${srcLink("ebcAccess")}${srcLink("ebcTimeOff")}</span>
        </div>

        ${C.why ? `<div class="panel prose"><span class="eyebrow">Why there's an election now</span><p>${esc(C.why)}</p>${C.source ? srcLink(C.source) : ""}</div>` : ""}`;
    }
    $("#pick-riding", view).innerHTML = `<span class="muted" style="font-size:.9rem">${saved.riding ? "Your riding:" : "Or choose your riding:"}</span>${ridingButtons("data-set-riding")}`;
    $("#finder-result", view).innerHTML = finderResult();
    const r = ridingById[saved.riding];
    $("#start-where", view).innerHTML = r ? placesHtml(r) : `<p class="muted" style="font-size:.9rem">Find or choose your riding above to see its advance voting places and district electoral office.</p>`;
  }

  // The answer from /api/riding, in words.
  function finderResult() {
    const r = ui.lookup;
    if (!r) return "";
    if (r.busy) return `<div class="result"><p>Looking up that address…</p></div>`;
    const confirm = `<p class="fine">Boundary files can't be the final word on your riding. Confirm with ${whereToVote()} before you vote.</p>`;
    const retry = `<p>Try the full address with the street number and city, for example <em>11995 Haney Place, Maple Ridge</em>.</p>`;
    if (r.error) return `<div class="result warn"><p>${esc(r.error)}</p><p>You can choose your riding below, or look it up on ${whereToVote()}.</p></div>`;
    if (r.status === "found") {
      const riding = ridingByName(r.district);
      if (!riding) {
        return `<div class="result warn"><span class="eyebrow">That address looks like it's in</span><h3>${esc(r.district)}</h3>${r.matchedAddress ? `<p class="muted">Matched address: ${esc(r.matchedAddress)}</p>` : ""}<p>This guide doesn't cover that riding. Elections BC lists every candidate in the province.</p>${confirm}</div>`;
      }
      const cands = inRiding(riding.id);
      return `
        <div class="result">
          <span class="eyebrow">Your riding is most likely</span>
          <h3>${esc(riding.name)}</h3>
          ${r.matchedAddress ? `<p class="muted" style="font-size:.9rem">Matched address: ${esc(r.matchedAddress)}. If that's not your address, try again with more detail.</p>` : ""}
          ${r.nearBoundary ? `<p class="note">This address is close to a riding boundary, so it's worth confirming with Elections BC.</p>` : ""}
          <ul class="who-list">${cands.map((c) => `<li><button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button> <span class="muted">${esc(partyName(c))}</span></li>`).join("")}</ul>
          <div class="actions"><a class="btn primary" href="#r-${riding.id}">See your riding</a><a class="btn" href="#compare" data-compare-riding="${riding.id}">Compare your candidates</a></div>
          ${confirm}
        </div>`;
    }
    if (r.status === "imprecise" || r.status === "low-score") {
      return `<div class="result warn"><p><strong>We couldn't pin down that address.</strong>${r.matchedAddress ? ` The closest match was <em>${esc(r.matchedAddress)}</em>, which isn't precise enough to tell which riding it's in.` : ""}</p>${retry}</div>`;
    }
    if (r.status === "not-found") return `<div class="result warn"><p><strong>We couldn't find that address in B.C.</strong></p>${retry}</div>`;
    return `<div class="result warn"><p>We found the address but couldn't tell which riding it's in. Choose your riding below, or look it up on ${whereToVote()}.</p></div>`;
  }

  async function lookup(address) {
    ui.lookup = { busy: true };
    $("#finder-result").innerHTML = finderResult();
    const btn = $("#addr-go");
    btn.disabled = true;
    try {
      const r = await fetch("/api/riding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }) });
      const out = await r.json().catch(() => ({}));
      if (!r.ok || !out.ok) throw new Error(out.error || "The address lookup isn't working right now.");
      ui.lookup = out;
      const riding = out.status === "found" ? ridingByName(out.district) : null;
      if (riding) setRiding(riding.id);
    } catch (ex) {
      ui.lookup = { error: ex instanceof TypeError ? "Couldn't reach the address lookup. Check your connection and try again." : ex.message };
    } finally {
      btn.disabled = false;
    }
    renderAll();
  }

  // ── RIDINGS ──
  function resultsHtml(r) {
    const res = r.result2024;
    if (!res?.rows?.length) return `<p class="muted">Not yet added.</p>`;
    const rows = res.rows.slice().sort((a, b) => b.votes - a.votes);
    const [first, second] = rows;
    const margin = second ? first.votes - second.votes : null;
    return `
      <ol class="results" aria-label="2024 results in ${esc(r.name)}">
        ${rows.map((row, i) => `
          <li class="${i === 0 ? "won" : ""}" title="${esc(row.name)}: ${row.votes.toLocaleString("en-CA")} votes">
            <span class="lbl"><span>${esc(row.name)}${i === 0 ? " <strong>won</strong>" : ""}</span><small>${esc(row.party)}</small></span>
            <span class="track"><span class="fill" style="width:${Math.max(0, Math.min(100, row.pct))}%"></span></span>
            <span class="pct">${row.pct.toFixed(1)}%</span>
          </li>`).join("")}
      </ol>
      ${margin !== null ? `<p class="margin-note">Won by <strong class="mono">${margin.toLocaleString("en-CA")}</strong> vote${margin === 1 ? "" : "s"} (${(first.pct - second.pct).toFixed(1)} points).${res.note ? " " + esc(res.note) : ""}</p>` : ""}
      ${res.source ? srcLink(res.source) : ""}`;
  }

  // Riding outlines, drawn straight from BC Albers metres (north is up). The
  // view is cropped to the populated south: Maple Ridge-Pitt Meadows runs far
  // north into the mountains, which would otherwise shrink everything else.
  function mapHtml() {
    const M = window.RIDING_MAP;
    if (!M?.districts?.length) return "";
    const pts = M.districts.flatMap((d) => d.polygons.flat(2));
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys);
    const maxY = Math.min(Math.max(...ys), minY + (maxX - minX) * 0.72);
    const W = maxX - minX, H = maxY - minY, pad = W * 0.02;
    const inView = ([x, y]) => y <= maxY;
    const path = (polys) => polys.map((poly) => poly.map((ring) => "M" + ring.map(([x, y]) => `${Math.round(x - minX)},${Math.round(maxY - y)}`).join("L") + "Z").join("")).join("");
    // Label at the middle of the riding's visible outline.
    const labelAt = (polys) => {
      const vis = polys.flatMap((poly) => poly[0]).filter(inView);
      const bx = vis.map((p) => p[0]), by = vis.map((p) => p[1]);
      return [(Math.min(...bx) + Math.max(...bx)) / 2 - minX, maxY - (Math.min(...by) + Math.max(...by)) / 2];
    };
    const fs = Math.round(W / 38);
    return `
      <figure class="map-wrap" style="margin:0">
        <svg viewBox="${-pad} ${-pad} ${W + 2 * pad} ${H + 2 * pad}" role="group" aria-label="Map of the ridings this guide covers">
          ${M.districts.map((d) => {
            const r = ridingById[d.id];
            if (!r) return "";
            const cls = [r.home ? "home" : "", saved.riding === r.id ? "mine" : ""].join(" ");
            return `<a href="#r-${r.id}" aria-label="${esc(r.name)}"><path class="${cls}" fill-rule="evenodd" d="${path(d.polygons)}"><title>${esc(r.name)}</title></path></a>`;
          }).join("")}
          ${M.districts.map((d) => {
            const r = ridingById[d.id];
            if (!r) return "";
            const [x, y] = labelAt(d.polygons);
            return `<text x="${Math.round(x)}" y="${Math.round(y)}" text-anchor="middle" style="font-size:${fs}px;stroke-width:${Math.round(fs / 4)}px" class="${saved.riding === r.id ? "on-mine" : ""}">${esc(r.name)}</text>`;
          }).join("")}
        </svg>
        <figcaption class="src" style="padding:.3rem .2rem 0">Boundaries: ${esc(M.source)}${M.fetched ? `, downloaded ${esc(M.fetched)}` : ""}. Maple Ridge-Pitt Meadows also extends far to the north. Select a riding to jump to it.</figcaption>
      </figure>`;
  }

  const candRow = (c) => `
    <li>
      <span class="mono-av" aria-hidden="true">${initials(c.name)}</span>
      <span class="who"><button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button><small>${esc(partyName(c))}${c.incumbent ? " · Incumbent MLA" : ""}</small></span>
    </li>`;

  function ridingCard(r) {
    const cands = inRiding(r.id);
    const mine = saved.riding === r.id;
    return `
      <article class="riding ${mine ? "mine" : ""}" id="r-${r.id}">
        <header>
          <h3>${esc(r.name)}</h3>
          <span class="eyebrow">${mine ? `<span class="badge mine">Your riding</span> ` : ""}${cands.length} candidates, vote for 1</span>
        </header>
        ${r.area ? `<p class="muted prose">${esc(r.area)}</p>` : ""}
        ${r.note ? `<p class="note">${esc(r.note)} ${r.noteSource ? srcLink(r.noteSource) : ""}</p>` : ""}
        <div class="riding-cols">
          <div class="stack" style="gap:.5rem">
            <span class="eyebrow">On the ballot</span>
            <ol class="cand-rows">${cands.map(candRow).join("")}</ol>
            <div class="actions">
              <a class="btn" href="#compare" data-compare-riding="${r.id}">Compare these candidates</a>
              ${mine ? "" : `<button class="btn" type="button" data-set-riding="${r.id}">This is my riding</button>`}
            </div>
          </div>
          <div class="stack" style="gap:.5rem">
            <span class="eyebrow">2024 result in this riding</span>
            ${resultsHtml(r)}
          </div>
        </div>
        <details class="where-details"${mine ? " open" : ""}>
          <summary>Where to vote in ${esc(r.name)}</summary>
          <div class="stack" style="gap:.6rem;margin-top:.6rem">${placesHtml(r)}
            <p class="muted" style="font-size:.88rem">You can vote at any advance voting place in B.C., not just these. On October 24, check your Where to Vote card or ${whereToVote("Elections BC's Where to Vote")}.</p>
          </div>
        </details>
      </article>`;
  }

  function renderRidings() {
    $("#view-ridings").innerHTML = `
      <div class="section-head">
        <h2>The ridings</h2>
        <p class="prose muted">Maple Ridge's two ridings and the ${NUM[NEAR.length] || NEAR.length} ridings a road crosses into from Maple Ridge or Pitt Meadows. Candidates are listed alphabetically by surname, the order Elections BC uses. The 2024 results are from the same boundaries, so they show how close each riding was last time. They aren't a prediction.</p>
      </div>
      ${mapHtml()}
      <div class="group-head"><h3>Maple Ridge</h3></div>
      ${HOME.map(ridingCard).join("")}
      ${NEAR.length ? `<div class="group-head"><h3>Next door</h3><span class="muted" style="font-size:.9rem">Across the Pitt River, the Golden Ears Bridge and the Mission boundary</span></div>${NEAR.map(ridingCard).join("")}` : ""}`;
  }

  // ── CANDIDATES ──
  const badges = (c) => `${c.incumbent ? `<span class="badge inc">Incumbent MLA</span>` : ""}<span class="badge">${esc(partyName(c))}</span>${saved.riding === c.riding ? `<span class="badge mine">Your riding</span>` : ""}`;

  function card(c) {
    return `
      <article class="card ${saved.pick === c.id ? "picked" : ""}" data-card="${c.id}">
        <div class="card-top">
          <span class="mono-av" aria-hidden="true">${initials(c.name)}</span>
          <div style="min-width:0">
            <h3>${esc(c.name)}</h3>
            <div class="meta">${badges(c)}</div>
          </div>
        </div>
        ${c.background ? `<p class="bg">${esc(c.background)}</p>` : `<p class="bg muted">Background not yet added.</p>`}
        ${c.priorities?.length ? `<div class="chips">${c.priorities.slice(0, 3).map((p) => `<span class="chip">${esc(p)}</span>`).join("")}</div>` : ""}
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
      if (ui.party !== "all" && (c.party || "ind") !== ui.party) return false;
      if (!q) return true;
      return [c.name, c.background, partyName(c), ridingById[c.riding].name, ...(c.priorities || [])].join(" ").toLowerCase().includes(q);
    };
    const ridings = ui.candRiding === "all" ? G.ridings : [ridingById[ui.candRiding]];
    const groupsHtml = ridings.map((r) => {
      const list = inRiding(r.id).filter(match);
      if (!list.length) return "";
      return `
        <div class="race-group">
          <header><h3 style="font-size:1.4rem">${esc(r.name)}${saved.riding === r.id ? ` <span class="badge mine">Your riding</span>` : ""}</h3><span class="eyebrow">${inRiding(r.id).length} running, vote for 1</span></header>
          <div class="cards">${list.map(card).join("")}</div>
        </div>`;
    }).join("");

    if (!$("#cand-results", view)) {
      const parties = [...G.parties.filter((p) => G.candidates.some((c) => c.party === p.id)).map((p) => [p.id, p.name]), ...(G.candidates.some((c) => !c.party) ? [["ind", "Independent"]] : [])];
      view.innerHTML = `
        <div class="section-head">
          <h2>Candidates</h2>
          <p class="prose muted">All ${G.candidates.length} candidates in the ${G.ridings.length} ridings this guide covers, alphabetical by surname within each riding. Open a candidate for what they've said on each issue, with sources, and how to reach them.</p>
        </div>
        <div class="toolbar">
          <select id="cand-riding" aria-label="Riding"></select>
          <input class="search" id="cand-search" type="search" placeholder="Search names, backgrounds, priorities" aria-label="Search candidates">
          <select id="cand-party" aria-label="Party">
            <option value="all">Any party</option>
            ${parties.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join("")}
          </select>
        </div>
        <div id="cand-results" class="stack" style="gap:2.25rem"></div>`;
      $("#cand-search", view).addEventListener("input", (e) => { ui.search = e.target.value; renderCandidates(); });
      $("#cand-party", view).addEventListener("change", (e) => { ui.party = e.target.value; renderCandidates(); });
      $("#cand-riding", view).addEventListener("change", (e) => { ui.candRiding = e.target.value; renderCandidates(); });
    }
    $("#cand-riding", view).innerHTML = ridingOptions(ui.candRiding, true);
    $("#cand-party", view).value = ui.party;
    $("#cand-results", view).innerHTML = groupsHtml || `<div class="empty">No candidates match. <button class="linkish" type="button" data-reset-filters>Clear filters</button></div>`;
  }

  // ── Candidate dialog ──
  const dialog = $("#cand-dialog");
  function openCandidate(id) {
    const c = byId[id];
    if (!c) return;
    const p = partyOf(c);
    const positions = G.issues.map((iss) => {
      const pos = c.positions?.[iss.id] || { stance: "none" };
      return `<div class="pos"><span class="lbl">${esc(iss.label)}</span><div class="txt">${pill(pos.stance)}${pos.text ? `<span>${esc(pos.text)}</span>` : `<span class="muted">No public statement found in our sources.</span>`}${pos.source ? srcLink(pos.source, c) : ""}</div></div>`;
    }).join("");
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
            <span class="eyebrow">Candidate in ${esc(ridingById[c.riding].name)}</span>
            <h2 id="dlg-name">${esc(c.name)}</h2>
            <div class="chips">${badges(c)}</div>
          </div>
          <button class="btn" type="button" data-close>Close</button>
        </div>
        ${c.background ? `<p>${esc(c.background)}</p>` : ""}
        ${c.backgroundSource ? srcLink(c.backgroundSource, c) : ""}
        ${c.note ? `<p class="note">${esc(c.note)}</p>` : ""}
        ${c.priorities?.length ? `<div class="stack" style="gap:.5rem"><span class="eyebrow">Priority tags</span><div class="chips">${c.priorities.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div><p class="src">Short labels written by this guide, not quotes.</p></div>` : ""}
        <div class="stack" style="gap:.4rem">
          <span class="eyebrow">What they've said on the issues</span>
          <div class="pos-list">${positions}</div>
        </div>
        <div class="panel" style="padding:.8rem 1rem">
          ${p ? `<p><strong>${esc(p.name)}</strong>${p.leader ? `, led by ${esc(p.leader)}` : ""}. If elected, ${esc(c.name)} would sit as one of its MLAs.</p><a href="#parties" data-party-issue="${esc(p.id)}" data-close>See what the ${esc(p.name)} platform says, issue by issue</a>` : `<p><strong>${esc(partyName(c))}.</strong> ${esc(c.name)} isn't running for a party, so there's no platform to compare. Their own statements are above.</p>`}
        </div>
        <div class="stack" style="gap:.5rem">
          <span class="eyebrow">Contact</span>
          ${contact.length ? `<dl class="contact">${contact.map(([k, v, isUrl]) => `<dt>${k}</dt><dd class="${isUrl ? "url" : ""}">${v}</dd>`).join("")}</dl>` : `<p class="muted">No contact details found.</p>`}
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

  // ── PARTIES ──
  const partyPoints = (p, issueId) => {
    const pos = p.positions?.[issueId];
    if (!pos?.points?.length) return `<p class="none">Nothing on this in the platform we reviewed.</p>`;
    return `<ul>${pos.points.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>${pos.source ? srcLink(pos.source) : ""}`;
  };

  function renderParties() {
    const issue = G.issues.find((i) => i.id === ui.issue) || G.issues[0];
    const local = (p) => G.candidates.filter((c) => c.party === p.id);
    const qs = G.questions || [];
    const QL = { supports: "Yes", opposes: "No", mixed: "Partly" };
    // Neutral answer marks: no stance colours here, so no column reads as a party colour.
    const qcellPill = (stance) => (stance === "none" ? `<span class="st st-none">Not addressed</span>` : `<span class="st qa qa-${stance}">${QL[stance]}</span>`);
    let qdetail = `<p class="muted">Select any answer to read what the party says and where it came from.</p>`;
    if (ui.qcell) {
      const p = partyById[ui.qcell.p], q = qs.find((x) => x.id === ui.qcell.q);
      const a = p?.answers?.[q?.id];
      if (p && q) qdetail = `<div class="stack" style="gap:.35rem"><span class="eyebrow">${esc(q.label)}</span><h3>${esc(p.name)} ${qcellPill(a?.stance || "none")}</h3><p>${esc(a?.text || "We found nothing on this in the party's platform or announcements.")}</p>${a?.source ? srcLink(a.source) : ""}</div>`;
    }
    $("#view-parties").innerHTML = `
      <div class="section-head">
        <h2>The parties and what they're promising</h2>
        <p class="prose muted">The party that can win the support of most MLAs forms government, so its platform matters even though you vote for a local candidate. These are the ${G.parties.length} parties with candidates in the ridings this guide covers, listed alphabetically by the name on the ballot. Every summary links to the platform or announcement it came from.</p>
      </div>

      <div class="party-cards">
        ${G.parties.map((p) => `
          <article class="card party-card">
            <div class="stack" style="gap:.25rem">
              <h3>${esc(p.name)}</h3>
              ${p.fullName && p.fullName !== p.name ? `<p class="sub">${esc(p.fullName)}</p>` : ""}
              <p class="sub"><strong>Leader:</strong> ${esc(p.leader)}${p.leaderNote ? `. ${esc(p.leaderNote)}` : ""}</p>
              ${p.candidatesBC ? `<p class="sub">Running in ${p.candidatesBC} of ${G.context.seats} ridings</p>` : ""}
            </div>
            ${p.summary ? `<p class="sub">${esc(p.summary)} ${p.summarySource ? srcLink(p.summarySource) : ""}</p>` : ""}
            <p class="sub">In this guide's ridings: ${local(p).map((c) => `<button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button> <span class="muted">(${esc(ridingById[c.riding].name)})</span>`).join(", ") || "none"}</p>
            <div class="card-foot">
              ${p.platform?.url ? `<a href="${esc(p.platform.url)}" target="_blank" rel="noopener">${esc(p.platform.title || "Platform")}</a>` : ""}
              ${p.website ? `<a class="src" href="${esc(p.website)}" target="_blank" rel="noopener">Party website</a>` : ""}
            </div>
          </article>`).join("")}
      </div>
      <p class="src" style="margin-top:-1rem">Leaders and ballot names: ${srcLink("ebcParties")} Candidate counts: ${srcLink("ebcCandidates")}</p>
      ${G.candidates.some((c) => !c.party) ? `<p class="muted" style="font-size:.9rem">Independent and unaffiliated candidates aren't part of a party, so there's no platform to compare. Their own statements are on their candidate pages.</p>` : ""}

      ${qs.length ? `
        <div class="stack" style="gap:.75rem">
          <h3 style="font-size:1.4rem">Where the parties stand on key questions</h3>
          <p class="muted prose" style="font-size:.92rem">Questions where the parties' platforms take clear, different positions. "Not addressed" means we found nothing in the party's platform or announcements, not that it has no view.</p>
          <div class="table-sheet scroll-x"><table class="matrix qgrid">
            <thead><tr><th class="cand">Question</th>${G.parties.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead>
            <tbody>${qs.map((q) => `<tr><td class="cand" style="min-width:14rem">${esc(q.label)}</td>${G.parties.map((p) => {
              const a = p.answers?.[q.id] || { stance: "none" };
              const selected = ui.qcell && ui.qcell.p === p.id && ui.qcell.q === q.id;
              return `<td><button class="cell" type="button" data-qcell="${p.id}|${q.id}" aria-pressed="${selected}" aria-label="${esc(p.name)}, ${esc(q.label)}: ${a.stance === "none" ? "Not addressed" : QL[a.stance]}">${qcellPill(a.stance)}</button></td>`;
            }).join("")}</tr>`).join("")}</tbody>
          </table></div>
          <div class="panel detail" aria-live="polite">${qdetail}</div>
        </div>` : ""}

      <div class="stack" style="gap:.9rem" id="platforms">
        <h3 style="font-size:1.4rem">Platforms, issue by issue</h3>
        <div class="issue-chips" role="group" aria-label="Issue">${G.issues.map((i) => `<button type="button" data-issue="${i.id}" aria-pressed="${i.id === issue.id}">${esc(i.label)}</button>`).join("")}</div>
        <p class="muted" style="font-size:.92rem">${esc(issue.question)}</p>
        <div class="platforms">
          ${G.parties.map((p) => `<div class="platform"><h4>${esc(p.name)}</h4>${partyPoints(p, issue.id)}</div>`).join("")}
        </div>
      </div>`;
  }

  // ── COMPARE ──
  function renderCompare() {
    const riding = ridingById[ui.compareRiding] || G.ridings[0];
    const cands = inRiding(riding.id);
    const cols = G.issues;
    const head = `<tr><th class="cand">Candidate</th>${cols.map((col) => `<th title="${esc(col.question)}">${esc(col.short)}</th>`).join("")}</tr>`;
    const rows = cands.map((c) => `
      <tr class="${saved.pick === c.id ? "picked" : ""}">
        <td class="cand"><button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button><br><span class="muted" style="font-size:.8rem">${esc(partyName(c))}</span></td>
        ${cols.map((col) => {
          const st = c.positions?.[col.id]?.stance || "none";
          const selected = ui.cell && ui.cell.c === c.id && ui.cell.k === col.id;
          return `<td><button class="cell" type="button" data-cell="${c.id}|${col.id}" aria-pressed="${selected}" aria-label="${esc(c.name)}, ${esc(col.label)}: ${STANCE[st].label}">${pill(st, true)}</button></td>`;
        }).join("")}
      </tr>`).join("");

    let detail = `<p class="muted">Select any cell to read what the candidate said, where it came from, and what their party's platform says on the same issue.</p>`;
    if (ui.cell && byId[ui.cell.c]?.riding === riding.id) {
      const c = byId[ui.cell.c];
      const col = cols.find((x) => x.id === ui.cell.k);
      const pos = c.positions?.[col.id] || { stance: "none" };
      const p = partyOf(c);
      detail = `
        <div class="stack" style="gap:.35rem">
          <span class="eyebrow">${esc(col.label)}</span>
          <h3>${esc(c.name)} ${pill(pos.stance)}</h3>
          <p>${esc(pos.text || "No public statement found in our sources.")}</p>
          ${pos.source ? srcLink(pos.source, c) : ""}
        </div>
        ${p ? `<div class="stack" style="gap:.35rem;margin-top:.8rem;padding-top:.8rem;border-top:1px dashed var(--line)"><span class="eyebrow">${esc(p.name)} platform</span>${partyPoints(p, col.id)}</div>` : ""}`;
    }

    // Everyone in the riding, issue by issue, with their party's line underneath.
    const sbsRows = cols.map((col) => `<tr><td class="sbs-issue">${esc(col.label)}</td>${cands.map((c) => {
      const pos = c.positions?.[col.id] || { stance: "none" };
      const p = partyOf(c);
      const pp = p?.positions?.[col.id]?.points || [];
      return `<td data-label="${esc(c.name)}"><div class="stack" style="gap:.3rem;align-items:start">${pill(pos.stance)}${pos.text ? `<span>${esc(pos.text)}</span>${pos.source ? srcLink(pos.source, c) : ""}` : ""}${pp.length ? `<span class="muted" style="font-size:.85rem"><strong>Party:</strong> ${esc(pp[0])}${pp.length > 1 ? ` <button class="linkish" style="font-size:.85rem" type="button" data-party-issue="${p.id}" data-issue-id="${col.id}">+${pp.length - 1} more</button>` : ""}</span>` : ""}</div></td>`;
    }).join("")}</tr>`).join("");

    $("#view-compare").innerHTML = `
      <div class="section-head">
        <h2>Compare the candidates in a riding</h2>
        <p class="prose muted">Each cell sums up what a candidate has said publicly on that issue. Select a cell for the quote, the source, and what their party's platform says. "No statement" means we found nothing, not that they have no view.</p>
      </div>
      <div class="toolbar">
        <select id="compare-riding" aria-label="Riding">${ridingOptions(riding.id, false)}</select>
      </div>
      <div class="legend stance-legend">${[["supports", "supports it"], ["opposes", "against it"], ["mixed", "has concerns, or supports part of it"], ["priority", "names it as a priority"], ["none", "nothing found (doesn't mean no view)"]].map(([s, t]) => `<span class="lg">${s === "none" ? `<span class="st legend-dash">—</span>` : pill(s)} ${t}</span>`).join("")}</div>
      <div class="stack" style="gap:.75rem">
        <div class="table-sheet scroll-x"><table class="matrix"><thead>${head}</thead><tbody>${rows}</tbody></table></div>
        <div class="panel detail" aria-live="polite">${detail}</div>
      </div>
      <div class="sbs">
        <div class="section-head"><h3 style="font-size:1.4rem">Everyone in ${esc(riding.name)}, side by side</h3></div>
        <div class="table-sheet scroll-x"><table class="sbs-table"><thead><tr><th>Issue</th>${cands.map((c) => `<th>${esc(c.name)}<br><span class="muted" style="font-weight:400">${esc(partyName(c))}</span></th>`).join("")}</tr></thead><tbody>${sbsRows}</tbody></table></div>
      </div>`;
    $("#compare-riding").addEventListener("change", (e) => { ui.compareRiding = e.target.value; ui.cell = null; renderCompare(); });
  }

  // ── MY VOTE PLAN ──
  const CAN_PRINT = (() => { try { return window.self === window.top; } catch { return false; } })();
  const whenLabel = (w) => (w === "gvd" ? `Final Voting Day, ${fmtDay(ELECTION_DATE).long}` : w === "mail" ? "By mail" : w.startsWith("adv-") ? `Advance voting, ${fmtDay(w.slice(4)).long}` : "");

  function renderPlan() {
    const today = pacificToday();
    const r = ridingById[saved.riding];
    const cands = r ? inRiding(r.id) : [];
    const whenOpts = [
      ...G.advanceDates.filter((d) => dayDiff(today, d) >= 0).map((d) => [`adv-${d}`, `${fmtDay(d).wd} ${shortDate(d)} (advance)`]),
      ...(dayDiff(today, ELECTION_DATE) >= 0 ? [["gvd", `Sat ${shortDate(ELECTION_DATE)} (voting day)`]] : []),
      ["mail", "By mail"],
    ];
    $("#view-plan").innerHTML = `
      <div class="section-head">
        <h2>My vote plan</h2>
        <p class="prose">Decide who you'll vote for, and when and where, before you go.</p>
        <div class="notice">
          <h3>This is not your vote</h3>
          <p>Nothing on this page is sent to Elections BC or counted. To vote, go to a voting place by 8 pm on Saturday, October 24, or return a mail ballot by then.</p>
          <h3>Your plan is private</h3>
          <p>It's saved only on the phone or computer you're using now. We can't see it. Your address is never saved.</p>
        </div>
      </div>

      <div class="panel">
        <span class="eyebrow">1. Your riding</span>
        <div class="pick-riding">${ridingButtons("data-set-riding")}</div>
        <p class="muted" style="font-size:.9rem">Not sure? <a href="#start" data-focus-finder>Find your riding from your address</a>.</p>
      </div>

      <div class="panel">
        <span class="eyebrow">2. Your candidate</span>
        ${r ? `
          <div class="stack" style="gap:.2rem">
            ${cands.map((c) => `<div class="answer-row"><span><button class="linkish" type="button" data-open="${c.id}">${esc(c.name)}</button> <span class="muted">${esc(partyName(c))}${c.incumbent ? " · Incumbent" : ""}</span></span>${ovalBtn(c)}</div>`).join("")}
          </div>
          <p class="muted" style="font-size:.88rem">You vote for one candidate. <a href="#compare" data-compare-riding="${r.id}">Compare them first</a>.</p>`
          : `<p class="muted">Choose your riding first.</p>`}
      </div>

      <div class="panel">
        <span class="eyebrow">3. When you'll vote</span>
        <div class="pick-riding" role="group" aria-label="When you'll vote">${whenOpts.map(([v, l]) => `<button type="button" data-when="${v}" aria-pressed="${saved.when === v}">${esc(l)}</button>`).join("")}</div>
        ${V.hours ? `<p>${esc(V.hours)}</p>` : ""}
        ${saved.when === "mail" && V.mailText ? `<p>${esc(V.mailText)}</p>` : ""}
        <p>${V.where ? esc(V.where) + " " : ""}Find the closest places on ${whereToVote()}.</p>
        ${r ? placesHtml(r) : ""}
      </div>

      <div class="panel">
        <span class="eyebrow">4. What to bring</span>
        ${V.id?.length ? `<ul class="checklist">${V.id.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : pending}
      </div>

      <div class="toolbar">
        ${CAN_PRINT
          ? `<button class="btn primary" type="button" data-print>Print my vote plan</button><span class="muted" style="font-size:.88rem">One page with your choice, when and where to vote, and what to bring.</span>`
          : `<span class="muted" style="font-size:.88rem">Printing isn't available in this preview. Open the site directly to print your plan.</span>`}
      </div>
      ${saved.riding || saved.pick || saved.when ? `<div>${ui.confirmClear
        ? `<span class="confirm">Remove your plan from this device? <button class="btn danger" type="button" data-clear="yes">Remove it</button><button class="btn" type="button" data-clear="no">Keep it</button></span>`
        : `<button class="btn" type="button" data-clear="ask">Start over</button>`}</div>` : ""}`;
  }

  function renderPrintSheet() {
    const today = pacificToday();
    const r = ridingById[saved.riding];
    const lines = r
      ? inRiding(r.id).map((c) => `<li class="ps-line ${saved.pick === c.id ? "marked" : ""}"><span class="ps-oval" aria-hidden="true"></span><span class="ps-name">${esc(c.name)}</span><span class="ps-party">${esc(partyName(c))}</span></li>`).join("")
      : `<li class="ps-line"><span class="ps-oval" aria-hidden="true"></span><span class="ps-blank"></span></li>`;
    $("#print-sheet").innerHTML = `
      <header class="ps-head">
        <div><p class="ps-kicker">Maple Ridge Ballot Guide · B.C. provincial election</p><h1>My vote plan</h1><p class="ps-note">A personal reminder. This is not an official ballot.</p></div>
        <p class="ps-when"><strong>Final Voting Day: Saturday, October 24, 2026</strong>${V.hours ? `<br>${esc(V.hours)}` : ""}</p>
      </header>
      <section class="ps-race"><h2>${r ? esc(r.name) : "My riding: ____________________"}<span>Vote for 1</span></h2><ol>${lines}</ol></section>
      <section class="ps-foot">
        <div><dl class="ps-plan">
          <dt>When</dt><dd>${esc(whenLabel(saved.when) || "____________________")}</dd>
          <dt>Where</dt><dd>${r?.advance?.length ? `Advance voting in ${esc(r.name)}: ${r.advance.map(([n, a, d]) => `${esc(n)}, ${esc(a)} (${esc(d)})`).join("; ")}. ` : ""}On October 24, your assigned voting place is on your Where to Vote card. ${V.whereToVoteUrl ? `Look up voting places: ${esc(V.whereToVoteUrl)}` : ""}</dd>
          ${r?.office ? `<dt>District electoral office</dt><dd>${esc(r.office.address)} · ${esc(r.office.phone)}</dd>` : ""}
        </dl></div>
        <div><h3>Bring</h3>${V.id?.length ? `<ul>${V.id.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
        ${V.phone ? `<h3>Questions</h3><p>Elections BC: ${esc(V.phone)}</p>` : ""}</div>
      </section>
      <p class="ps-fine">Printed ${esc(today)} from an independent voter guide. Not affiliated with Elections BC, any party or candidate.${G.lastChecked ? ` Candidate details last checked ${esc(G.lastChecked)}.` : ""}</p>`;
  }

  // ── ABOUT ──
  function renderAbout() {
    const R = G.review || {};
    const statusLabel = { pending: "Not yet fact-checked", "ai-checked": "AI-checked, human review pending", done: "Reviewed" }[R.status] || "Not yet fact-checked";
    const defs = [
      ["supports", "The candidate has said they back it."],
      ["opposes", "The candidate has said they are against it."],
      ["mixed", "The candidate raised concerns or supports only part of it."],
      ["priority", "The candidate names this as a priority. Used for broad issues like housing, where there's no yes-or-no question."],
      ["none", "We found nothing in our sources. This does not mean the candidate has no view."],
    ];
    const profiles = G.candidates.filter((c) => c.profile);
    $("#view-about").innerHTML = `
      <div class="section-head">
        <h2>How this guide was made</h2>
        <p class="prose">Where every piece of information came from, who and what produced the summaries, how each label was chosen, and what we haven't checked. If anything here conflicts with Elections BC, Elections BC is correct.</p>
      </div>

      <div class="status-banner" role="status">
        <span class="badge inc">${esc(statusLabel)}</span>
        <div class="stack" style="gap:.35rem">
          ${R.aiDraft ? `<p>${esc(R.aiDraft)}</p>` : ""}
          ${R.aiCheck ? `<p>${esc(R.aiCheck)}</p>` : ""}
          <p><strong>Human review:</strong> ${esc(R.human || "Not yet reviewed by a person.")}</p>
          ${G.lastChecked ? `<p class="muted" style="font-size:.9rem">Information last checked ${esc(G.lastChecked)}.</p>` : ""}
        </div>
      </div>

      <div class="panel prose method">
        <h3>How the information was gathered</h3>
        <ol>
          <li><strong>Candidate list.</strong> Every name on Elections BC's official candidate list (October 14, 2026) for the ${G.ridings.length} ridings this guide covers: ${G.candidates.length} candidates in all.</li>
          <li><strong>Which ridings.</strong> Maple Ridge's two ridings, plus the three that a road crosses into from Maple Ridge or Pitt Meadows. We worked this out from DataBC's official boundaries.</li>
          <li><strong>Voting information.</strong> Elections BC's pages on dates, eligibility, ID, ways to vote, time off work and accessibility, and its lists of advance voting places and district electoral offices.</li>
          <li><strong>Party platforms.</strong> Each party's own platform document or announcements, read on October 15. Parties keep announcing during a campaign, so later commitments may be missing.</li>
          <li><strong>Candidates.</strong> Each candidate's page on their party's website, and local news coverage: Maple Ridge News, the Langley Advance Times, the Mission City Record and Victoria News.</li>
          <li><strong>2024 results.</strong> Elections BC's Statement of Votes for the 2024 election, which used the same boundaries.</li>
          <li><strong>AI-assisted drafting.</strong> An AI assistant (Claude, by Anthropic) read the text of each source page and drafted the summaries. Every position links back to its source so you can check the wording.</li>
          <li><strong>Fact-check.</strong> ${esc(R.aiCheck || "Not yet done.")}</li>
          <li><strong>Human review.</strong> ${esc(R.human || "Not yet reviewed by a person.")}</li>
        </ol>
      </div>

      <div class="panel prose method">
        <h3>What each part of the guide means</h3>
        <dl class="deflist">
          <dt>Find your riding</dt>
          <dd>Your address goes to the B.C. government's Address Geocoder, which returns a point on the map. The guide checks that point against DataBC's official riding boundaries, and flags addresses within 150 metres of a boundary. Elections BC says boundary files shouldn't be the final word on a voter's riding, so confirm with Elections BC's Where to Vote. Your address isn't stored by this site or on your device.</dd>
          <dt>Riding descriptions</dt>
          <dd>The neighbourhoods named for each riding come from checking well-known addresses against the official boundaries (and, for Langley-Walnut Grove, the Langley Advance Times). Use Find your riding for your own address.</dd>
          <dt>Background and priority tags</dt>
          <dd>A short paraphrase of the candidate's party page or news coverage, and short tags. <strong>We wrote these; they aren't quotes.</strong></dd>
          <dt>Candidate positions</dt>
          <dd>A one- or two-sentence summary of what the candidate has said publicly on each issue, with a link to the source. Text in quotation marks is meant to be their exact words as reported by the source.
            <table class="def-table"><tbody>${defs.map(([s2, d]) => `<tr><td>${pill(s2)}</td><td>${esc(d)}</td></tr>`).join("")}</tbody></table>
          </dd>
          <dt>Party platforms</dt>
          <dd>Short summaries of each party's own commitments, in our words except where quoted. "Nothing on this in the platform we reviewed" means we didn't find it, not that the party has no view.</dd>
          <dt>Key questions</dt>
          <dd>Six questions where the parties' platforms take clear, different positions. We chose them. <strong>Yes</strong> or <strong>No</strong> means the party has said so; <strong>Partly</strong> means a qualified or different position, explained when you select it; <strong>Not addressed</strong> means we found nothing.</dd>
          <dt>Incumbent MLA</dt>
          <dd>The candidate who won the riding in 2024 and is running again there. Abbotsford-Mission has no incumbent running.</dd>
          <dt>2024 results</dt>
          <dd>Elections BC's final results. They're context, not a prediction. This guide doesn't publish polls or seat projections.</dd>
        </dl>
      </div>

      <div class="grid-2">
        <div class="panel prose method">
          <h3>Known gaps and judgment calls</h3>
          <ul>
            <li><strong>Other neighbouring ridings.</strong> Six more ridings touch Maple Ridge's two only across the Fraser or Pitt rivers or through mountains and parks: Coquitlam-Burke Mountain, Surrey-Guildford, Langley-Abbotsford, Abbotsford West, Fraser-Nicola and West Vancouver-Sea to Sky. They aren't covered.</li>
            <li><strong>Chris Hatchwell</strong> (Independent, Maple Ridge East): we found no website or public statements.</li>
            <li><strong>Candidate positions are thin.</strong> Most candidates have only a party profile and one news story. We haven't reviewed social media, and we haven't watched all-candidates debates.</li>
            <li><strong>Port Coquitlam</strong> coverage relies on party pages; we couldn't read the Tri-Cities Dispatch's candidate profiles.</li>
            <li><strong>Platforms keep changing.</strong> The NDP says it will keep adding to its plan page, and the Conservatives publish announcements one at a time. We found no costing document on the Conservative plan page as of October 15.</li>
            <li><strong>Lee-Ann Bates</strong> (Port Coquitlam) is on the ballot with no affiliation; OneBC's website lists her as an endorsed candidate.</li>
            <li><strong>Issues and key questions were chosen by us.</strong> They may not be the ones that matter most to you.</li>
            <li><strong>How the election works</strong> on the Start page is a general summary, not taken from a cited source.</li>
          </ul>
        </div>
        <div class="panel prose method">
          <h3>What this site doesn't do</h3>
          <ul>
            <li><strong>No endorsements, rankings, polls or predictions.</strong> Candidates are listed alphabetically by surname; parties alphabetically by ballot name.</li>
            <li><strong>No party colours, logos or photos.</strong> Every candidate gets the same initials marker.</li>
            <li><strong>No affiliation.</strong> This site isn't connected to Elections BC, the Government of B.C., any party or candidate.</li>
            <li><strong>Visit counts only.</strong> Vercel Web Analytics counts page visits without cookies. Your vote plan is saved only on your device and never sent anywhere.</li>
            <li><strong>Find your riding</strong> sends the address you type to the B.C. government's Address Geocoder, through this site's server. Neither stores it.</li>
            <li><strong>AI assistant.</strong> "Ask the guide" sends your questions to Anthropic's Claude through Vercel AI Gateway, along with this guide's content. It's told not to recommend candidates or parties. Answers can be wrong; check the sources it links.</li>
          </ul>
          ${G.maintainer ? `<p><strong>Published by:</strong> ${esc(G.maintainer)}. <a href="#feedback">Send feedback or report an error</a>.</p>` : ""}
        </div>
      </div>

      <div class="panel prose method" id="disclaimer">
        <h3>Disclaimer</h3>
        <p>This guide is an independent project provided for general information only. We've worked to make it accurate and fair, and every summary links to its source, but it may contain errors or be out of date. It is provided "as is", without warranties of any kind, and Russell Morton is not liable for any loss or damage arising from its use or from reliance on it. It is not an official election publication and is not legal advice. Links to other websites are provided for convenience; we aren't responsible for their content. Answers from the "Ask the guide" assistant are generated by AI and may be inaccurate or incomplete.</p>
        <p><strong>Candidates and parties:</strong> if anything about you is wrong or missing, tell us through the <a href="#feedback">feedback form</a> and we'll check it and correct it promptly.</p>
      </div>

      <div class="panel method">
        <h3>Sources and what we used from each</h3>
        <div class="scroll-x"><table>
          <thead><tr><th>Source</th><th>Used for</th></tr></thead>
          <tbody>${Object.values(G.sources).map((s2) => `<tr><td style="min-width:14rem">${s2.url ? `<a href="${esc(s2.url)}" target="_blank" rel="noopener">${esc(s2.title)}</a>` : esc(s2.title)}<br><span class="muted" style="font-size:.85rem">${esc(s2.publisher)}${s2.date ? ", " + esc(s2.date) : ""}</span></td><td style="min-width:16rem">${esc(s2.usedFor || "")}</td></tr>`).join("")}
          <tr><td style="min-width:14rem">Candidates' party pages<br><span class="muted" style="font-size:.85rem">${profiles.map((c) => `<a href="${esc(c.profile.url)}" target="_blank" rel="noopener">${esc(c.name)}</a>`).join(", ")}</span></td><td>Backgrounds, priority tags and some positions. Each is linked from the candidate's entry.</td></tr></tbody>
        </table></div>
        <p class="muted" style="font-size:.88rem">All sources were accessed on ${esc(G.lastChecked)}.</p>
      </div>

      ${G.changes?.length ? `<div class="panel method"><h3>Change log</h3><ul class="changelog">${G.changes.slice().reverse().map((c) => `<li><span class="mono muted">${esc(c.date)}</span> ${esc(c.text)}</li>`).join("")}</ul></div>` : ""}`;
  }

  // ── FEEDBACK ──
  function renderFeedback() {
    $("#view-feedback").innerHTML = `
      <div class="section-head">
        <h2>Send feedback</h2>
        <p class="prose">Spotted a mistake, or something missing? Tell us and we'll check it against the sources and fix it. Corrections are listed on the <a href="#about">About page</a>.</p>
      </div>
      <form class="fb-form" id="fb-form" novalidate>
        <div class="field">
          <label for="fb-topic">What's this about?</label>
          <select id="fb-topic" name="topic">
            <option value="candidate">A candidate's information</option>
            <option value="party">A party's platform</option>
            <option value="riding">Finding my riding</option>
            <option value="voting">Voting information</option>
            <option value="site">Something on the site isn't working</option>
            <option value="other">Other feedback</option>
          </select>
        </div>
        <div class="field" id="fb-cand-field">
          <label for="fb-candidate">Which candidate?</label>
          <select id="fb-candidate" name="candidate">
            <option value="">Choose a candidate</option>
            ${G.ridings.map((r) => `<optgroup label="${esc(r.name)}">${inRiding(r.id).map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join("")}</optgroup>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="fb-message">Your message</label>
          <span class="hint" id="fb-message-hint">If something is wrong, say what it should be and where you saw the correct information. Please don't include your home address.</span>
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
        const r = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, guide: "provincial", startedAt }) });
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
    const adv = advanceToday() ? `<span class="adv">Advance voting is open today</span>` : "";
    let html;
    if (d > 1) html = `<b>${d}</b><span class="cd-text"><strong>days until voting day</strong>${adv || `<span>Saturday, Oct 24</span>`}</span>`;
    else if (d === 1) html = `<b class="word">Tmrw</b><span class="cd-text"><strong>Voting day is tomorrow</strong><span>Saturday, Oct 24</span></span>`;
    else if (d === 0 && pollsOpen()) html = `<b class="word">Today</b><span class="cd-text"><strong>Polls are open</strong><span>Until 8 pm</span></span>`;
    else html = `<span class="cd-text closed">Voting has closed. Results will be posted by <a href="https://elections.bc.ca/" target="_blank" rel="noopener">Elections BC</a>.</span>`;
    $("#countdown").innerHTML = html;
    const badge = $("#plan-count");
    badge.hidden = !saved.pick;
    badge.textContent = saved.pick ? "1" : "";
    $("#checked").textContent = G.lastChecked ? `Information last checked ${G.lastChecked}.` : "";
    $("#official").innerHTML = `Official election information: <a href="https://elections.bc.ca/" target="_blank" rel="noopener">elections.bc.ca</a>${V.phone ? ` · ${esc(V.phone)}` : ""}`;
  }

  function renderAll() {
    renderChrome();
    renderStart();
    renderRidings();
    renderCandidates();
    renderParties();
    renderCompare();
    renderPlan();
    renderPrintSheet();
    renderAbout();
    if (dialog.open && dialog.dataset.cid) openCandidate(dialog.dataset.cid);
  }

  // ── Routing ──
  const VIEWS = ["start", "ridings", "candidates", "parties", "compare", "plan", "about", "feedback"];
  let current = null;
  function route() {
    let h = location.hash.slice(1);
    let open = null, scrollTo = null;
    if (h.startsWith("c-") && byId[h.slice(2)]) { open = h.slice(2); h = "candidates"; }
    if (h.startsWith("r-") && ridingById[h.slice(2)]) { scrollTo = h; h = "ridings"; }
    if (!VIEWS.includes(h)) h = "start";
    for (const v of VIEWS) $(`#view-${v}`).hidden = v !== h;
    document.body.dataset.view = h;
    document.querySelectorAll(".tabs a").forEach((a) => { if (a.getAttribute("href") === "#" + h) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
    const nav = $(".tabs"), cur = $(".tabs a[aria-current]");
    if (nav && cur && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: cur.offsetLeft - (nav.clientWidth - cur.offsetWidth) / 2, behavior: current ? "smooth" : "auto" });
    if (scrollTo) document.getElementById(scrollTo)?.scrollIntoView({ block: "start" });
    else if (current !== h) window.scrollTo({ top: 0 });
    current = h;
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
    if (d.pick) { togglePick(d.pick); return; }
    if (d.open) { openCandidate(d.open); return; }
    if (d.setRiding) { setRiding(d.setRiding); ui.candRiding = d.setRiding; renderAll(); return; }
    if (d.compareRiding) { ui.compareRiding = d.compareRiding; ui.cell = null; renderCompare(); return; }
    if (d.partyIssue) {
      if (d.issueId) ui.issue = d.issueId;
      renderParties();
      if (location.hash !== "#parties") location.hash = "parties";
      setTimeout(() => document.getElementById("platforms")?.scrollIntoView({ block: "start" }), 0);
      return;
    }
    if (d.issue) { ui.issue = d.issue; renderParties(); return; }
    if ("focusFinder" in d) { setTimeout(() => $("#addr")?.focus(), 0); return; }
    if ("resetFilters" in d) { ui.candRiding = "all"; ui.party = "all"; ui.search = ""; $("#cand-search").value = ""; renderCandidates(); return; }
    if (d.qcell) {
      const [pp, q] = d.qcell.split("|");
      ui.qcell = ui.qcell && ui.qcell.p === pp && ui.qcell.q === q ? null : { p: pp, q };
      renderParties();
      return;
    }
    if (d.cell) {
      const [c, k] = d.cell.split("|");
      ui.cell = ui.cell && ui.cell.c === c && ui.cell.k === k ? null : { c, k };
      renderCompare();
      return;
    }
    if (d.when !== undefined) { saved.when = saved.when === d.when ? "" : d.when; persist(); renderPlan(); renderPrintSheet(); return; }
    if ("print" in d) { renderPrintSheet(); window.print(); return; }
    if (d.clear) {
      if (d.clear === "ask") ui.confirmClear = true;
      else { if (d.clear === "yes") { saved = blank(); ui.lookup = null; } persist(); ui.confirmClear = false; }
      renderAll();
    }
  });
  document.addEventListener("submit", (e) => {
    if (e.target.id !== "finder-form") return;
    e.preventDefault();
    const address = $("#addr").value.trim();
    if (address.length < 5) {
      ui.lookup = { status: "not-found" };
      $("#finder-result").innerHTML = finderResult();
      $("#addr").focus();
      return;
    }
    lookup(address);
  });
  window.addEventListener("hashchange", route);

  renderAll();
  renderFeedback();
  route();
})();
