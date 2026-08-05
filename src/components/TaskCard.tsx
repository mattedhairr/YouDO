import { Calendar, Clock, Copy, GripVertical, Link2, RotateCcw, X } from 'lucide-react';
import type { Priority, Task } from '../types';
import { isTaskComplete } from '../store';

interface Props {
  task: Task;
  onAdvance: (id: string) => void;
  onUndo: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragOver: boolean;
  origin?: string;
  softRemove?: boolean;
  dark?: boolean;
}

const priorityStyles: Record<Priority, { dot: string; bar: string; glow: string }> = {
  high:   { dot: 'bg-rose-500',   bar: 'bg-rose-500',   glow: 'shadow-rose-500/20' },
  medium: { dot: 'bg-amber-500',  bar: 'bg-amber-500',  glow: 'shadow-amber-500/20' },
  low:    { dot: 'bg-emerald-500', bar: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
};

function fmtDate(date: string | null): string {
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtCountdown(deadline: string | null): string {
  if (!deadline) return '';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h left`;
}

export default function TaskCard({
  task, onAdvance, onUndo, onDelete, onDuplicate,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, origin, softRemove, dark = false,
}: Props) {
  const ps = priorityStyles[task.priority];
  const total = task.steps.length || 1;
  const fillPct = (task.progress / total) * 100;
  const complete = isTaskComplete(task);
  const hasSteps = task.steps.length > 0;

  const titleColor = complete
    ? 'line-through text-slate-400 dark:text-slate-500'
    : 'text-slate-800 dark:text-slate-100';
  const dateColor = dark ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400';
  const trackBg   = dark ? 'bg-slate-800' : 'bg-slate-100 dark:bg-slate-800/80';

  const btnBase = 'p-1.5 rounded-xl transition-all active:scale-95 no-swipe';
  const btnNeutral = dark
    ? `${btnBase} text-slate-400 hover:text-blue-400 hover:bg-white/5`
    : `${btnBase} text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/20`;
  const btnDel = dark
    ? `${btnBase} text-slate-400 hover:text-rose-400 hover:bg-rose-900/30`
    : `${btnBase} text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-900/30`;

  return (
    <div
      className={`
        card overflow-hidden transition-all p-0
        ${isDragging ? 'dragging-card opacity-50 scale-[0.98]' : ''}
        ${dragOver  ? 'ring-2 ring-blue-400' : ''}
        ${complete  ? 'opacity-70 ring-1 ring-emerald-500/30 dark:ring-emerald-400/20 animate-glow-pulse' : ''}
      `}
      onClick={() => !complete && onAdvance(task.id)}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task.id); }}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(task.id); }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => e.preventDefault()}
    >
      {/* ── Card body: left content + optional right steps panel ── */}
      <div className="flex items-stretch">

        {/* ── LEFT: grip + main content ── */}
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3 flex-1 min-w-0">

          {/* Drag handle */}
          <div
            className={`mt-0.5 cursor-grab active:cursor-grabbing shrink-0 ${dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </div>

          {/* Content column */}
          <div className="flex-1 min-w-0">

            {/* ── Title row: dot + title + actions ── */}
            <div className="flex items-start gap-2">
              <span className={`mt-[5px] w-2 h-2 rounded-full shrink-0 ${ps.dot}`} />
              <h3 className={`flex-1 text-[14px] font-semibold leading-snug ${titleColor}`}>
                {task.title}
              </h3>
              {/* Action buttons — stay in title row, right-aligned */}
              <div
                className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                {task.progress > 0 && (
                  <button onClick={() => onUndo(task.id)} className={btnNeutral} title="Undo last step">
                    <RotateCcw size={13} />
                  </button>
                )}
                <button onClick={() => onDuplicate(task.id)} className={btnNeutral} title="Duplicate">
                  <Copy size={13} />
                </button>
                <button onClick={() => onDelete(task.id)} className={btnDel} title={softRemove ? 'Remove from Today' : 'Delete'}>
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* ── Origin breadcrumb ── */}
            {origin && (
              <div className="mt-1.5 flex items-center gap-1 flex-wrap text-[10.5px] font-semibold bg-blue-50/70 dark:bg-blue-950/40 border border-blue-200/50 dark:border-blue-800/50 rounded-lg px-2 py-1 w-full leading-normal">
                <Link2 size={10} className="shrink-0 text-blue-400 mr-0.5" />
                {origin.split(' > ').map((seg, i, arr) => (
                  <span key={i} className="inline-flex items-center gap-1">
                    <span className={i === arr.length - 1
                      ? 'font-bold text-blue-700 dark:text-blue-300'
                      : 'font-medium text-slate-500 dark:text-slate-400'
                    }>{seg}</span>
                    {i < arr.length - 1 && <span className="text-slate-300 dark:text-slate-600">/</span>}
                  </span>
                ))}
              </div>
            )}

            {/* ── Description ── */}
            {task.description && (
              <p className={`mt-1.5 text-[11.5px] leading-snug line-clamp-2 ${dateColor}`}>
                {task.description}
              </p>
            )}

            {/* ── Date / deadline row ── */}
            <div className={`mt-2 flex items-center gap-3 text-[11px] ${dateColor}`}>
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} /> {fmtDate(task.targetDate)}
              </span>
              {task.deadline && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  new Date(task.deadline).getTime() < Date.now() ? 'text-rose-500' : ''
                }`}>
                  <Clock size={11} /> {fmtCountdown(task.deadline)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: steps panel (only when steps exist) ── */}
        {hasSteps && (
          <div className="w-[120px] shrink-0 flex flex-col border-l border-slate-200/70 dark:border-slate-700/60">
            {/* Panel header */}
            <div className="px-3 pt-2.5 pb-2 border-b border-slate-200/60 dark:border-slate-700/50 bg-slate-50/80 dark:bg-slate-800/60">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Micro-steps
              </div>
              <div className="text-[12px] font-bold tabular-nums text-slate-700 dark:text-slate-200 mt-0.5">
                <span className={task.progress === task.steps.length ? 'text-emerald-500' : 'text-slate-700 dark:text-slate-200'}>
                  {task.progress}
                </span>
                <span className="text-slate-400 dark:text-slate-500 font-normal">/{task.steps.length}</span>
                <span className="text-[9px] text-slate-400 dark:text-slate-500 font-normal ml-1">done</span>
              </div>
            </div>

            {/* Steps list */}
            <div className="flex-1 flex flex-col gap-1.5 px-2.5 py-2.5 overflow-y-auto no-scrollbar bg-slate-50/50 dark:bg-slate-800/40">
              {task.steps.map((s, i) => {
                const done = i < task.progress;
                return (
                  <div key={i} className="flex items-start gap-1.5">
                    {/* Circle indicator */}
                    <span className={`
                      mt-[1px] w-4 h-4 rounded-full shrink-0 flex items-center justify-center
                      text-[8px] font-extrabold leading-none
                      ${done
                        ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}
                    `}>
                      {done ? '✓' : i + 1}
                    </span>
                    <span className={`text-[10.5px] leading-snug break-words flex-1 min-w-0 ${
                      done
                        ? 'line-through text-slate-400 dark:text-slate-600'
                        : 'text-slate-700 dark:text-slate-200 font-medium'
                    }`}>
                      {s}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>

      {/* ── Full-width progress bar at bottom ── */}
      <div className={`h-1.5 ${trackBg}`}>
        <div
          className={`h-full progress-bar-fill ${ps.bar}`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
    </div>
  );
}
