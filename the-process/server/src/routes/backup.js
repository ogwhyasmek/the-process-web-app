/**
 * Snapshot-to-disk backups (confirmed decision, 2026-07-08).
 *
 * The browser's IndexedDB is the primary store; these routes let the app
 * write a timestamped JSON copy into <project root>/backups/ so trade
 * history survives even a browser-data wipe.
 */
import express, { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export const backup = Router();

/**
 * Only the app itself may write snapshots.
 *
 * Browsers attach an Origin header to every cross-site POST. Any website
 * you visit could otherwise fire a no-preflight POST at localhost and fill
 * backups/ with junk. Allowed: no Origin (curl, same-origin GETs), a
 * localhost origin (the dev server), or one listed in ALLOWED_ORIGINS.
 */
function sameAppOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (!origin) return next();
  let hostname;
  try {
    hostname = new URL(origin).hostname;
  } catch {
    return res.status(403).json({ error: 'bad origin' });
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(hostname)) return next();
  if (config.allowedOrigins.includes(origin)) return next();
  return res.status(403).json({ error: 'snapshots can only be written by the app itself' });
}

/** Same shape check the client runs before restoring (lib/backup.ts). */
function looksLikeBackup(b) {
  return (
    !!b &&
    b.app === 'the-process' &&
    b.version === 1 &&
    !!b.data &&
    ['trades', 'settings', 'watchlist', 'kv'].every((k) => Array.isArray(b.data[k]))
  );
}

/** Write a snapshot. Body: the full backup JSON produced by the client. */
backup.post(
  '/snapshot',
  sameAppOrigin,
  // Real JSON only: a text/plain or form POST (which needs no CORS
  // preflight) is refused outright instead of being parsed as {}.
  (req, res, next) =>
    req.is('application/json')
      ? next()
      : res.status(415).json({ error: 'send the backup as application/json' }),
  express.json({ limit: '25mb' }), // backups grow with years of trades
  async (req, res) => {
    if (!looksLikeBackup(req.body)) {
      return res.status(400).json({ error: "that isn't a Process backup" });
    }
    try {
      await fs.mkdir(config.backupsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const file = `the-process-backup-${stamp}.json`;
      await fs.writeFile(
        path.join(config.backupsDir, file),
        JSON.stringify(req.body, null, 1),
        'utf8',
      );
      res.json({ ok: true, file });
    } catch (err) {
      res.status(500).json({ error: `could not write backup: ${err.message}` });
    }
  },
);

/** List existing snapshots, newest first. */
backup.get('/snapshots', async (_req, res) => {
  try {
    const names = (await fs.readdir(config.backupsDir)).filter((n) => n.endsWith('.json'));
    const files = await Promise.all(
      names.map(async (name) => {
        const stat = await fs.stat(path.join(config.backupsDir, name));
        return { name, size: stat.size, modifiedAt: stat.mtimeMs };
      }),
    );
    files.sort((a, b) => b.modifiedAt - a.modifiedAt);
    res.json({ files });
  } catch (err) {
    if (err.code === 'ENOENT') return res.json({ files: [] });
    res.status(500).json({ error: err.message });
  }
});

/** Fetch one snapshot's contents (for restore). */
backup.get('/snapshot/:name', async (req, res) => {
  const name = path.basename(req.params.name); // no traversal
  if (!/^the-process-backup-[\w-]+\.json$/.test(name)) {
    return res.status(400).json({ error: 'not a backup file name' });
  }
  try {
    const text = await fs.readFile(path.join(config.backupsDir, name), 'utf8');
    res.type('application/json').send(text);
  } catch {
    res.status(404).json({ error: 'backup not found' });
  }
});
