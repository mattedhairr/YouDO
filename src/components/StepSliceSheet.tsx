import { useEffect, useState } from 'react';
import { Calendar, CheckSquare, Square, X, Zap } from 'lucide-react';
import type { GoalNode } from '../types';
import { formatDDMMYYYY, todayISO, tomorrowISO } from '../store';
import Overlay from './Overlay';

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
      const targetKey = targetNodes.map((n) => n.id).join('|');
      if (!targetKey) return;
      setSelectedMap(initialMap);
      setDate(todayISO());
    }
    // Open + node identity is enough; targetNodes is derived from nodes/node.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel panel-sheet sheet-up p-5 pb-8 max-h-[85vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-xl bg-primary-soft text-primary border border-primary">
              <Zap size={18} />
            </span>
            <h2 className="text-base font-bold text-content-primary">
              {isMulti ? `Schedule ${targetNodes.length} Tasks` : 'Schedule Task'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Date picker Section */}
        <div className="mb-4 mt-2 p-3.5 rounded-2xl bg-surface border border-subtle">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={15} className="text-primary shrink-0" />
              <span className="text-[12px] font-semibold text-content-primary">Target Date</span>
            </div>
            <span className="text-[12px] font-bold text-primary bg-primary-soft px-2.5 py-0.5 rounded-lg border border-primary tabular-nums">
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
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-elevated text-content-secondary border-subtle hover:border-primary'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDate(tomorrowISO())}
              className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${
                date === tomorrowISO()
                  ? 'bg-primary text-on-primary border-primary'
                  : 'bg-elevated text-content-secondary border-subtle hover:border-primary'
              }`}
            >
              Tomorrow
            </button>
          </div>

          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-elevated border border-subtle rounded-xl px-3 py-2 text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
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
                <div key={n.id} className="p-3.5 rounded-2xl bg-surface border border-subtle">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-content-primary truncate">{n.title}</span>
                    <span className="text-[10px] font-medium text-content-secondary shrink-0">Single card (no steps)</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={n.id} className="p-3.5 rounded-2xl bg-surface border border-subtle space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 pr-2">
                    <h4 className="text-[13px] font-bold text-content-primary truncate">{n.title}</h4>
                    <span className="text-[10.5px] font-semibold text-content-secondary">
                      Steps assigned ({selSet.size}/{steps.length})
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => selectAll(n)} className="text-[11px] font-bold text-primary hover:underline">All</button>
                    <span className="text-content-muted">·</span>
                    <button onClick={() => deselectAll(n)} className="text-[11px] font-bold text-content-secondary hover:text-content-primary">None</button>
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
                            ? 'bg-elevated border-subtle opacity-50 cursor-not-allowed'
                            : isSel
                              ? 'bg-primary-soft border-primary'
                              : 'bg-elevated border-subtle hover:border-content-muted'
                        }`}
                      >
                        {alreadyDone ? (
                          <CheckSquare size={16} className="shrink-0 text-secondary" />
                        ) : isSel ? (
                          <CheckSquare size={16} className="shrink-0 text-primary" />
                        ) : (
                          <Square size={16} className="shrink-0 text-content-secondary" />
                        )}
                        <span className={`flex-1 text-[11.5px] font-semibold ${alreadyDone ? 'text-content-muted line-through' : 'text-content-primary'}`}>
                          Step {i + 1}: {s}
                        </span>
                        {alreadyDone && <span className="text-[9px] uppercase tracking-wide text-secondary font-bold">Done</span>}
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
          className="mt-5 w-full py-3 rounded-xl text-sm font-semibold text-on-primary bg-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          <Zap size={15} className="fill-white" />
          {isMulti
            ? `Schedule ${targetNodes.length} Tasks`
            : totalStepsExist === 0
            ? 'Schedule Task'
            : `Schedule ${totalAssignedSteps} Step${totalAssignedSteps !== 1 ? 's' : ''}`}
        </button>
      </div>
    </Overlay>
  );
}
