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
 * directly — see ALLOWED_ORIGINS below, and set HOST=0.0.0.0).
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { marketData } from './routes/marketData.js';
import { backup } from './routes/backup.js';

const app = express();

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const isLoopbackHost = (host) => host === '127.0.0.1' || host === '::1' || host === 'localhost';

// DNS-rebinding guard: when bound to loopback, only answer requests that
// were addressed to a loopback name. A malicious site that re-points its
// own domain at 127.0.0.1 still sends its own name in the Host header,
// so it can't use the browser to read this proxy's responses.
if (isLoopbackHost(config.host)) {
  app.use((req, res, next) => {
    const hostname = String(req.headers.host || '').replace(/:\d+$/, '').toLowerCase();
    if (LOOPBACK_NAMES.has(hostname)) return next();
    res.status(403).json({ error: 'this proxy only answers to localhost' });
  });
}

// Only relevant when the frontend is on a different origin than this proxy
// (e.g. frontend on Cloudflare, proxy on Render). Same-origin setups
// (local dev, or both behind one host) don't need this at all.
if (config.allowedOrigins.length > 0) {
  app.use(cors({ origin: config.allowedOrigins }));
} else if (!isLoopbackHost(config.host)) {
  // Only worth warning about when deployed; local runs are same-origin.
  console.warn(
    '[the-process] ALLOWED_ORIGINS is not set — cross-origin requests will be blocked. ' +
      'If the frontend is hosted elsewhere (e.g. Cloudflare), set ALLOWED_ORIGINS to its URL.',
  );
}

// Small bodies everywhere by default; only the backup snapshot route
// (which can grow with years of trades) accepts large ones — see routes/backup.js.
app.use('/api/backup', backup);
app.use(express.json({ limit: '100kb' }));

/** Health + key presence (never the key itself). */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    keyConfigured: Boolean(config.finnhubKey),
    now: Date.now(),
  });
});

app.use('/api', marketData);

app.use((_req, res) => res.status(404).json({ error: 'no such endpoint' }));

// Loopback only unless HOST says otherwise (hosted platforms set
// HOST=0.0.0.0 because they route traffic in from outside).
app.listen(config.port, config.host, () => {
  console.log(`[the-process] proxy listening on ${config.host}:${config.port}`);
  if (!config.finnhubKey) {
    console.warn(
      '[the-process] FINNHUB_API_KEY is not set — copy server/.env.example to server/.env and add your key. ' +
        'Live data will be unavailable until then; the app will show labeled demo data.',
    );
  }
});
