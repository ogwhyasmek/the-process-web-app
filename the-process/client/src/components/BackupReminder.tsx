/**
 * Backup reminder banner (spec §9): appears once 20+ trades have been
 * logged since the last backup, or when the last backup is older than
 * 30 days. Dismissing snoozes it for 3 days.
 *
 * Shown only on the Trade Log and Analytics — where trade history is
 * reviewed and where the backup controls live — never on the pre-trade
 * pages (Cockpit, Guardrail), where the checklist and stand-down status
 * must be the loudest things on screen.
 *
 * The whole check runs inside one liveQuery so it re-evaluates when
 * trades OR the backup bookkeeping (kv) change — backing up hides the
 * banner immediately.
 */
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { backupReminderDue, snoozeBackupReminder } from '../lib/backup';

const SHOWN_ON = ['/log', '/analytics'];

export function BackupReminder() {
  const { pathname } = useLocation();
  const due = useLiveQuery(async () => {
    const count = await db.trades.count();
    return backupReminderDue(count);
  }, []);

  if (!due || !SHOWN_ON.includes(pathname)) return null;

  const onAnalytics = pathname === '/analytics';

  return (
    <div className="backup-banner" role="status">
      <span>
        Your trade history lives only in this browser — it's been a while (or a lot of trades)
        since the last backup.
      </span>
      <span className="backup-banner-actions">
        {onAnalytics ? (
          // Already on the page with the backup controls — jump to them.
          <button
            className="btn btn-primary backup-banner-btn"
            onClick={() => document.getElementById('exports-title')?.scrollIntoView()}
          >
            Back up now
          </button>
        ) : (
          <Link to="/analytics" className="btn btn-primary backup-banner-btn">
            Back up now
          </Link>
        )}
        <button className="btn backup-banner-btn" onClick={() => snoozeBackupReminder()}>
          Remind me in 3 days
        </button>
      </span>
    </div>
  );
}
