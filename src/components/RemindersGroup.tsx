import { useState } from 'react';
import { Bell, Check, Repeat, Trash2 } from 'lucide-react';
import type { Task } from '../types';
import { isTaskComplete } from '../lib/goalTree';
import { hapticTick } from '../lib/haptics';
import { reminderMeta, repeatLabel } from '../lib/reminders';

interface Props {
  reminders: Task[];
  today: string;
  onTick: (id: string) => void;
  onUntick: (id: string) => void;
  onDelete: (id: string) => void;
}

/**
 * General quick tasks on Today, under the study cards: ticked, never timed. A
 * ticked one stays crossed out for the rest of its day (reminders.ts).
 */
export default function RemindersGroup({ reminders, today, onTick, onUntick, onDelete }: Props) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  if (reminders.length === 0) return null;
  const done = reminders.filter(isTaskComplete).length;
  return (
    <section className="mt-5 fade-in" aria-label="Reminders">
      <div className="flex items-center justify-between px-1.5 mb-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-content-secondary">
          <Bell size={12} className="text-primary" /> Reminders
        </h3>
        <span className="text-[11px] font-medium text-content-muted tabular-nums">{done} of {reminders.length} done</span>
      </div>
      <div className="space-y-2">
        {reminders.map((r) => {
          const complete = isTaskComplete(r);
          const repeat = repeatLabel(r.repeat);
          const meta = reminderMeta(r, today);
          return (
            <div key={r.id} className={`flex items-start gap-3 rounded-[16px] border border-subtle bg-surface px-3.5 py-3 ${complete ? 'opacity-70' : ''}`}>
              <button
                type="button"
                onClick={() => { hapticTick(); (complete ? onUntick : onTick)(r.id); }}
                aria-label={complete ? `Mark “${r.title}” not done` : `Mark “${r.title}” done`}
                aria-pressed={complete}
                className={`mt-0.5 grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  complete ? 'border-primary bg-primary text-on-primary' : 'border-content-muted'
                }`}
              >
                {complete && <Check size={13} strokeWidth={3} />}
              </button>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-bold text-content-secondary">General</span>
                  {repeat && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-elevated px-1.5 py-0.5 text-[10px] font-semibold text-content-muted">
                      <Repeat size={9} /> {repeat}
                    </span>
                  )}
                </div>
                <p className={`text-[15px] font-semibold leading-snug ${complete ? 'text-content-muted line-through decoration-[1px]' : 'text-content-primary'}`}>{r.title}</p>
                {meta && <p className="mt-0.5 text-[12px] text-content-muted">{meta}</p>}
              </div>
              {confirmId === r.id ? (
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setConfirmId(null)} className="h-8 rounded-lg px-2 text-[12px] font-semibold text-content-secondary">Keep</button>
                  <button type="button" onClick={() => { setConfirmId(null); onDelete(r.id); }} className="h-8 rounded-lg bg-error px-2.5 text-[12px] font-bold text-white">
                    {r.repeat ? 'Delete all' : 'Delete'}
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmId(r.id)} aria-label={`Delete “${r.title}”`} className="-mr-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-content-muted hover:text-error">
                  <Trash2 size={15} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
