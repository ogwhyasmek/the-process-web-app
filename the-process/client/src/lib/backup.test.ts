/**
 * Backup & restore (§6.5, §9) — the only safety net for trade history,
 * so it runs against a real (in-memory) IndexedDB, not mocks.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, DEFAULT_SETTINGS } from './db';
import {
  backupReminderDue,
  buildBackup,
  isValidBackup,
  markBackupDone,
  restoreBackup,
  snoozeBackupReminder,
  type BackupFile,
} from './backup';
import { addTrade } from './trades';
import { kvSet } from './kv';

const DAY = 24 * 60 * 60 * 1000;

const sampleTrade = (symbol: string) => ({
  date: '2026-11-02', symbol, direction: 'Up' as const, matchedRules: 'Y' as const,
  tradeType: 'Stock', setupTag: 'breakout', buyPrice: 100, stopPrice: 98, targetPrice: 104,
  soldAt: 104, multiplier: 1, accountSizeAtLog: 10000, riskPctAtLog: 1, rDirect: null,
  followedPlan: 'Y' as const, feeling: 'calm', notes: 'textbook', source: 'sizer' as const,
});

beforeEach(async () => {
  await Promise.all([db.trades.clear(), db.settings.clear(), db.watchlist.clear(), db.kv.clear()]);
});
afterEach(() => vi.useRealTimers());

describe('isValidBackup', () => {
  const good = { app: 'the-process', version: 1, exportedAt: 'x', data: { trades: [], settings: [], watchlist: [], kv: [] } };

  it('accepts a well-formed backup', () => {
    expect(isValidBackup(good)).toBe(true);
  });

  it.each([
    ['null', null],
    ['another app', { ...good, app: 'other' }],
    ['a future version', { ...good, version: 2 }],
    ['missing data', { ...good, data: undefined }],
    ['a non-array table', { ...good, data: { ...good.data, trades: {} } }],
  ])('rejects %s', (_label, value) => {
    expect(isValidBackup(value)).toBe(false);
  });
});

describe('build → restore round trip', () => {
  it('restores exactly what was backed up, replacing current data', async () => {
    await addTrade(sampleTrade('NVDA'));
    await addTrade(sampleTrade('AMD'));
    await db.settings.put({ ...DEFAULT_SETTINGS, accountSize: 25000 });
    await db.watchlist.add({ symbol: 'MSFT', addedAt: 1 });
    await kvSet('cockpit.greeks', { spot: '100' });

    const backup = await buildBackup();
    expect(isValidBackup(backup)).toBe(true);
    // Survives serialization the way a downloaded file would.
    const fromFile = JSON.parse(JSON.stringify(backup)) as BackupFile;

    // Diverge from the backup, then restore over it.
    await db.trades.clear();
    await addTrade(sampleTrade('JUNK'));
    await db.settings.put({ ...DEFAULT_SETTINGS, accountSize: 1 });

    await restoreBackup(fromFile);

    const trades = await db.trades.orderBy('id').toArray();
    expect(trades.map((t) => t.symbol)).toEqual(['NVDA', 'AMD']);
    expect(trades[0]).toMatchObject(sampleTrade('NVDA'));
    expect((await db.settings.get('account'))?.accountSize).toBe(25000);
    expect((await db.watchlist.toArray()).map((w) => w.symbol)).toEqual(['MSFT']);
    expect((await db.kv.get('cockpit.greeks'))?.value).toEqual({ spot: '100' });
  });

  it('is all-or-nothing: a failed restore leaves current data untouched', async () => {
    await addTrade(sampleTrade('KEEP'));
    const broken = (await buildBackup()) as BackupFile;
    // Two rows with the same primary key make bulkAdd fail mid-restore.
    broken.data.trades = [{ ...sampleTrade('A'), id: 7, createdAt: 1 }, { ...sampleTrade('B'), id: 7, createdAt: 2 }];

    await expect(restoreBackup(broken)).rejects.toThrow();
    expect((await db.trades.toArray()).map((t) => t.symbol)).toEqual(['KEEP']);
  });
});

describe('backup reminder (§9: after 20 trades or 30 days)', () => {
  it('never nags an empty log', async () => {
    expect(await backupReminderDue(0)).toBe(false);
  });

  it('fires after 20 trades since the last backup', async () => {
    await markBackupDone(); // records 0 trades at backup time
    expect(await backupReminderDue(19)).toBe(false);
    expect(await backupReminderDue(20)).toBe(true);
  });

  it('fires 30 days after the last backup', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    await addTrade(sampleTrade('X'));
    await markBackupDone();
    vi.setSystemTime(new Date(Date.now() + 29 * DAY));
    expect(await backupReminderDue(1)).toBe(false);
    vi.setSystemTime(new Date(Date.now() + 2 * DAY));
    expect(await backupReminderDue(1)).toBe(true);
  });

  it('stays quiet for 3 days after a snooze', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T12:00:00'));
    await kvSet('backup.tradesAtLastBackup', 0);
    await snoozeBackupReminder();
    expect(await backupReminderDue(50)).toBe(false);
    vi.setSystemTime(new Date(Date.now() + 3 * DAY + 1000));
    expect(await backupReminderDue(50)).toBe(true);
  });
});
