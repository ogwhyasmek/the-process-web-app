# The Process

A personal, single-user day-trading web app: pre-trade discipline, trade
logging, performance analytics, and stock/options research. Local only — no
accounts, no cloud, and no market-data API key ever reaches the browser.

> Every research and verdict feature in this app is a screening aid, not
> investment advice.

## What's in this folder

```
├── client/    the web app (Vite + React + TypeScript)
├── server/    the local market-data proxy (Node + Express) — holds the API key,
│              owns caching (~24h fundamentals) and throttling (~1 req/sec)
├── backups/   created on demand — timestamped JSON snapshots of your data
└── prototypes and refrence material/   earlier prototypes (reference only)
```

## Requirements

None — a Node.js runtime is bundled inside the project at `.tools/node`, so
nothing needs to be installed on the system. (If you ever install Node
system-wide, plain `npm run dev` works too.)

## First-time setup

1. Install dependencies (installs for the root, `server/`, and `client/`):

   ```sh
   ./setup.sh
   ```

2. Give the proxy your market-data key:

   ```sh
   cp server/.env.example server/.env
   ```

   Open `server/.env` and paste your finnhub.io API key after
   `FINNHUB_API_KEY=`. The free tier works — the proxy throttles itself to
   stay inside its 60 requests/minute limit.

   Without a key the app still runs; live-data features show clearly-labeled
   demo data instead.

## Run it

```sh
./run.sh
```

Then open **http://localhost:4610**.

That one command starts both halves: the proxy on `127.0.0.1:4600` and the
app on `localhost:4610` (the app forwards all `/api` calls to the proxy).

## Deploying (frontend on Cloudflare, proxy on Render/Fly/Railway)

This app was built to run locally, but it can be split across two hosts:
the static frontend on Cloudflare, and the proxy (which holds your API key)
on any Node host — Render, Fly.io, and Railway all have free tiers.

**1. Deploy `server/` to Render (or similar):**

- New Web Service → connect this repo → set **Root Directory** to `server`
- Build command: `npm install`
- Start command: `npm start`
- Environment variables:
  - `FINNHUB_API_KEY` — your key
  - `ALLOWED_ORIGINS` — your Cloudflare site's URL (e.g.
    `https://the-process.example.workers.dev`); comma-separate if you have
    more than one (e.g. a custom domain too)
- Once deployed, note the URL Render gives you
  (e.g. `https://the-process-server.onrender.com`)

**2. Point the frontend at it:** in Cloudflare's dashboard, under
**Settings → Build → Environment variables**, add:

- `VITE_API_BASE_URL` = the Render URL from step 1

This is read at build time, so redeploy (push a commit, or retrigger the
build) after setting it.

Note: Render's free tier spins down after inactivity, so the first request
after idle time can take 30–60s to wake it back up. Also, the
snapshot-to-disk backup feature writes to this project's local
`backups/` folder — that only makes sense when running locally; on a
hosted proxy the filesystem isn't persistent across deploys, so rely on
the in-browser JSON export instead.

## What's inside

- **Trade Cockpit** — the 7-rule pre-trade checklist (with printable version
  and a cooling-off timer after losses), Position Sizer, Options Contract
  Ticket, Greeks Lab (Black-Scholes + payoff diagram), Volatility Read, an
  earnings calendar for the watchlist, and the four account-killer cards.
- **Daily Guardrail** — today's circuit breaker: log results in R, and the
  page stands you down when your trade cap or loss limit is hit.
- **Trade Log** — the permanent record. Rows arrive from the sizing tools
  and the Guardrail (or manual entry); computed columns are tinted;
  one-click spreadsheet export.
- **Analytics** — equity curve, R-distribution, rolling win rate,
  weekday/month breakdowns, plan-adherence and per-symbol/per-setup tables,
  and auto-written insights that stay silent until the sample size earns them.
- **Screener** — the watchlist graded A–F on live fundamentals across five
  categories, with preset screens and full report cards.
- **Stock Analyzer** — one-symbol deep read: verdict gauge, risk grade,
  bull/bear case, analyst consensus, and a technical chart with
  auto-detected setups. Hands off straight into the Position Sizer.
- **Reference** — a 16-term plain-English dictionary and a Monte Carlo
  risk-of-ruin simulator.

Everything research-flavored is a screening aid, not investment advice.

## Your data

- Everything you log lives in this browser's IndexedDB, on this device.
- Durability plan: JSON backup/export + restore (Analytics page),
  spreadsheet export of the Trade Log, and one-click snapshots written to
  `backups/` in this folder. The app reminds you to back up after 20 new
  trades or 30 days.
- Clearing the browser's site data erases the live database — keep backups.
