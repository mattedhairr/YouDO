import { useState } from 'react';
import { Check, Clock, StickyNote, Trash2, Circle } from 'lucide-react';
import Overlay from './Overlay';
import type { SessionStopOutcome, Task } from '../types';
import { hapticTick, hapticWarn } from '../lib/haptics';

interface Props {
  open: boolean;
  error?: string;
  task: Task;
  onConfirm: (outcome: SessionStopOutcome) => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function SessionStopDialog({ open, task, onConfirm, onDiscard, onCancel, error }: Props) {
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);
  const [markTaskDone, setMarkTaskDone] = useState(false);
  const [resumeNote, setResumeNote] = useState(task.resumeNote ?? '');

  if (!open) return null;

  const hasSteps = task.steps.length > 0;
  const resultingStepCount = new Set([
    ...Array.from({ length: task.progress }, (_, index) => index),
    ...selectedSteps,
  ]).size;
  const willComplete = hasSteps ? resultingStepCount === task.steps.length : markTaskDone;

  const toggleStep = (index: number) => {
    hapticTick();
    setSelectedSteps((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
    );
  };

  const handleToggleTaskDone = () => {
    hapticTick();
    setMarkTaskDone((v) => !v);
  };

  const handleSaveProgress = () => {
    if (!hasSteps) {
      onConfirm({
        completed: markTaskDone,
        completedStepIndices: [],
        resumeNote: markTaskDone ? undefined : resumeNote.trim() || undefined,
      });
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
    onConfirm({
      completed: outcome,
      completedStepIndices: selectedSteps,
      resumeNote: isAll ? undefined : resumeNote.trim() || undefined,
    });
  };

  const handleDiscard = () => {
    hapticWarn();
    onDiscard();
  };

  return (
    <Overlay open={open} onClose={onCancel} align="bottom">
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-3 overflow-y-auto no-scrollbar [&>*]:shrink-0">
        {/* Grab Handle */}
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70 shrink-0" />

        {/* Task Title Card */}
        <div className="bg-surface border border-subtle rounded-2xl p-3.5 shadow-sm flex items-start gap-3 shrink-0">
          <div className="w-9 h-9 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Clock className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[14px] font-bold text-content-primary truncate">{task.title}</h3>
            <p className="text-[11px] font-medium text-content-muted mt-0.5">Save your focus time for this sitting</p>
          </div>
        </div>

        {hasSteps ? (
          <div className="shrink-0 flex flex-col gap-1.5">
            <label className="px-2 text-[10.5px] font-bold uppercase tracking-wider text-content-muted">
              What did you complete?
            </label>
            <div className="bg-surface border border-subtle rounded-2xl overflow-hidden divide-y divide-subtle shadow-sm">
              {task.steps.map((step, idx) => {
                const alreadyDone = idx < task.progress;
                const checked = alreadyDone || selectedSteps.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={alreadyDone}
                    onClick={() => toggleStep(idx)}
                    className={`w-full flex items-center gap-3 px-3.5 h-12 text-left transition-colors ${
                      alreadyDone
                        ? 'bg-elevated/50 cursor-not-allowed opacity-60'
                        : checked
                          ? 'bg-primary-soft/30 hover:bg-primary-soft/50'
                          : 'hover:bg-elevated'
                    }`}
                  >
                    <div className="shrink-0">
                      {checked ? (
                        <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>
                      ) : (
                        <Circle className="w-5 h-5 text-content-muted" strokeWidth={2} />
                      )}
                    </div>
                    <span className="truncate flex-1 text-[13px] font-semibold text-content-primary">
                      {step}
                    </span>
                    {alreadyDone && <span className="text-[10px] font-bold uppercase tracking-wider text-secondary shrink-0">Done</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="shrink-0">
            <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
              <button
                type="button"
                onClick={handleToggleTaskDone}
                className={`w-full flex items-center gap-3 px-3.5 h-12 text-left transition-colors ${
                  markTaskDone
                    ? 'bg-primary-soft/30 hover:bg-primary-soft/50'
                    : 'hover:bg-elevated'
                }`}
              >
                <div className="shrink-0">
                  {markTaskDone ? (
                    <div className="w-5 h-5 rounded-full bg-primary text-on-primary flex items-center justify-center">
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  ) : (
                    <Circle className="w-5 h-5 text-content-muted" strokeWidth={2} />
                  )}
                </div>
                <span className="text-[13px] font-semibold text-content-primary">Mark task done</span>
              </button>
            </div>
          </div>
        )}

        {!willComplete && (
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm flex flex-col shrink-0 mt-1">
            <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
              <StickyNote className="w-4 h-4 text-primary" />
              <span className="text-[12px] font-bold text-content-primary">Continue from here <span className="font-medium text-content-muted">(optional)</span></span>
            </div>
            <textarea
              value={resumeNote}
              onChange={(event) => setResumeNote(event.target.value)}
              rows={3}
              maxLength={280}
              placeholder="Example: Resume from question 18; revise the last formula first."
              className="w-full bg-transparent px-3.5 py-2 text-[13px] font-medium leading-relaxed text-content-primary placeholder:text-content-muted outline-none resize-none"
            />
          </div>
        )}

        <div className="flex flex-col gap-2 mt-2 shrink-0">
          {error && <p role="alert" className="text-[12px] font-semibold text-error px-2">{error}</p>}
          <button
            onClick={handleSaveProgress}
            className="w-full h-12 rounded-2xl btn-primary text-[13px] font-bold flex items-center justify-center gap-2"
          >
            <Clock className="w-5 h-5" />
            Save progress
          </button>
          <p className="text-[10px] text-content-muted text-center px-4 leading-tight mb-2">
            {hasSteps
              ? 'Keeps focus time. Completes the task only if every step is done.'
              : markTaskDone
                ? 'Keeps focus time and marks the task done.'
                : 'Keeps focus time. Task stays open.'}
          </p>

          <button
            onClick={handleDiscard}
            className="w-full h-12 rounded-2xl text-[13px] font-bold text-error hover:bg-error-soft/50 transition-colors flex items-center justify-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            Discard sitting
          </button>
        </div>
      </div>
    </Overlay>
  );
}
