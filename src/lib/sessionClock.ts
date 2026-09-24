/** Render both ends of a sitting in one time zone, including older saved rows. */
export function sessionClockLabel(epochMs: number, savedLabel = '', timeZone?: string): string {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return savedLabel || '—';
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone,
  }).format(new Date(epochMs));
}

export function sessionClockRange(
  startMs: number,
  endMs: number,
  savedStart = '',
  savedEnd = '',
  timeZone?: string,
): string {
  return `${sessionClockLabel(startMs, savedStart, timeZone)} – ${sessionClockLabel(endMs, savedEnd, timeZone)}`;
}
