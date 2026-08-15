import { useMemo, useState } from 'react';
import { Check, CheckCircle2, Clock, X } from 'lucide-react';
import Overlay from './Overlay';
import type { ActiveSession, Task } from '../types';
import { computeNetFocusMs } from '../lib/sessionStats';
import { formatDuration, formatWallClock } from '../lib/format';

interface Props {
  open: boolean;
  task: Task;
  session: ActiveSession;
  onCancel: () => void;
  onWasNotWorking: () => void;
  onSave: (payload: {
    endTime: number;
    completed: boolean | 'partial';
    completedStepIndices: number[];
  }) => void;
}

export function SessionReconstructSheet({ open, task, session, onCancel, onWasNotWorking, onSave }: Props) {
  const openedAt = useMemo(() => Date.now(), []);
  const span = Math.max(1, openedAt - session.startTime);
  const [t, setT] = useState(0.5);
  const [selectedSteps, setSelectedSteps] = useState<number[]>([]);

  if (!open) return null;

  const endTime = Math.round(session.startTime + span * t);
  const durationMs = computeNetFocusMs(session, endTime, true);
  const hasSteps = task.steps.length > 0;

  const toggleStep = (index: number) => {
    setSelectedSteps((prev) => (prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]));
  };

  const save = () => {
    if (!hasSteps) {
      onSave({ endTime, completed: true, completedStepIndices: [] });
      return;
    }
    const already = task.progress;
    const resulting = new Set<number>([...Array.from({ length: already }, (_, i) => i), ...selectedSteps]);
    const isAll = resulting.size === task.steps.length;
    const outcome = isAll ? true : selectedSteps.length === 0 ? false : 'partial';
    onSave({ endTime, completed: outcome, completedStepIndices: selectedSteps });
  };

  return (
    <Overlay open={open} onClose={onCancel} align="bottom">
      <div className="panel panel-sheet sheet-up p-5 pb-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-2 mb-4">
          <div>
            <h3 className="text-sm font-semibold text-content-primary">When did you actually stop?</h3>
            <p className="text-[12px] text-content-muted mt-0.5 leading-snug">
              Drag to about when you actually stopped. If you fell asleep, discard this sitting instead.
            </p>
          </div>
          <button onClick={onCancel} className="p-1.5 rounded-lg text-content-muted hover:text-content-primary shrink-0">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm font-semibold text-content-primary mb-4 bg-surface p-3 rounded-[12px] border border-subtle">
          {task.title}
        </p>

        {hasSteps && (
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2">Steps you finished</p>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {task.steps.map((step, idx) => {
                const alreadyDone = idx < task.progress;
                const checked = alreadyDone || selectedSteps.includes(idx);
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={alreadyDone}
                    onClick={() => toggleStep(idx)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-[12px] text-xs text-left border ${
                      alreadyDone
                        ? 'bg-elevated border-subtle text-content-muted'
                        : checked
                          ? 'bg-primary-soft border-primary text-content-primary'
                          : 'bg-surface border-subtle text-content-secondary'
                    }`}
                  >
                    <span className="truncate pr-2">{alreadyDone ? `${step} · already done` : step}</span>
                    <div
                      className={`w-5 h-5 rounded-lg flex items-center justify-center border shrink-0 ${
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

        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted flex items-center gap-1">
              <Clock size={11} /> Stopped around
            </span>
            <span className="text-[12px] font-mono text-content-primary">{formatWallClock(endTime)}</span>
          </div>
          <div className="h-2 rounded-full bg-border-subtle overflow-hidden mb-2">
            <div className="h-full rounded-full bg-primary" style={{ width: `${t * 100}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={1000}
            value={Math.round(t * 1000)}
            onChange={(e) => setT(Number(e.target.value) / 1000)}
            className="w-full accent-[var(--primary)]"
          />
          <div className="flex justify-between text-[11px] text-content-muted mt-1">
            <span>Started {session.wallClockStart}</span>
            <span className="font-semibold text-primary tabular-nums">{formatDuration(durationMs)}</span>
            <span>Now</span>
          </div>
        </div>

        <button
          onClick={save}
          className="w-full py-3 rounded-[12px] btn-primary text-sm font-semibold flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" />
          {hasSteps ? 'Save this session' : 'Mark done at this time'}
        </button>
        <button
          onClick={onWasNotWorking}
          className="w-full mt-2 py-2.5 rounded-[12px] text-[13px] font-medium text-content-secondary"
        >
          I fell asleep — discard completely
        </button>
      </div>
    </Overlay>
  );
}
