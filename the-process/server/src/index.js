/**
 * The Process — market-data proxy.
 *
 * Single job: sit between the browser and market-data sources so that
 *   1. no API key ever ships to the browser (spec §2, §8, §9),
 *   2. caching (fundamentals ~24h) and throttling (~1 req/sec) live in
 *      one place instead of browser JS,
 *   3. the app degrades to labeled last-known data when offline.
 *
 * Single-user. Runs either on localhost (frontend and proxy on the same
 * origin, Vite's dev proxy forwards /api here) or on a separate host like
 * Render/Fly/Railway (frontend deployed elsewhere, calls this origin
 * directly — see ALLOWED_ORIGINS below).
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { marketData } from './routes/marketData.js';
import { backup } from './routes/backup.js';

const app = express();

// Only relevant when the frontend is on a different origin than this proxy
// (e.g. frontend on Cloudflare, proxy on Render). Same-origin setups
// (local dev, or both behind one host) don't need this at all.
if (config.allowedOrigins.length > 0) {
  app.use(cors({ origin: config.allowedOrigins }));
} else {
  console.warn(
    '[the-process] ALLOWED_ORIGINS is not set — cross-origin requests will be blocked. ' +
      'If the frontend is hosted elsewhere (e.g. Cloudflare), set ALLOWED_ORIGINS to its URL.',
  );
}

app.use(express.json({ limit: '25mb' })); // backups can grow with years of trades

/** Health + key presence (never the key itself). */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(config.finnhubKey),
    now: Date.now(),
  });
});

app.use('/api', marketData);
app.use('/api/backup', backup);

app.use((_req, res) => res.status(404).json({ error: 'no such endpoint' }));

// No host argument = listen on all interfaces. Required on hosted platforms
// (Render, Fly, Railway) which route traffic in from outside localhost.
app.listen(config.port, () => {
  console.log(`[the-process] proxy listening on port ${config.port}`);
  if (!config.finnhubKey) {
    console.warn(
      '[the-process] FINNHUB_API_KEY is not set — copy server/.env.example to server/.env and add your key. ' +
        'Live data will be unavailable until then; the app will show labeled demo data.',
    );
  }
});
