/**
 * Central configuration for the proxy.
 * All values come from server/.env — never sent to the browser.
 */
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(here, '..', '.env') });

export const config = {
  port: Number(process.env.PORT) || 4600,

  // Interface to listen on. Loopback by default: a personal tool holding
  // trade history and an API key must not answer to the whole network.
  // Hosted platforms (Render/Fly/Railway) set HOST=0.0.0.0 explicitly.
  host: process.env.HOST || '127.0.0.1',
  finnhubKey: process.env.FINNHUB_API_KEY || '',

  // Comma-separated list of origins allowed to call this proxy, e.g.
  // "https://the-process.pages.dev,https://my-custom-domain.com"
  // Only needed when the frontend is hosted on a different origin than
  // this server. Leave unset for local dev (same-origin, no CORS needed).
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  // Cache lifetimes (milliseconds).
  ttl: {
    quote: 25 * 1000,             // quotes refresh ~every 30s; cache just under
    fundamentals: 24 * 60 * 60 * 1000, // spec §6.6: fundamentals cached ~24h
    bars: 12 * 60 * 60 * 1000,    // daily OHLC bars: two fetches a day is plenty
    earnings: 6 * 60 * 60 * 1000,
    recommendations: 24 * 60 * 60 * 1000,
    profile: 7 * 24 * 60 * 60 * 1000,
  },

  // Spec §6.6/§9: throttle upstream requests to roughly 1/sec.
  finnhubMinIntervalMs: 1050,

  // Where "snapshot to disk" backups land (project root /backups).
  // BACKUPS_DIR overrides it — the test suite points it at a temp folder.
  backupsDir: process.env.BACKUPS_DIR || path.join(here, '..', '..', 'backups'),
};
