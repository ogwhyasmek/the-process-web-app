/**
 * Full JSON backup & restore (spec §6.5, §9) — covers every piece of the
 * app's local data: Trade Log, settings, screener watchlist, and kv state.
 * Also feeds the snapshot-to-disk endpoint (confirmed decision).
 */
import { db } from './db';
import { kvGet, kvSet } from './kv';
import { API_BASE_URL } from './apiBase';

export interface BackupFile {
  app: 'the-process';
  version: 1;
  exportedAt: string;
  data: {
    trades: unknown[];
    settings: unknown[];
    watchlist: unknown[];
    kv: unknown[];
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const [trades, settings, watchlist, kv] = await Promise.all([
    db.trades.toArray(),
    db.settings.toArray(),
    db.watchlist.toArray(),
    db.kv.toArray(),
  ]);
  return {
    app: 'the-process',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { trades, settings, watchlist, kv },
  };
}

export function isValidBackup(json: unknown): json is BackupFile {
  const b = json as BackupFile;
  return (
    !!b &&
    b.app === 'the-process' &&
    b.version === 1 &&
    !!b.data &&
    Array.isArray(b.data.trades) &&
    Array.isArray(b.data.settings) &&
    Array.isArray(b.data.watchlist) &&
    Array.isArray(b.data.kv)
  );
}

/**
 * Replace all local data with a backup's contents. Runs in one
 * transaction — either everything restores or nothing changes.
 */
export async function restoreBackup(backup: BackupFile): Promise<void> {
  await db.transaction('rw', [db.trades, db.settings, db.watchlist, db.kv], async () => {
    await Promise.all([
      db.trades.clear(),
      db.settings.clear(),
      db.watchlist.clear(),
      db.kv.clear(),
    ]);
    await Promise.all([
      db.trades.bulkAdd(backup.data.trades as never[]),
      db.settings.bulkAdd(backup.data.settings as never[]),
      db.watchlist.bulkAdd(backup.data.watchlist as never[]),
      db.kv.bulkAdd(backup.data.kv as never[]),
    ]);
  });
}

// ---------------------------------------------------------------------------
// Backup reminders (spec §9: prompt after 20 logged trades or every 30 days)
// ---------------------------------------------------------------------------

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
const SNOOZE = 3 * 24 * 60 * 60 * 1000;

/** Record that a real backup (JSON download or disk snapshot) happened. */
export async function markBackupDone(): Promise<void> {
  await kvSet('backup.lastBackupAt', Date.now());
  await kvSet('backup.tradesAtLastBackup', await db.trades.count());
}

export async function snoozeBackupReminder(): Promise<void> {
  await kvSet('backup.snoozedUntil', Date.now() + SNOOZE);
}

/**
 * Whether to nag for a backup right now. Fires once 20+ trades have been
 * logged since the last backup (or ever, if none), or when the last
 * backup is older than 30 days — unless recently snoozed.
 */
export async function backupReminderDue(tradeCount: number): Promise<boolean> {
  if (tradeCount === 0) return false;
  const snoozedUntil = (await kvGet<number>('backup.snoozedUntil')) ?? 0;
  if (Date.now() < snoozedUntil) return false;
  const lastBackupAt = await kvGet<number>('backup.lastBackupAt');
  const tradesAtLast = (await kvGet<number>('backup.tradesAtLastBackup')) ?? 0;
  if (tradeCount - tradesAtLast >= 20) return true;
  if (lastBackupAt != null && Date.now() - lastBackupAt > THIRTY_DAYS) return true;
  return false;
}

/** POST the backup to the local proxy, which writes it into backups/. */
export async function snapshotToDisk(): Promise<string> {
  const backup = await buildBackup();
  const res = await fetch(`${API_BASE_URL}/api/backup/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `snapshot failed (${res.status})`);
  }
  const { file } = await res.json();
  return file as string;
}
