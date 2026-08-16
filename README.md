# Tomer Klein — portfolio

A single-page developer portfolio built on the **Broadsheet** design system —
newsprint Source Serif 4 on paper white with a cyan spot accent. It renders
**complete, populated HTML on first paint**: repos, posts and counters are baked
in at build time from a committed `data.json`, so there are no client-side
fetches, no "Loading…" placeholders and no zeroed counters.

Deployed as a static site on **Cloudflare Pages**.

## Screenshots

### Desktop
![Desktop](assets/screenshots/desktop.png)

### Mobile
![Mobile](assets/screenshots/mobile.png)

## How it works

Everything is static. Two small Node scripts turn live data into a committed,
fully-rendered page; a scheduled GitHub Action keeps it fresh.

```
featured.json ─┐
               ├─▶ scripts/build-data.mjs ─▶ data.json ─▶ scripts/build-html.mjs ─▶ index.html
GitHub + Medium┘        (fetch & merge)                        (render template)
```

- **`scripts/build-data.mjs`** — fetches from the GitHub REST API (public repos,
  followers, total stars, per-repo stars/dates), the public GitHub contributions
  calendar (weekly counts + yearly total — parsed from HTML, **no token needed**)
  and the Medium RSS feed (recent posts, reading time). It merges the
  hand-maintained `featured.json` and writes `data.json`. On any fetch failure it
  keeps the previous value, and it only rewrites when something other than the
  timestamp changed.
- **`scripts/build-html.mjs`** — renders `templates/index.html` (which has
  `<!-- markers -->` for the dynamic regions) with `data.json` into the committed
  `index.html`.
- **`.github/workflows/data.yml`** — runs both scripts daily (and on manual
  dispatch), committing `data.json` + `index.html` when they change.

`data.json` and `index.html` are committed build artifacts. `featured.json` is
hand-edited and never overwritten by the pipeline.

## Project structure

```
.
├── index.html                 # generated — the served page (do not hand-edit)
├── templates/index.html       # source template with <!-- markers -->
├── data.json                  # generated — build-time data (committed)
├── featured.json              # hand-maintained: featured repos + blurbs
├── css/broadsheet.css         # Broadsheet tokens, base type, layout
├── assets/
│   ├── fonts/                 # self-hosted Source Serif 4 (woff2)
│   ├── portrait.jpg           # self-hosted portrait (no cross-origin avatar)
│   └── screenshots/
├── scripts/
│   ├── build-data.mjs         # fetch + merge → data.json
│   └── build-html.mjs         # template + data → index.html
└── .github/workflows/data.yml # daily refresh
```

## Build & run locally

Requires Node 18+ (for built-in `fetch`). No dependencies, no framework.

```bash
# 1. Refresh data (optional — data.json is committed)
node scripts/build-data.mjs

# 2. Render the page
node scripts/build-html.mjs

# 3. Serve it
python3 -m http.server 8000
# open http://127.0.0.1:8000/
```

The page is plain static HTML/CSS — opening `index.html` directly works too.

## Customising

| Want to change | Edit |
| --- | --- |
| Featured repos and their one-line descriptions | `featured.json` (then re-run both scripts) |
| Colors, type scale, spacing | the token block at the top of `css/broadsheet.css` |
| Copy (hero, section titles, stack lists, contact) | `templates/index.html`, then `node scripts/build-html.mjs` |
| Portrait | replace `assets/portrait.jpg` (4:5 crop is applied via CSS) |

## Deployment (Cloudflare Pages)

1. Connect the repo in **Workers & Pages → Pages**.
2. Build command: `node scripts/build-html.mjs` (or none — `index.html` is
   committed). Output directory: `/` (root).
3. Every push publishes; the daily Action refreshes the data and page.

## Design

Built to the **Broadsheet** handoff spec: serif-only, whitespace-separated
sections (the repo card is the only boxed component), one cyan interactive
accent, self-hosted subsetted fonts with `font-display: swap`, a visible
`:focus-visible` ring, 44px minimum hit areas, and `prefers-reduced-motion`
support. No CSS framework, no icon font, no animation library.
