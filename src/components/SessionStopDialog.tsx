import { useState } from 'react';
import { CheckCircle2, X, Check, Clock, Trash2 } from 'lucide-react';
import Overlay from './Overlay';
import type { Task } from '../types';

interface Props {
  open: boolean;
  task: Task;
  onConfirm: (outcome: { completed: boolean | 'partial'; completedStepIndices: number[] }) => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SessionStopDialog({ open, task, onConfirm, onDiscard, onCancel }: Props) {
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);

  if (!open) return null;

  const hasSteps = task.steps.length > 0;

  const toggleStep = (index: number) => {
    setSelectedSteps((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleSaveSitting = () => {
    if (!hasSteps) {
      onConfirm({ completed: false, completedStepIndices: [] });
      return;
    }
    const already = task.progress;
    const resulting = new Set<number>([
      ...Array.from({ length: already }, (_, i) => i),
      ...selectedSteps,
    ]);
    const isAll = resulting.size === task.steps.length;
    const isNone = selectedSteps.length === 0;
    const outcome = isAll ? true : isNone ? false : 'partial';
    onConfirm({ completed: outcome, completedStepIndices: selectedSteps });
  };

  const handleMarkDone = () => {
    const allIndices = hasSteps ? task.steps.map((_, i) => i) : [];
    onConfirm({ completed: true, completedStepIndices: allIndices });
  };

  return (
    <Overlay open={open} onClose={onCancel} align="bottom">
      <div className="panel panel-sheet sheet-up p-5 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-subtle">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary-soft border border-primary flex items-center justify-center text-primary">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-content-primary">End sitting</h3>
              <p className="text-xs text-content-secondary">Keep the time, finish the task, or discard</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-elevated transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm font-semibold text-content-primary mb-4 bg-surface p-3 rounded-xl border border-subtle">
          {task.title}
        </p>

        {hasSteps && (
          <div className="mb-5">
            <label className="block text-xs font-semibold text-content-secondary mb-2">
              Steps done in this sitting (optional)
            </label>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {task.steps.map((step, idx) => {
                const alreadyDone = idx < task.progress;
                const checked = alreadyDone || selectedSteps.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={alreadyDone}
                    onClick={() => toggleStep(idx)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs text-left transition border ${
                      alreadyDone
                        ? 'bg-elevated border-subtle text-content-muted'
                        : checked
                          ? 'bg-primary-soft border-primary text-content-primary'
                          : 'bg-surface border-subtle text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <span className="truncate pr-2">{alreadyDone ? `${step} · already done` : step}</span>
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center border transition ${
                        checked ? 'bg-primary border-primary text-on-primary' : 'border-2 border-[color:var(--text-muted)]'
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

        <div className="flex flex-col gap-2">
          <button
            onClick={handleSaveSitting}
            className="w-full py-3.5 rounded-xl btn-primary text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            <Clock className="w-5 h-5" />
            Save sitting
          </button>
          <p className="text-[11px] text-content-muted text-center -mt-1 mb-1">
            Keeps this focus time. Task stays open unless every step is done.
          </p>

          <button
            onClick={handleMarkDone}
            className="w-full py-3 rounded-xl bg-secondary/10 border border-secondary/30 text-secondary text-sm font-semibold flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            Save and mark task done
          </button>

          <button
            onClick={onDiscard}
            className="w-full py-3 rounded-xl text-content-secondary text-sm font-medium flex items-center justify-center gap-2 hover:text-error"
          >
            <Trash2 className="w-4 h-4" />
            Discard sitting
          </button>
        </div>
      </div>
    </Overlay>
  );
}
