/**
 * Builds the proxy's Express app without starting it, so tests can run it
 * on a throwaway port. index.js is the only place that calls listen().
 */
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { marketData } from './routes/marketData.js';
import { backup } from './routes/backup.js';

export const app = express();

const LOOPBACK_NAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const isLoopbackHost = (host) => host === '127.0.0.1' || host === '::1' || host === 'localhost';

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
