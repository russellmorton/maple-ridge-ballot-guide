// Content checks: every reference in each guide's data.js points at something
// that exists, so a typo can't silently drop a source or a candidate.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const load = (file) => {
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), sandbox);
  return sandbox.window.GUIDE;
};
const STANCES = new Set(["supports", "opposes", "mixed", "priority", "none"]);
const keys = (k) => (Array.isArray(k) ? k : k ? [k] : []);

test("municipal: sources, stances and races resolve", () => {
  const G = load("municipal/data.js");
  const issues = new Set(G.issues.map((i) => i.id));
  for (const c of G.candidates) {
    assert.ok(G.races[c.race], `${c.id}: race ${c.race}`);
    for (const [k, p] of Object.entries(c.positions || {})) {
      assert.ok(issues.has(k), `${c.id}: issue ${k}`);
      assert.ok(STANCES.has(p.stance), `${c.id}.${k}: stance ${p.stance}`);
      for (const s of keys(p.source)) assert.ok(G.sources[s], `${c.id}.${k}: source ${s}`);
    }
  }
});

test("provincial: ridings, parties, positions and sources resolve", () => {
  const G = load("provincial/data.js");
  const ids = new Set();
  const ridings = new Set(G.ridings.map((r) => r.id));
  const parties = new Set(G.parties.map((p) => p.id));
  const issues = new Set(G.issues.map((i) => i.id));
  const questions = new Set((G.questions || []).map((q) => q.id));
  const src = (where, k, c) => {
    for (const s of keys(k)) {
      // "profile" is the candidate's own party page.
      if (s === "profile") assert.ok(c?.profile?.url, `${where}: source "profile" but no profile url`);
      else assert.ok(G.sources[s], `${where}: source ${s}`);
    }
  };

  for (const c of G.candidates) {
    assert.ok(!ids.has(c.id), `duplicate candidate id ${c.id}`);
    ids.add(c.id);
    assert.ok(ridings.has(c.riding), `${c.id}: riding ${c.riding}`);
    assert.ok(c.party === null || parties.has(c.party), `${c.id}: party ${c.party}`);
    assert.ok(!c.background || c.backgroundSource, `${c.id}: background needs a source`);
    src(`${c.id} background`, c.backgroundSource, c);
    for (const [k, p] of Object.entries(c.positions || {})) {
      assert.ok(issues.has(k), `${c.id}: issue ${k}`);
      assert.ok(STANCES.has(p.stance), `${c.id}.${k}: stance ${p.stance}`);
      assert.ok(p.stance === "none" || p.text, `${c.id}.${k}: a stance needs text`);
      assert.ok(!p.text || p.source, `${c.id}.${k}: text needs a source`);
      src(`${c.id}.${k}`, p.source, c);
    }
  }
  for (const r of G.ridings) {
    const here = G.candidates.filter((c) => c.riding === r.id);
    assert.ok(here.length, `${r.id}: no candidates`);
    if (r.incumbent) assert.ok(here.some((c) => c.id === r.incumbent && c.incumbent), `${r.id}: incumbent ${r.incumbent} should be a candidate here marked incumbent`);
    for (const row of r.result2024?.rows || []) {
      assert.ok(Number.isFinite(row.votes) && Number.isFinite(row.pct), `${r.id}: 2024 row ${row.name}`);
    }
    src(`${r.id} 2024`, r.result2024?.source);
    src(`${r.id} note`, r.noteSource);
    src(`${r.id} area`, r.areaSource);
  }
  for (const p of G.parties) {
    src(`${p.id} summary`, p.summarySource);
    for (const [k, pos] of Object.entries(p.positions || {})) {
      assert.ok(issues.has(k), `${p.id}: issue ${k}`);
      assert.ok(Array.isArray(pos.points), `${p.id}.${k}: points`);
      assert.ok(!pos.points.length || pos.source, `${p.id}.${k}: points need a source`);
      src(`${p.id}.${k}`, pos.source);
    }
    for (const [k, a] of Object.entries(p.answers || {})) {
      assert.ok(questions.has(k), `${p.id}: question ${k}`);
      assert.ok(STANCES.has(a.stance), `${p.id}.${k}: stance`);
      src(`${p.id}.${k}`, a.source);
    }
  }
  src("voting", G.voting?.source);
  src("context", G.context?.source);
  assert.deepEqual([...G.advanceDates].sort(), [...G.advanceDates], "advance dates in order");
  assert.ok(G.advanceDates.every((d) => d < G.electionDay.slice(0, 10)), "advance voting before voting day");
});

// The archive's official results: every candidate has a total, the declared
// winners are the top vote-getters, and every source resolves.
test("municipal: official results match the candidates", () => {
  const G = load("municipal/data.js");
  const R = G.results;
  assert.ok(R, "results");
  assert.ok(G.sources[R.source] && G.sources[R.turnoutSource], "results sources");
  for (const c of G.candidates) assert.ok(Number.isInteger(R.votes[c.id]), `${c.id}: votes`);
  assert.equal(Object.keys(R.votes).length, G.candidates.length, "no votes for unknown candidates");
  for (const [race, meta] of Object.entries(G.races)) {
    const top = G.candidates.filter((c) => c.race === race).sort((a, b) => R.votes[b.id] - R.votes[a.id]).slice(0, meta.seats).map((c) => c.id);
    assert.deepEqual([...R.elected[race]], [...top], `${race}: elected are the top ${meta.seats}`);
  }
  for (const q of G.ballotQuestions) {
    const r = R.questions[q.id];
    assert.ok(Number.isInteger(r?.yes) && Number.isInteger(r?.no), `${q.id}: yes and no`);
  }
});

test("provincial: final results match the candidates", () => {
  const G = load("provincial/data.js");
  const parties = new Set(G.parties.map((p) => p.id));
  assert.ok(G.sources[G.outcome.source], "outcome source");
  assert.equal(Object.values(G.outcome.seats).reduce((a, b) => a + b, 0), G.context.seats, "seats add up");
  for (const id of Object.keys(G.outcome.seats)) assert.ok(parties.has(id), `outcome party ${id}`);
  for (const r of G.ridings) {
    const res = r.result2026;
    assert.ok(res && G.sources[res.source], `${r.id}: 2026 result and source`);
    const here = G.candidates.filter((c) => c.riding === r.id);
    for (const c of here) assert.ok(Number.isInteger(res.votes[c.id]), `${r.id}: votes for ${c.id}`);
    assert.equal(Object.keys(res.votes).length, here.length, `${r.id}: no votes for candidates elsewhere`);
    const top = here.slice().sort((a, b) => res.votes[b.id] - res.votes[a.id])[0];
    assert.equal(res.elected, top.id, `${r.id}: elected is the top vote-getter`);
  }
});
