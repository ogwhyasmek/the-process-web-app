/**
 * Cooling-off timer (approved §7 enhancement, backing checklist rule R-06):
 * after any loss logged today, show a live 30-minute countdown instead of
 * relying on the user to track it mentally.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { lastLossToday } from '../../lib/trades';
import { todayIso } from '../../lib/format';

const COOL_OFF_MS = 30 * 60 * 1000;

export function CoolingOffTimer() {
  // liveQuery tracks the trades reads inside lastLossToday, so this
  // re-runs whenever any trade row changes.
  const lastLossAt = useLiveQuery(() => lastLossToday(todayIso()), []);

  const [now, setNow] = useState(Date.now());
  const active = lastLossAt != null && now - lastLossAt < COOL_OFF_MS;

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);

  if (!active) return null;

  const remaining = COOL_OFF_MS - (now - lastLossAt!);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  return (
    <p className="cooloff" role="status">
      Loss logged {Math.round((now - lastLossAt!) / 60000)} min ago — cooling-off has{' '}
      <strong className="num">
        {mm}:{String(ss).padStart(2, '0')}
      </strong>{' '}
      left before the next entry.
    </p>
  );
}
