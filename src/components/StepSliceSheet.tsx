import { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Square, X, Zap } from 'lucide-react';
import type { GoalNode } from '../types';
import { formatDDMMYYYY, todayISO, tomorrowISO } from '../store';

export interface NodePlan {
  nodeId: string;
  stepSlice?: number[];
}

interface Props {
  open: boolean;
  nodes?: GoalNode[];
  node?: GoalNode | null;
  onClose: () => void;
  onConfirm: (plans: NodePlan[], targetDate: string) => void;
}

export default function StepSliceSheet({ open, nodes, node, onClose, onConfirm }: Props) {
  const targetNodes = nodes && nodes.length > 0 ? nodes : node ? [node] : [];
  // Map of nodeId -> Set of selected step indices
  const [selectedMap, setSelectedMap] = useState<Record<string, Set<number>>>({});
  const [date, setDate] = useState(todayISO());

  useEffect(() => {
    if (open && targetNodes.length > 0) {
      const initialMap: Record<string, Set<number>> = {};
      for (const n of targetNodes) {
        if (n.steps && n.steps.length > 0) {
          const stepDone = n.stepDone ?? [];
          const remaining = n.steps.map((_, i) => i).filter((i) => !stepDone[i]);
          initialMap[n.id] = new Set(remaining.length ? remaining : n.steps.map((_, i) => i));
        } else {
          initialMap[n.id] = new Set();
        }
      }
      setSelectedMap(initialMap);
      setDate(todayISO());
    }
  }, [open, nodes, node]);

  if (!open || targetNodes.length === 0) return null;

  const isMulti = targetNodes.length > 1;

  const toggleStep = (nodeId: string, i: number) => {
    setSelectedMap((prev) => {
      const cur = new Set(prev[nodeId] ?? []);
      if (cur.has(i)) cur.delete(i);
      else cur.add(i);
      return { ...prev, [nodeId]: cur };
    });
  };

  const selectAll = (n: GoalNode) => {
    const steps = n.steps ?? [];
    setSelectedMap((prev) => ({
      ...prev,
      [n.id]: new Set(steps.map((_, i) => i)),
    }));
  };

  const deselectAll = (n: GoalNode) => {
    setSelectedMap((prev) => ({
      ...prev,
      [n.id]: new Set(),
    }));
  };

  const confirm = () => {
    const plans: NodePlan[] = targetNodes.map((n) => {
      const steps = n.steps ?? [];
      if (steps.length > 0) {
        const set = selectedMap[n.id] ?? new Set();
        const slice = [...set].sort((a, b) => a - b);
        return { nodeId: n.id, stepSlice: slice };
      }
      return { nodeId: n.id, stepSlice: undefined };
    });
    onConfirm(plans, date);
    onClose();
  };

  // Calculate total steps assigned
  let totalAssignedSteps = 0;
  let totalStepsExist = 0;
  for (const n of targetNodes) {
    const count = n.steps?.length ?? 0;
    totalStepsExist += count;
    if (count > 0) {
      totalAssignedSteps += (selectedMap[n.id]?.size ?? 0);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-[#14111F] rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto no-scrollbar shadow-2xl border-t border-white/10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-violet-600/20 text-violet-400 border border-violet-500/30">
              <Zap size={18} />
            </span>
            <h2 className="text-base font-bold text-slate-100">
              {isMulti ? `Schedule ${targetNodes.length} Tasks` : 'Schedule Task'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Date picker Section */}
        <div className="mb-4 mt-2 p-3.5 rounded-2xl bg-[#1D1930] border border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-violet-400 shrink-0" />
              <span className="text-[12px] font-semibold text-slate-200">Target Date</span>
            </div>
            <span className="text-[12px] font-bold text-violet-300 bg-violet-600/20 px-2.5 py-0.5 rounded-lg border border-violet-500/30 tabular-nums">
              {formatDDMMYYYY(date)}
            </span>
          </div>

          {/* Quick Schedule Templates */}
          <div className="flex items-center gap-2 mb-2.5">
            <button
              type="button"
              onClick={() => setDate(todayISO())}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                date === todayISO()
                  ? 'bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-600/20'
                  : 'bg-[#14111F] text-slate-200 border-white/10 hover:border-violet-500/50'
              }`}
            >
              📅 Today
            </button>
            <button
              type="button"
              onClick={() => setDate(tomorrowISO())}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                date === tomorrowISO()
                  ? 'bg-violet-600 text-white border-violet-500 shadow-sm shadow-violet-600/20'
                  : 'bg-[#14111F] text-slate-200 border-white/10 hover:border-violet-500/50'
              }`}
            >
              🌅 Tomorrow
            </button>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ colorScheme: 'dark' }}
            className="w-full bg-[#14111F] border border-white/10 rounded-xl px-3 py-2 text-[13px] font-medium text-slate-100 outline-none focus:border-violet-500 transition-colors"
          />
        </div>

        {/* Micro-steps selection list for each task */}
        <div className="space-y-4">
          {targetNodes.map((n) => {
            const steps = n.steps ?? [];
            const stepDone = n.stepDone ?? [];
            const selSet = selectedMap[n.id] ?? new Set();

            if (steps.length === 0) {
              return (
                <div key={n.id} className="p-3.5 rounded-2xl bg-[#1D1930]/60 border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-slate-100 truncate">{n.title}</span>
                    <span className="text-[10px] font-medium text-slate-400 shrink-0">Single card (no steps)</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={n.id} className="p-3.5 rounded-2xl bg-[#1D1930]/60 border border-white/5 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-[13px] font-bold text-slate-100 truncate">{n.title}</h4>
                    <span className="text-[10.5px] font-semibold text-slate-400">
                      Steps assigned ({selSet.size}/{steps.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => selectAll(n)} className="text-[11px] font-bold text-violet-400 hover:underline">All</button>
                    <span className="text-slate-600">·</span>
                    <button onClick={() => deselectAll(n)} className="text-[11px] font-bold text-slate-500 hover:text-slate-300">None</button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {steps.map((s, i) => {
                    const alreadyDone = stepDone[i];
                    const isSel = selSet.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => !alreadyDone && toggleStep(n.id, i)}
                        disabled={alreadyDone}
                        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all ${
                          alreadyDone
                            ? 'bg-slate-800/40 border-white/5 opacity-50 cursor-not-allowed'
                            : isSel
                              ? 'bg-violet-600/20 border-violet-500/50'
                              : 'bg-[#14111F] border-white/10 hover:border-white/20'
                        }`}
                      >
                        {alreadyDone ? (
                          <CheckSquare size={16} className="shrink-0 text-emerald-500" />
                        ) : isSel ? (
                          <CheckSquare size={16} className="shrink-0 text-violet-400" />
                        ) : (
                          <Square size={16} className="shrink-0 text-slate-500" />
                        )}
                        <span className={`flex-1 text-[11.5px] font-semibold ${alreadyDone ? 'text-slate-500 line-through' : 'text-slate-200'}`}>
                          Step {i + 1}: {s}
                        </span>
                        {alreadyDone && <span className="text-[9px] uppercase tracking-wide text-emerald-400 font-bold">Done</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={confirm}
          className="mt-5 w-full py-3 rounded-2xl text-sm font-semibold text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md shadow-violet-600/20 active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Zap size={15} className="fill-white" />
          {isMulti
            ? `Schedule ${targetNodes.length} Tasks`
            : totalStepsExist === 0
            ? 'Schedule Task'
            : `Schedule ${totalAssignedSteps} Step${totalAssignedSteps !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}
