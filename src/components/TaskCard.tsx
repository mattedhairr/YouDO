import { Calendar, Clock, Copy, GripVertical, Link2, RotateCcw, X } from 'lucide-react';
import type { Priority, Task } from '../types';

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

const priorityStyles: Record<Priority, { dot: string; label: string; bar: string; text: string }> = {
  high: { dot: 'bg-rose-500', label: 'High', bar: 'bg-rose-500', text: 'text-rose-600' },
  medium: { dot: 'bg-amber-500', label: 'Medium', bar: 'bg-amber-500', text: 'text-amber-600' },
  low: { dot: 'bg-emerald-500', label: 'Low', bar: 'bg-emerald-500', text: 'text-emerald-600' },
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
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h left`;
}

export default function TaskCard({
  task, onAdvance, onUndo, onDelete, onDuplicate,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, origin, softRemove, dark = false,
}: Props) {
  const ps = priorityStyles[task.priority];
  const total = task.steps.length || 1;
  const fillPct = (task.progress / total) * 100;
  const complete = task.progress >= total && task.steps.length > 0;

  const titleColor = complete
    ? 'line-through text-slate-400 dark:text-slate-500'
    : 'text-slate-800 dark:text-slate-100 font-semibold';
  const descColor = dark ? 'text-slate-400' : 'text-slate-500';
  const dateColor = dark ? 'text-slate-400' : 'text-slate-500';
  const stepDoneBg = dark ? 'bg-slate-700/60 border-slate-600 text-slate-400 line-through' : 'bg-slate-100 border-slate-200 text-slate-600';
  const stepTodoBg = dark ? 'bg-slate-800/80 border-slate-700 text-slate-300' : 'bg-white border-slate-200 text-slate-700';
  const trackBg = dark ? 'bg-slate-800' : 'bg-slate-100';
  const gripColor = dark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-300 hover:text-slate-600';
  const btnColor = dark ? 'text-slate-400 hover:text-blue-400 hover:bg-white/5' : 'text-slate-400 hover:text-blue-600 hover:bg-blue-50';
  const delBtn = dark ? 'text-slate-400 hover:text-rose-400 hover:bg-rose-900/30' : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50';
  const dupBtn = dark ? 'text-slate-400 hover:text-emerald-400 hover:bg-emerald-900/30' : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50';

  return (
    <div
      className={`card p-3.5 transition-all ${isDragging ? 'dragging-card' : ''} ${dragOver ? 'ring-2 ring-blue-400' : ''} ${complete ? 'opacity-60' : ''}`}
      onClick={() => !complete && onAdvance(task.id)}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task.id); }}
      onDragEnter={(e) => { e.preventDefault(); onDragEnter(task.id); }}
      onDragOver={(e) => e.preventDefault()}
      onDragEnd={onDragEnd}
      onDrop={(e) => e.preventDefault()}
    >
      <div className="flex items-start gap-2.5">
        <div className={`mt-1 cursor-grab active:cursor-grabbing ${gripColor}`} onClick={(e) => e.stopPropagation()}>
          <GripVertical size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${ps.dot}`} />
            <h3 className={`text-[14px] font-semibold leading-tight ${titleColor}`}>{task.title}</h3>
          </div>
          {origin && (
            <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md px-1.5 py-0.5">
              <Link2 size={9} />
              <span className="truncate max-w-[200px]">{origin}</span>
            </div>
          )}
          {task.description && (
            <p className={`mt-1 text-[12px] ${descColor} leading-snug line-clamp-2`}>{task.description}</p>
          )}
          {task.steps.length > 0 && (
            <div className="mt-2 flex items-center gap-1.5 flex-wrap">
              {task.steps.map((s, i) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded-md border transition-colors ${i < task.progress ? stepDoneBg : stepTodoBg}`}>
                  {i < task.progress ? '✓' : `${i + 1}.`} {s}
                </span>
              ))}
            </div>
          )}
          <div className={`mt-2 flex items-center gap-3 text-[11px] ${dateColor}`}>
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> {fmtDate(task.targetDate)}</span>
            {task.deadline && (
              <span className={`inline-flex items-center gap-1 ${new Date(task.deadline).getTime() < Date.now() ? 'text-rose-500' : ''}`}>
                <Clock size={11} /> {fmtCountdown(task.deadline)}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center gap-0.5">
          {task.progress > 0 && (
            <button onClick={(e) => { e.stopPropagation(); onUndo(task.id); }} className={`p-1.5 rounded-lg transition-colors ${btnColor}`} title="Undo last step">
              <RotateCcw size={14} />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); onDuplicate(task.id); }} className={`p-1.5 rounded-lg transition-colors ${dupBtn}`} title="Duplicate task">
            <Copy size={14} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onDelete(task.id); }} className={`p-1.5 rounded-lg transition-colors ${delBtn}`} title={softRemove ? 'Remove from Today' : 'Delete task'}>
            <X size={14} />
          </button>
        </div>
      </div>
      <div className={`mt-3 h-1.5 rounded-full ${trackBg} overflow-hidden`}>
        <div className={`h-full rounded-full transition-all duration-500 ${ps.bar}`} style={{ width: `${fillPct}%` }} />
      </div>
    </div>
  );
}
