import { useMemo, useState } from 'react';
import { ChevronDown, Zap } from 'lucide-react';
import { useStore } from '../store';
import { todayISO } from '../lib/dates';
import { extraFocusForGoal } from '../lib/extraFocus';

/** "3h 20m", "48m". */
const hm = (ms: number) => {
  const mins = Math.max(1, Math.round(ms / 60000));
  const h = Math.floor(mins / 60);
  return h ? `${h}h${mins % 60 ? ` ${mins % 60}m` : ''}` : `${mins}m`;
};

const dayLabel = (iso: string, today: string) => {
  if (iso === today) return 'Today';
  const d = new Date(iso + 'T12:00:00');
  const y = new Date(today + 'T12:00:00');
  y.setDate(y.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short' });
};

/**
 * One quiet line on a goal: this week's focus on its study quick tasks. Time
 * only; the goal's % never changes. Tap to see which tasks and when.
 */
export default function ExtraFocusLine({ goalId }: { goalId: string }) {
  const { sessionHistory, tasks } = useStore();
  const [open, setOpen] = useState(false);
  const today = todayISO();
  const extra = useMemo(() => extraFocusForGoal(goalId, sessionHistory, tasks, today), [goalId, sessionHistory, tasks, today]);
  if (extra.weekMs <= 0) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-xl bg-primary-soft px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-semibold text-primary">
          <Zap size={13} className="shrink-0" />
          <span className="truncate">Extra focus · <b className="font-bold text-content-primary">{hm(extra.weekMs)}</b> this week</span>
        </span>
        <ChevronDown size={14} className={`shrink-0 text-content-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 px-1">
          <p className="py-1 text-[11px] text-content-muted">Study quick tasks for this goal. They add time, never change the %.</p>
          {extra.rows.map((row) => (
            <div key={`${row.taskId}-${row.day}`} className="flex items-center justify-between gap-3 border-t border-subtle py-2 text-[12.5px]">
              <span className="min-w-0 truncate text-content-primary">{row.title}</span>
              <span className="shrink-0 tabular-nums text-content-muted">{dayLabel(row.day, today)} · {hm(row.ms)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
