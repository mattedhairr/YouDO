export function isToday(iso: string | null): boolean {
  if (!iso) return false;
  // Compare ISO date strings directly to avoid UTC vs local timezone mismatch.
  // new Date('YYYY-MM-DD') parses as UTC midnight, which gives wrong results for
  // users in timezones west of UTC (e.g. task shows as "yesterday" until 7 PM UTC-5).
  return iso.slice(0, 10) === todayISO();
}

export function todayISO(): string {
  return localISODate(new Date());
}

export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return localISODate(d);
}

export function localISODate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftLocalISO(iso: string, days: number): string {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localISODate(dt);
}

/** Whole local calendar days from `fromISO` to `toISO` (can be negative). */
export function daysBetweenLocalISO(fromISO: string, toISO: string): number {
  const [y1, m1, d1] = fromISO.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = toISO.slice(0, 10).split('-').map(Number);
  const a = new Date(y1, m1 - 1, d1).getTime();
  const b = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** First local midnight strictly after `ts`. */
export function nextLocalMidnight(ts: number): number {
  const d = new Date(ts);
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

/** Milliseconds until local midnight after `iso` (exclusive end of that calendar day). */
export function msUntilEndOfLocalISODate(iso: string, now = Date.now()): number {
  const [y, m, d] = shiftLocalISO(iso, 1).split('-').map(Number);
  const deadline = new Date(y, m - 1, d).getTime();
  return Math.max(0, deadline - now);
}

export function formatDDMMYYYY(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const parts = isoStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return isoStr;
}
