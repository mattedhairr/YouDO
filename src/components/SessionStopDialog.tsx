import { useState } from 'react';
import { CheckCircle2, AlertCircle, X, Check, Clock } from 'lucide-react';
import type { Task } from '../types';

interface Props {
  open: boolean;
  task: Task;
  onConfirm: (outcome: { completed: boolean | 'partial'; completedStepIndices: number[] }) => void;
  onCancel: () => void;
}

export function SessionStopDialog({ open, task, onConfirm, onCancel }: Props) {
  const [selectedSteps, setSelectedSteps] = useState<number[]>(() => {
    // Pre-select steps up to task.progress
    const initial: number[] = [];
    for (let i = 0; i < task.progress; i++) {
      initial.push(i);
    }
    return initial;
  });

  if (!open) return null;

  const hasSteps = task.steps.length > 0;

  const toggleStep = (index: number) => {
    setSelectedSteps((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleOutcome = (outcome: boolean | 'partial') => {
    if (outcome === true && hasSteps) {
      const allIndices = task.steps.map((_, i) => i);
      onConfirm({ completed: true, completedStepIndices: allIndices });
    } else if (outcome === false) {
      onConfirm({ completed: false, completedStepIndices: [] });
    } else {
      onConfirm({ completed: outcome, completedStepIndices: selectedSteps });
    }
  };

  const handleSaveStepsProgress = () => {
    const isAll = selectedSteps.length === task.steps.length;
    const isNone = selectedSteps.length === 0;
    const outcome = isAll ? true : isNone ? false : 'partial';
    onConfirm({ completed: outcome, completedStepIndices: selectedSteps });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 modal-backdrop animate-fade-in">
      <div className="relative w-full max-w-md bg-[#14111F] card border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl sheet-up max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Session Completed</h3>
              <p className="text-xs text-slate-400">How did it go?</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Task Title */}
        <p className="text-sm font-semibold text-slate-200 mb-4 bg-[#1D1930] p-3 rounded-xl border border-white/5">
          {task.title}
        </p>

        {/* Micro-steps Checklist (if any exist) */}
        {hasSteps && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Select steps completed during this session:
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {task.steps.map((step, idx) => {
                const checked = selectedSteps.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => toggleStep(idx)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs text-left transition border ${
                      checked
                        ? 'bg-violet-600/15 border-violet-500/40 text-slate-100'
                        : 'bg-[#1D1930] border-white/5 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <span className="truncate pr-2">{step}</span>
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                        checked ? 'bg-violet-600 border-violet-500 text-white' : 'border-white/20'
                      }`}
                    >
                      {checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Outcome Action Buttons */}
        {hasSteps ? (
          <button
            onClick={handleSaveStepsProgress}
            className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-bold flex items-center justify-center gap-2 transition shadow-md shadow-violet-600/20 active:scale-[0.98]"
          >
            <CheckCircle2 className="w-5 h-5" />
            Save Progress
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 pt-2">
            <button
              onClick={() => handleOutcome(true)}
              className="py-3 px-2 rounded-xl bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 text-xs font-bold flex flex-col items-center justify-center gap-1 transition"
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Completed
            </button>

            <button
              onClick={() => handleOutcome(false)}
              className="py-3 px-2 rounded-xl bg-slate-800 border border-white/10 hover:bg-slate-700 text-slate-300 text-xs font-bold flex flex-col items-center justify-center gap-1 transition"
            >
              <AlertCircle className="w-4 h-4 text-slate-400" />
              Not Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
