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
import { config } from './config.js';
import { app } from './app.js';

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
