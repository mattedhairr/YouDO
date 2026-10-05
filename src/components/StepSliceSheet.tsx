import { useEffect, useState } from 'react';
import { Check, Zap, Calendar } from 'lucide-react';
import type { GoalNode } from '../types';
import { todayISO, tomorrowISO } from '../store';
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
    if (targetNodes.some((n) => n.steps?.length && !selectedMap[n.id]?.size)) return;
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
  const canSchedule = targetNodes.every((n) => !n.steps?.length || (selectedMap[n.id]?.size ?? 0) > 0);

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] max-h-[90vh] flex flex-col gap-3">
        {/* Grab Handle */}
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70 shrink-0" />

        {/* Header */}
        <div className="flex items-center gap-2.5 px-1 shrink-0">
          <div className="w-8 h-8 rounded-xl bg-primary-soft text-primary grid place-items-center shrink-0">
            <Zap size={16} />
          </div>
          <div>
            <h3 className="text-[14px] font-bold text-content-primary leading-tight">
              {isMulti ? `Schedule ${targetNodes.length} Tasks` : 'Schedule Task'}
            </h3>
            <p className="text-[11px] font-medium text-content-muted leading-tight mt-0.5">
              Choose steps for this date
            </p>
          </div>
        </div>

        {/* Date picker Section */}
        <div className="bg-surface border border-subtle rounded-2xl p-4 shadow-sm shrink-0 flex flex-col gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-elevated border border-subtle rounded-xl">
            <button
              type="button"
              onClick={() => setDate(todayISO())}
              className={`flex-1 h-8 rounded-lg text-[12px] font-bold transition-colors ${
                date === todayISO()
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDate(tomorrowISO())}
              className={`flex-1 h-8 rounded-lg text-[12px] font-bold transition-colors ${
                date === tomorrowISO()
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              Tomorrow
            </button>
            <div className="w-px h-4 bg-border mx-0.5 shrink-0" />
            <label className={`relative flex items-center justify-center w-8 h-8 rounded-lg cursor-pointer transition-colors shrink-0 ${
              date !== todayISO() && date !== tomorrowISO()
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-content-secondary hover:text-content-primary hover:bg-surface'
            }`}>
              <Calendar size={15} />
              <input
                type="date"
                value={date}
                onChange={(e) => {
                  if (e.target.value) setDate(e.target.value);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
          
          {date !== todayISO() && date !== tomorrowISO() && (
            <div className="text-[12px] font-semibold text-center text-primary bg-primary-soft/40 rounded-lg py-2 border border-primary/20">
              Selected: {(() => {
                const parts = date.split('-');
                if (parts.length === 3) {
                  return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
                    .toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                }
                return date;
              })()}
            </div>
          )}
        </div>

        {/* Task Steps Lists */}
        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3 min-h-[140px]">
          {targetNodes.map((n) => {
            const steps = n.steps ?? [];
            const stepDone = n.stepDone ?? [];
            const selSet = selectedMap[n.id] ?? new Set();

            if (steps.length === 0) {
              return (
                <div key={n.id} className="bg-surface border border-subtle rounded-2xl p-3.5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-bold text-content-primary truncate">{n.title}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted shrink-0">No steps</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={n.id} className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm flex flex-col">
                <div className="flex items-center justify-between px-3.5 h-10 bg-elevated/40 border-b border-subtle">
                  <h4 className="text-[12px] font-bold text-content-primary truncate">{n.title}</h4>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => selectAll(n)} className="text-[11px] font-bold text-primary hover:underline">All</button>
                    <span className="text-[10px] text-content-muted">·</span>
                    <button onClick={() => deselectAll(n)} className="text-[11px] font-bold text-content-secondary hover:text-content-primary">None</button>
                  </div>
                </div>

                <div className="divide-y divide-subtle">
                  {steps.map((s, i) => {
                    const alreadyDone = stepDone[i];
                    const isSel = selSet.has(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => !alreadyDone && toggleStep(n.id, i)}
                        disabled={alreadyDone}
                        className={`w-full flex items-center gap-3 px-3.5 h-11 text-left transition-colors ${
                          alreadyDone
                            ? 'bg-elevated/50 cursor-not-allowed opacity-60'
                            : isSel
                              ? 'bg-primary-soft/30 hover:bg-primary-soft/50'
                              : 'hover:bg-elevated'
                        }`}
                      >
                        <div className="shrink-0">
                          {alreadyDone ? (
                            <div className="w-5 h-5 rounded-full bg-secondary text-on-primary flex items-center justify-center">
                              <Check size={14} strokeWidth={3} />
                            </div>
                          ) : isSel ? (
                            <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                              <Check size={14} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-[2px] border-content-muted" />
                          )}
                        </div>
                        <span className={`flex-1 text-[13px] font-semibold truncate ${alreadyDone ? 'text-content-muted line-through' : 'text-content-primary'}`}>
                          {s}
                        </span>
                        {alreadyDone && <span className="text-[10px] font-bold uppercase tracking-wider text-secondary shrink-0 ml-2">Done</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-2 shrink-0">
          {!canSchedule && (
            <p className="text-center text-[11px] font-semibold text-error px-2 leading-tight" role="status">
              Choose at least one step for each task.
            </p>
          )}
          <button
            onClick={confirm}
            disabled={!canSchedule}
            className="w-full h-12 rounded-2xl text-[13px] font-bold bg-primary text-on-primary disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 shadow-sm"
          >
            <Zap size={15} className="fill-current" />
            {isMulti
              ? `Schedule ${targetNodes.length} Tasks`
              : totalStepsExist === 0
              ? 'Schedule Task'
              : `Schedule ${totalAssignedSteps} Step${totalAssignedSteps !== 1 ? 's' : ''}`}
          </button>
          
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-surface border border-subtle text-[13px] font-bold text-content-secondary hover:text-content-primary hover:bg-elevated transition-all shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}
