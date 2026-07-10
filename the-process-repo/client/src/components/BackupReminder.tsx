/**
 * Backup reminder banner (spec §9): appears in the shell once 20+ trades
 * have been logged since the last backup, or when the last backup is
 * older than 30 days. Dismissing snoozes it for 3 days.
 *
 * The whole check runs inside one liveQuery so it re-evaluates when
 * trades OR the backup bookkeeping (kv) change — backing up hides the
 * banner immediately.
 */
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { backupReminderDue, snoozeBackupReminder } from '../lib/backup';

export function BackupReminder() {
  const due = useLiveQuery(async () => {
    const count = await db.trades.count();
    return backupReminderDue(count);
  }, []);

  if (!due) return null;

  return (
    <div className="backup-banner" role="status">
      <span>
        Your trade history lives only in this browser — it's been a while (or a lot of trades)
        since the last backup.
      </span>
      <span className="backup-banner-actions">
        <Link to="/analytics" className="btn btn-primary backup-banner-btn">
          Back up now
        </Link>
        <button className="btn backup-banner-btn" onClick={() => snoozeBackupReminder()}>
          Remind me in 3 days
        </button>
      </span>
    </div>
  );
}
