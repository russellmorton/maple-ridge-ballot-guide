// B.C. provincial election, October 24, 2026: all content for the provincial guide.
// Every position must point at a source key. If no source exists, use stance "none".
// Candidate stances: supports | opposes | mixed | priority | none
// Party platforms: `points` (short commitments) per issue, each with a source.
//
// DRAFT: research in progress. Nothing below has been checked against the
// original pages yet; don't publish until review.status is "ai-checked".

window.GUIDE = {
  lastChecked: null,

  review: {
    status: "pending", // pending | ai-checked | done
    aiDraft: "",
    aiCheck: "",
    human: "Not yet reviewed by a person.",
  },
  maintainer: "Russell Morton",
  changes: [],

  electionDay: "2026-10-24T08:00:00-07:00",
  pollsClose: "2026-10-24T20:00:00-07:00",
  advanceDates: ["2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20", "2026-10-21"],

  // How the election works and how to vote. Filled from Elections BC.
  voting: {
    hours: null,           // e.g. "Advance voting and General Voting Day: 8 am to 8 pm."
    mailText: null,        // how and by when to ask for and return a mail ballot
    workTime: null,        // time off work to vote
    eligibility: [],       // list items
    id: [],                // what to bring, list items
    where: null,           // where you can vote
    phone: null,           // Elections BC phone
    whereToVoteUrl: null,  // Elections BC's own riding and voting-place lookup
    source: "electionsBC",
  },

  context: {
    seats: 93,
    majority: 47,
    why: null,             // neutral account of why the election is early, with sources
    standings: [],         // [{ party, seats }] at dissolution
    source: null,
  },

  sources: {
    electionsBC: {
      title: "2026 Provincial Election",
      publisher: "Elections BC",
      url: "https://elections.bc.ca/2026-provincial-election/",
      usedFor: "Election dates, voting rules and the official candidate list.",
    },
  },

  // Issues used for both party platforms and local candidates.
  issues: [
    { id: "afford", label: "Cost of living", short: "Costs", question: "Help with everyday costs such as groceries, gas, hydro, insurance and child care." },
    { id: "housing", label: "Housing", short: "Housing", question: "Building homes, rents and home prices." },
    { id: "health", label: "Health care", short: "Health", question: "Family doctors, emergency rooms, surgery waits and hospitals, including Ridge Meadows Hospital." },
    { id: "safety", label: "Public safety, addictions & mental health", short: "Safety", question: "Crime, drug policy, involuntary care and homelessness." },
    { id: "economy", label: "Economy, jobs & resources", short: "Economy", question: "Jobs, resource projects, U.S. tariffs and business costs." },
    { id: "taxes", label: "Taxes, deficit & spending", short: "Taxes", question: "Tax changes, the provincial deficit and debt." },
    { id: "education", label: "Schools & education", short: "Schools", question: "New schools, class sizes and space in SD42." },
    { id: "transport", label: "Roads & transit", short: "Transport", question: "Lougheed Highway, the Haney Bypass, buses, SkyTrain and the West Coast Express." },
    { id: "climate", label: "Climate & energy", short: "Climate", question: "Emissions targets, carbon pricing, BC Hydro and energy projects." },
    { id: "reconciliation", label: "Reconciliation & land rights", short: "Reconciliation", question: "DRIPA, Aboriginal title and agreements with First Nations." },
  ],

  // Yes-or-no questions where parties have taken clear positions. Optional.
  questions: [],

  // Parties with candidates in the ridings this guide covers, in ballot-name order.
  parties: [
    { id: "ndp", name: "BC NDP", leader: null, website: null, platform: null, positions: {}, answers: {} },
    { id: "con", name: "Conservative Party of B.C.", leader: null, website: null, platform: null, positions: {}, answers: {} },
    { id: "green", name: "BC Greens", leader: null, website: null, platform: null, positions: {}, answers: {} },
    { id: "onebc", name: "OneBC", leader: null, website: null, platform: null, positions: {}, answers: {} },
    { id: "centrebc", name: "CentreBC", leader: null, website: null, platform: null, positions: {}, answers: {} },
  ],

  // Maple Ridge's two ridings first (home: true), then the ridings next door.
  ridings: [
    { id: "mrpm", name: "Maple Ridge-Pitt Meadows", home: true, area: null, incumbent: "beare", result2024: null },
    { id: "mre", name: "Maple Ridge East", home: true, area: null, incumbent: "mok", result2024: null },
  ],

  // Alphabetical by surname within each riding, as on the ballot.
  candidates: [
    // ───────────── MAPLE RIDGE-PITT MEADOWS ─────────────
    { id: "beare", name: "Lisa Beare", riding: "mrpm", party: "ndp", incumbent: true, background: "", priorities: [], links: {}, positions: {} },
    { id: "einarsson", name: "Susan Einarsson", riding: "mrpm", party: "onebc", incumbent: false, background: "", priorities: [], links: {}, positions: {} },
    { id: "morneau", name: "Doug Morneau", riding: "mrpm", party: "con", incumbent: false, background: "", priorities: [], links: {}, positions: {} },
    { id: "simmons", name: "Jordan Simmons", riding: "mrpm", party: "centrebc", incumbent: false, background: "", priorities: [], links: {}, positions: {} },

    // ───────────── MAPLE RIDGE EAST ─────────────
    { id: "campbell", name: "Hudson Campbell", riding: "mre", party: "ndp", incumbent: false, background: "", priorities: [], links: {}, positions: {} },
    { id: "hatchwell", name: "Chris Hatchwell", riding: "mre", party: null, incumbent: false, background: "", priorities: [], links: {}, positions: {} },
    { id: "kite", name: "Daniel Kite", riding: "mre", party: "green", incumbent: false, background: "", priorities: [], links: {}, positions: {} },
    { id: "mok", name: "Lawrence Mok", riding: "mre", party: "con", incumbent: true, background: "", priorities: [], links: {}, positions: {} },
  ],
};
