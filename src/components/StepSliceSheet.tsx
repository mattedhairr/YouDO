import { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Sparkles, Square, X, Zap } from 'lucide-react';
import type { GoalNode } from '../types';

interface Props {
  open: boolean;
  node: GoalNode | null;
  onClose: () => void;
  onConfirm: (nodeId: string, stepSlice: number[], targetDate: string) => void;
}

function formatDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return formatDateISO(new Date());
}

function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return formatDateISO(d);
}

function nextMondayISO(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 1 : 8 - day;
  d.setDate(d.getDate() + diff);
  return formatDateISO(d);
}

export default function StepSliceSheet({ open, node, onClose, onConfirm }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (open && node) {
      if (node.steps && node.steps.length > 0) {
        const stepDone = node.stepDone ?? [];
        const remaining = node.steps.map((_, i) => i).filter((i) => !stepDone[i]);
        setSelected(new Set(remaining.length ? remaining : node.steps.map((_, i) => i)));
      } else {
        setSelected(new Set());
      }
      setDate(todayISO());
    }
  }, [open, node]);

  if (!open || !node) return null;

  const steps = node.steps ?? [];
  const stepDone = node.stepDone ?? [];

  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const selectAll = () => setSelected(new Set(steps.map((_, i) => i)));
  const deselectAll = () => setSelected(new Set());

  const confirm = () => {
    const slice = [...selected].sort((a, b) => a - b);
    if (steps.length > 0 && slice.length === 0) return;
    onConfirm(node.id, slice, date);
    onClose();
  };

  const presetDates = [
    { label: 'Today', value: todayISO() },
    { label: 'Tomorrow', value: tomorrowISO() },
    { label: 'Next Monday', value: nextMondayISO() },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-white dark:bg-slate-800 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-500">
              <Zap size={18} />
            </span>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Schedule Task</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4 ml-8">
          Target date & steps for <span className="font-semibold text-slate-700 dark:text-slate-200">{node.title}</span>
        </p>

        {/* Date picker with Presets */}
        <div className="mb-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200/80 dark:border-slate-600/80">
          <div className="flex items-center gap-2 mb-2.5">
            <Calendar size={15} className="text-blue-500 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">Choose Target Date</span>
          </div>

          <div className="flex items-center gap-1.5 mb-2.5 flex-wrap">
            {presetDates.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => setDate(preset.value)}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all ${
                  date === preset.value
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-blue-300'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Steps Selection */}
        {steps.length === 0 ? (
          <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40 text-center my-2">
            <Sparkles size={18} className="mx-auto text-blue-500 mb-1" />
            <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
              Single-card task (no sub-steps). It will be scheduled for <span className="font-bold text-blue-600 dark:text-blue-400">{date}</span>.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-400">
                Steps to assign ({selected.size}/{steps.length})
              </span>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline">All</button>
                <span className="text-slate-300 dark:text-slate-600">·</span>
                <button onClick={deselectAll} className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">None</button>
              </div>
            </div>
            <div className="space-y-2">
              {steps.map((s, i) => {
                const alreadyDone = stepDone[i];
                const isSel = selected.has(i);
                return (
                  <button
                    key={i}
                    onClick={() => !alreadyDone && toggle(i)}
                    disabled={alreadyDone}
                    className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl border text-left transition-all ${
                      alreadyDone
                        ? 'bg-slate-50 dark:bg-slate-700/40 border-slate-200 dark:border-slate-700 opacity-50 cursor-not-allowed'
                        : isSel
                          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-500'
                          : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500'
                    }`}
                  >
                    {alreadyDone ? (
                      <CheckSquare size={18} className="shrink-0 text-emerald-500" />
                    ) : isSel ? (
                      <CheckSquare size={18} className="shrink-0 text-blue-500" />
                    ) : (
                      <Square size={18} className="shrink-0 text-slate-300 dark:text-slate-500" />
                    )}
                    <span className={`flex-1 text-xs font-semibold ${alreadyDone ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-700 dark:text-slate-200'}`}>
                      Step {i + 1}: {s}
                    </span>
                    {alreadyDone && <span className="text-[9px] uppercase tracking-wide text-emerald-600 dark:text-emerald-400 font-bold">Done</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={confirm}
          disabled={steps.length > 0 && selected.size === 0}
          className="mt-5 w-full py-3 rounded-2xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Zap size={15} />
          {steps.length === 0 ? 'Schedule Task' : `Schedule ${selected.size} Step${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}

