/**
 * Snapshot-to-disk backups (confirmed decision, 2026-07-08).
 *
 * The browser's IndexedDB is the primary store; these routes let the app
 * write a timestamped JSON copy into <project root>/backups/ so trade
 * history survives even a browser-data wipe.
 */
import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export const backup = Router();

/** Write a snapshot. Body: the full backup JSON produced by the client. */
backup.post('/snapshot', async (req, res) => {
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
});

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
