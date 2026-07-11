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

## Deploying to Cloudflare (one Worker, via GitHub)

The repo deploys as a single Cloudflare Worker: the built client is served
as static assets, and `worker/index.js` (a port of the Express proxy in
`server/`) handles `/api/*` on the same origin. `server/` is still what
runs locally in dev; the Worker is its hosted twin.

**1. Cloudflare dashboard → Workers & Pages → create/import this repo**, then
under the build configuration set:

- Build command: `npm run build` (installs client deps and builds `client/dist`)
- Deploy command: `npx wrangler deploy`

**2. Set the API key secret** (either way works):

- Dashboard: the Worker's **Settings → Variables and Secrets** → add secret
  `FINNHUB_API_KEY`
- Or locally: `npx wrangler secret put FINNHUB_API_KEY`

Without the key the site still deploys and runs on labeled demo data.

Notes for the hosted version:

- Leave `VITE_API_BASE_URL` unset — frontend and API share one origin.
- Snapshot-to-disk backups are local-only (Workers have no filesystem);
  the endpoint returns a clear error and the JSON download backup in
  Analytics is the hosted backup path.
- The Worker's cache is per-isolate and best-effort; Finnhub throttling
  (~1 req/s) still applies per isolate.

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
