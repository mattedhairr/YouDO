import { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Sparkles, Square, X, Zap } from 'lucide-react';
import type { GoalNode } from '../types';
import { formatDDMMYYYY, todayISO } from '../store';

interface Props {
  open: boolean;
  nodes?: GoalNode[];
  node?: GoalNode | null;
  onClose: () => void;
  onConfirm: (nodeIds: string[], stepSlice: number[] | undefined, targetDate: string) => void;
}

export default function StepSliceSheet({ open, nodes, node, onClose, onConfirm }: Props) {
  const targetNodes = nodes && nodes.length > 0 ? nodes : node ? [node] : [];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (open && targetNodes.length > 0) {
      const singleNode = targetNodes.length === 1 ? targetNodes[0] : null;
      if (singleNode && singleNode.steps && singleNode.steps.length > 0) {
        const stepDone = singleNode.stepDone ?? [];
        const remaining = singleNode.steps.map((_, i) => i).filter((i) => !stepDone[i]);
        setSelected(new Set(remaining.length ? remaining : singleNode.steps.map((_, i) => i)));
      } else {
        setSelected(new Set());
      }
      setDate(todayISO());
    }
  }, [open, nodes, node]);

  if (!open || targetNodes.length === 0) return null;

  const isMulti = targetNodes.length > 1;
  const singleNode = !isMulti ? targetNodes[0] : null;
  const steps = singleNode?.steps ?? [];
  const stepDone = singleNode?.stepDone ?? [];

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
    const nodeIds = targetNodes.map((n) => n.id);
    if (!isMulti && steps.length > 0) {
      const slice = [...selected].sort((a, b) => a - b);
      if (slice.length === 0) return;
      onConfirm(nodeIds, slice, date);
    } else {
      onConfirm(nodeIds, undefined, date);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-white dark:bg-slate-800 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl border-t border-slate-100 dark:border-slate-700">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-blue-50 dark:bg-blue-900/30 text-blue-500">
              <Zap size={18} />
            </span>
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              {isMulti ? `Schedule ${targetNodes.length} Tasks` : 'Schedule Task'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Subtitle / Selected Nodes List */}
        {isMulti ? (
          <div className="mb-4 ml-8">
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-2">
              The following <span className="font-semibold text-slate-700 dark:text-slate-200">{targetNodes.length} tasks</span> will be scheduled:
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {targetNodes.map((n) => (
                <span
                  key={n.id}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 truncate max-w-[200px]"
                >
                  {n.title}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4 ml-8">
            Target date & steps for <span className="font-semibold text-slate-700 dark:text-slate-200">{singleNode?.title}</span>
          </p>
        )}

        {/* Date picker Section with DD-MM-YYYY format badge */}
        <div className="mb-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-700/50 border border-slate-200/80 dark:border-slate-600/80">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-blue-500 shrink-0" />
              <span className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">Target Date</span>
            </div>
            <span className="text-[12px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 rounded-lg border border-blue-200 dark:border-blue-800 tabular-nums">
              {formatDDMMYYYY(date)}
            </span>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 dark:focus:border-blue-500 transition-colors"
          />
        </div>

        {/* Single-task Micro-step Chips */}
        {!isMulti && (
          steps.length === 0 ? (
            <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/40 text-center my-2">
              <Sparkles size={18} className="mx-auto text-blue-500 mb-1" />
              <p className="text-[12px] font-medium text-slate-600 dark:text-slate-300">
                Single-card task (no sub-steps). It will be scheduled for <span className="font-bold text-blue-600 dark:text-blue-400">{formatDDMMYYYY(date)}</span>.
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
          )
        )}

        <button
          onClick={confirm}
          disabled={!isMulti && steps.length > 0 && selected.size === 0}
          className="mt-5 w-full py-3 rounded-2xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Zap size={15} />
          {isMulti
            ? `Schedule ${targetNodes.length} Tasks`
            : steps.length === 0
            ? 'Schedule Task'
            : `Schedule ${selected.size} Step${selected.size !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
