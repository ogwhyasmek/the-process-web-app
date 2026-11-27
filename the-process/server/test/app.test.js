/**
 * HTTP-level tests of the proxy: the network guards, the backup snapshot
 * route, and the market-data routes' behavior without an API key.
 * Runs the real Express app on a throwaway port; snapshots go to a temp dir.
 */
import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

// Must be set before config.js is loaded (dotenv never overrides set vars).
const backupsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'the-process-backups-'));
process.env.BACKUPS_DIR = backupsDir;
process.env.FINNHUB_API_KEY = '';
delete process.env.HOST;
delete process.env.ALLOWED_ORIGINS;

const { app } = await import('../src/app.js');

let server;
let port;

before(async () => {
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  port = server.address().port;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await fs.rm(backupsDir, { recursive: true, force: true });
});

/** Raw HTTP request (fetch won't let us forge the Host header). */
function request(method, urlPath, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, method, path: urlPath, headers: { host: `localhost:${port}`, ...headers } },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(text); } catch { /* not JSON */ }
          resolve({ status: res.statusCode, json, text });
        });
      },
    );
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const validBackup = JSON.stringify({
  app: 'the-process',
  version: 1,
  exportedAt: '2026-11-27T00:00:00.000Z',
  data: { trades: [{ id: 1, symbol: 'NVDA' }], settings: [], watchlist: [], kv: [] },
});
const json = { 'content-type': 'application/json' };

describe('network guards', () => {
  it('answers requests addressed to localhost', async () => {
    const res = await request('GET', '/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.keyConfigured, false);
  });

  it('refuses a foreign Host header (DNS-rebinding guard)', async () => {
    const res = await request('GET', '/api/backup/snapshots', { headers: { host: 'evil.example' } });
    assert.equal(res.status, 403);
  });

  it('never reveals the API key', async () => {
    const res = await request('GET', '/api/health');
    assert.deepEqual(Object.keys(res.json).sort(), ['keyConfigured', 'now', 'ok']);
  });
});

describe('POST /api/backup/snapshot', () => {
  it('writes a valid backup sent by the app', async () => {
    const res = await request('POST', '/api/backup/snapshot', {
      headers: { ...json, origin: 'http://localhost:4610' },
      body: validBackup,
    });
    assert.equal(res.status, 200);
    assert.match(res.json.file, /^the-process-backup-[\w-]+\.json$/);
    const written = JSON.parse(await fs.readFile(path.join(backupsDir, res.json.file), 'utf8'));
    assert.equal(written.data.trades[0].symbol, 'NVDA');
  });

  it('refuses a no-preflight text/plain POST (what any website can send)', async () => {
    const res = await request('POST', '/api/backup/snapshot', {
      headers: { 'content-type': 'text/plain', origin: 'https://evil.example' },
      body: validBackup,
    });
    assert.ok(res.status === 403 || res.status === 415, `got ${res.status}`);
  });

  it('refuses JSON from a foreign origin', async () => {
    const res = await request('POST', '/api/backup/snapshot', {
      headers: { ...json, origin: 'https://evil.example' },
      body: validBackup,
    });
    assert.equal(res.status, 403);
  });

  it('refuses a non-JSON body even without an Origin', async () => {
    const res = await request('POST', '/api/backup/snapshot', {
      headers: { 'content-type': 'text/plain' },
      body: 'x',
    });
    assert.equal(res.status, 415);
  });

  it('refuses JSON that is not a Process backup', async () => {
    const res = await request('POST', '/api/backup/snapshot', { headers: json, body: '{}' });
    assert.equal(res.status, 400);
  });
});

describe('GET /api/backup/snapshot/:name', () => {
  it('lists and reads back written snapshots', async () => {
    const list = await request('GET', '/api/backup/snapshots');
    assert.equal(list.status, 200);
    assert.ok(list.json.files.length >= 1);
    const read = await request('GET', `/api/backup/snapshot/${list.json.files[0].name}`);
    assert.equal(read.status, 200);
    assert.equal(read.json.app, 'the-process');
  });

  it('refuses names that are not backup files (no path traversal)', async () => {
    for (const name of ['..%2F..%2Fpackage.json', 'package.json', '.env']) {
      const res = await request('GET', `/api/backup/snapshot/${name}`);
      assert.ok(res.status === 400 || res.status === 404, `${name} → ${res.status}`);
      assert.notEqual(res.json?.name, 'the-process-server');
    }
  });
});

describe('market-data routes without an API key', () => {
  it('serves labeled demo quotes for the ticker', async () => {
    const res = await request('GET', '/api/quotes?symbols=AAPL,MSFT,ZZZZ');
    assert.equal(res.status, 200);
    assert.equal(res.json.quotes.AAPL.source, 'demo');
    assert.equal(typeof res.json.quotes.AAPL.price, 'number');
    assert.equal(res.json.quotes.ZZZZ.price, null); // no fixture → no made-up price
  });

  it('caps the ticker batch at 15 symbols and drops invalid ones', async () => {
    const syms = Array.from({ length: 20 }, (_, i) => `S${i}`).concat(['1BAD', '../x']);
    const res = await request('GET', `/api/quotes?symbols=${syms.join(',')}`);
    assert.equal(Object.keys(res.json.quotes).length, 15);
    assert.ok(!('1BAD' in res.json.quotes));
  });

  it('requires a symbols param', async () => {
    assert.equal((await request('GET', '/api/quotes')).status, 400);
  });

  it('validates the :symbol param before touching the upstream', async () => {
    const res = await request('GET', '/api/fundamentals/1NVALID');
    assert.equal(res.status, 400);
  });

  it('reports a missing key as an upstream failure, not a crash', async () => {
    const res = await request('GET', '/api/quote/AAPL');
    assert.equal(res.status, 502);
    assert.match(res.json.error, /FINNHUB_API_KEY/);
  });

  it('returns JSON 404 for unknown endpoints', async () => {
    const res = await request('GET', '/api/nope');
    assert.equal(res.status, 404);
    assert.equal(res.json.error, 'no such endpoint');
  });
});
