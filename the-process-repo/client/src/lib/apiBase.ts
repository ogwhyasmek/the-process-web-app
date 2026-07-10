/**
 * Base URL for the market-data proxy.
 *
 * Same-origin setups (local dev via Vite's proxy, or frontend+proxy behind
 * one host) leave VITE_API_BASE_URL unset — requests stay relative ('/api/...').
 *
 * Cross-origin setups (frontend on Cloudflare, proxy on Render/Fly/Railway)
 * set VITE_API_BASE_URL to the proxy's URL, e.g.
 *   VITE_API_BASE_URL=https://the-process-server.onrender.com
 * This is baked in at build time, so it must be set wherever `npm run build`
 * runs (e.g. Cloudflare's dashboard build-environment variables).
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');
