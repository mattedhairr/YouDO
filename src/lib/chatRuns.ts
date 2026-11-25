/**
 * Chat layout shared by the community, rooms and DMs: one person's messages in
 * a row form a run (name on the first, picture on the last), a day label opens
 * each day, and each person's name keeps one colour.
 */
export interface RunItem {
  author?: string | null;
  /** Sent time in ms; a gap of more than 5 minutes starts a new run. */
  at?: number;
  /** System lines, Kudos and the like stand alone and end any run. */
  alone?: boolean;
}

export interface RunPlace {
  first: boolean;
  last: boolean;
}

const RUN_GAP_MS = 5 * 60_000;

function dayKey(at: number): string {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function joins(a: RunItem | undefined, b: RunItem | undefined): boolean {
  if (!a || !b || a.alone || b.alone || !a.author || a.author !== b.author) return false;
  if (a.at === undefined || b.at === undefined) return true;
  return Math.abs(b.at - a.at) <= RUN_GAP_MS && dayKey(a.at) === dayKey(b.at);
}

export function chatRuns(items: RunItem[]): RunPlace[] {
  return items.map((item, i) => ({
    first: !joins(items[i - 1], item),
    last: !joins(item, items[i + 1]),
  }));
}

/** "Today", "Yesterday" or a short date, shown where a new day starts (null elsewhere). */
export function chatDayLabels(times: Array<number | undefined>, now = new Date()): Array<string | null> {
  const today = dayKey(now.getTime());
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime());
  let previous: string | null = null;
  return times.map((at) => {
    if (at === undefined || !Number.isFinite(at)) return null;
    const key = dayKey(at);
    if (key === previous) return null;
    previous = key;
    if (key === today) return 'Today';
    if (key === yesterday) return 'Yesterday';
    return new Date(at).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  });
}

export const NAME_TONES = 6;

/** The same person always gets the same of the six name colours. */
export function nameTone(id: string | null | undefined): number {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return hash % NAME_TONES;
}
