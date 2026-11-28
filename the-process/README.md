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
├── worker/    the Cloudflare Worker — the hosted twin of server/
└── backups/   created on demand — timestamped JSON snapshots of your data
               (git-ignored: it holds your trade history)
```

## Requirements

[Node.js](https://nodejs.org) 20 or newer. (Optionally, drop a Node runtime
into `.tools/node/` — the scripts use it if present, and it's git-ignored.)

## First-time setup

1. Install dependencies (installs for the root, `server/`, and `client/`).
   This also creates `server/.env` from `server/.env.example`:

   ```sh
   ./setup.sh
   ```

2. Give the proxy your market-data key: open `server/.env` and paste your
   finnhub.io API key after `FINNHUB_API_KEY=`. The file is git-ignored —
   never commit it. The free tier works — the proxy throttles itself to
   stay inside its 60 requests/minute limit.

   Without a key the app still runs: the ticker shows clearly-labeled demo
   prices, and the Screener and Stock Analyzer explain that a key is needed.
   Everything that doesn't need market data (Cockpit, Guardrail, Trade Log,
   Analytics, Reference) works fully.

## Run it

```sh
./run.sh
```

Then open **http://localhost:4610**.

That one command starts both halves: the proxy on `127.0.0.1:4600` and the
app on `localhost:4610` (the app forwards all `/api` calls to the proxy).

The proxy only answers to this computer — nobody else on your network can
reach it, read your backup snapshots, or spend your API quota. If you deploy
`server/` to a hosted platform instead, set `HOST=0.0.0.0` there (see
`server/.env.example`).

## Tests

```sh
npm test --prefix client   # formulas, grading, signals, analytics, backup/restore
npm test --prefix server   # proxy network guards, backup route, cache, throttle
```

The client tests pin every formula and threshold in the spec (§6) —
including the Analytics insight gates, which must stay silent one trade
short of their minimum sample. Black-Scholes is checked against
independently computed reference prices. Backup/restore runs against an
in-memory IndexedDB, including a failed restore leaving data untouched.

GitHub Actions (`.github/workflows/ci.yml`) runs both suites, the
typecheck and the production build on every push, and fails on any new
high or critical dependency advisory.

## Deploying to Cloudflare (one Worker, via GitHub)

The repo deploys as a single Cloudflare Worker: the built client is served
as static assets, and `worker/index.js` (a port of the Express proxy in
`server/`) handles `/api/*` on the same origin. `server/` is still what
runs locally in dev; the Worker is its hosted twin.

**1. Cloudflare dashboard → Workers & Pages → create/import this repo**, then
under the build configuration set:

- Root directory: `the-process` (the app lives in this subfolder of the repo)
- Build command: `npm run build` (installs client deps and builds `client/dist`)
- Deploy command: `npx wrangler deploy`

**2. Set the API key secret** (either way works):

- Dashboard: the Worker's **Settings → Variables and Secrets** → add secret
  `FINNHUB_API_KEY`
- Or locally: `npx wrangler secret put FINNHUB_API_KEY`

Without the key the site still deploys; the ticker shows labeled demo
prices, and the research pages explain that no key is set.

**3. Put it behind a login.** The Worker URL is public, so anyone who finds
it can spend your Finnhub quota. Cloudflare Access (Zero Trust → Access →
Applications) can restrict it to your own email for free.

Notes for the hosted version:

- Leave `VITE_API_BASE_URL` unset — frontend and API share one origin.
- Snapshot-to-disk backups are local-only (Workers have no filesystem);
  the endpoint returns a clear error and the JSON download backup in
  Analytics is the hosted backup path.
- The Worker's cache is per-isolate and best-effort; Finnhub throttling
  (~1 req/s) still applies per isolate.
- Set a build environment variable `NODE_VERSION=22` in the Cloudflare
  build settings; the build (Vite 6) needs Node 20 or newer.
- Price history for the Stock Analyzer's chart comes from Yahoo's
  unofficial chart endpoint, which sometimes rate-limits requests from
  cloud servers. If it does, the Analyzer still works; only the technical
  chart and its detected setups are missing.
- Your trade data lives in each browser's own storage. The hosted app on
  your phone and on your desktop keep separate trade logs — back up from
  the one you use, or pick one device for logging.

## What's inside

- **Trade Cockpit** — the 7-rule pre-trade checklist (with printable version
  and a cooling-off timer after losses), Position Sizer, Options Contract
  Ticket, Greeks Lab (Black-Scholes + payoff diagram), Volatility Read, an
  and an earnings calendar for the watchlist.
- **Daily Guardrail** — today's circuit breaker. Every trade logged today
  counts, from any page. Hit the trade cap or loss limit and you're stood
  down until midnight: the Cockpit stops logging new setups, deleting
  trades doesn't lift it, and looser limits only apply from tomorrow.
  Undo is a 2-minute typo fix. For 30 minutes after a loss the Cockpit
  can't log a setup (rule R-06). Trades recorded while stood down are
  flagged as rule breaks.
- **Trade Log** — the permanent record. Rows arrive from the sizing tools
  and the Guardrail (or manual entry); computed columns are tinted;
  one-click spreadsheet export.
- **Analytics** — equity curve (max drawdown marked), R-distribution, rolling win rate,
  weekday/month breakdowns, plan-adherence and per-symbol/per-setup tables,
  and auto-written insights that stay silent until the sample size earns them.
- **Screener** — the watchlist graded A–F on live fundamentals across five
  categories, with preset screens and full report cards.
- **Stock Analyzer** — one-symbol deep read: verdict gauge, risk grade,
  bull/bear case, analyst consensus, and a technical chart with
  auto-detected setups. Hands off straight into the Position Sizer.
- **Reference** — a Monte Carlo risk-of-ruin simulator, the four
  account-killer cards, the options-vs-futures table, and a 16-term
  plain-English dictionary.

Everything research-flavored is a screening aid, not investment advice.

## Your data

- Everything you log lives in this browser's IndexedDB, on this device.
- Durability plan: JSON backup/export + restore (Analytics page),
  spreadsheet export of the Trade Log, and one-click snapshots written to
  `backups/` in this folder. The app reminds you to back up after 20 new
  trades or 30 days.
- Clearing the browser's site data erases the live database — keep backups.
