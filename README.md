# Maple Ridge Ballot Guide

An independent, non-partisan guide to the **October 17, 2026** Maple Ridge general local election: every declared candidate for mayor, council and SD42 school trustee, the three recreation borrowing questions, and issue-by-issue comparisons. Every position links to its source.

Not affiliated with the City of Maple Ridge, School District 42, any candidate or any elector organization.

## Structure

Static site, no build step.

| File | What it holds |
| --- | --- |
| `index.html` | Page shell and all styles (light and dark themes) |
| `data.js` | **All content**: candidates, positions, sources, ballot questions, voting info |
| `app.js` | Rendering, filters, comparison grid, "My ballot" (saved in the visitor's browser only) |
| `vercel.json` | Clean URLs and security headers |

## Editing content

Everything voters read lives in `data.js`. To correct a candidate's position, edit their `positions` entry:

```js
rec: { stance: "opposes", text: "What they said…", source: "mrnCouncilForum" },
```

- `stance` is one of `supports`, `opposes`, `mixed`, `priority`, `none`.
- `source` must be a key in `sources`. If there's no source, use `stance: "none"` and leave out `text`.
- When a candidate sends their position directly, quote it word for word with `source: "candidate"` (shown as "Sent to us by the candidate", with no link).
- Update `lastChecked` at the top of the file when you re-verify.

## Run locally

```sh
npx serve .
```

## Deploy

Live at **https://vote-maple-ridge.vercel.app**. The Vercel project is connected to this repo:

- Every pull request gets its own preview deployment (linked on the PR).
- Merging into `main` deploys to production. `main` only accepts changes through pull requests.

Add a `changes` entry in `data.js` for every content correction before deploying.
