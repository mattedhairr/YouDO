import { useEffect, useState } from 'react';
import { msUntilEndOfLocalISODate } from '../lib/dates';
import { formatCountdownHm } from '../lib/format';

export function reviveTimeLeftLabel(windowEnds: string, now = Date.now()): string {
  const ms = msUntilEndOfLocalISODate(windowEnds, now);
  return `${formatCountdownHm(ms)} left to restore`;
}

export function reviveDeadlineLabel(windowEnds: string, streakDays: number, now = Date.now()): string {
  const time = formatCountdownHm(msUntilEndOfLocalISODate(windowEnds, now));
  const streak = streakDays === 1 ? '1-day streak' : `${streakDays}-day streak`;
  return `${time} left to restore ${streak}`;
}

export function useReviveCountdown(windowEnds: string | undefined, active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !windowEnds) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [active, windowEnds]);

  return now;
}

export function useReviveTimeLeftSub(windowEnds: string | undefined, active: boolean): string | null {
  const now = useReviveCountdown(windowEnds, active);
  if (!active || !windowEnds) return null;
  return reviveTimeLeftLabel(windowEnds, now);
}

export function useReviveDeadlineLabel(
  windowEnds: string | undefined,
  streakDays: number,
  active: boolean,
): string | null {
  const now = useReviveCountdown(windowEnds, active);
  if (!active || !windowEnds || streakDays <= 0) return null;
  return reviveDeadlineLabel(windowEnds, streakDays, now);
}
