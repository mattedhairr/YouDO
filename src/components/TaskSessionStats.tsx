import { useState } from 'react';
import { X, Clock, BarChart2, Timer, Info } from 'lucide-react';
import Overlay from './Overlay';
import type { TaskSession } from '../types';
import { formatDuration, sessionEfficiency } from '../lib/format';
import { isCountableSession } from '../lib/sessionStats';

interface Props {
  open: boolean;
  title: string;
  sessions: TaskSession[];
  stepTotal?: number;
  onClose: () => void;
}

function efficiencyColor(pct: number): string {
  if (pct >= 80) return 'text-secondary';
  if (pct >= 55) return 'text-accent';
  return 'text-error';
}

function remainingAfterSession(
  remaining: number,
  stepTotal: number,
): string | null {
  if (stepTotal <= 0) return null;
  if (remaining <= 0) return 'Whole task completed';
  if (remaining === 1) return '1 step task remaining to complete the whole task';
  return `${remaining} step tasks remaining to complete the whole task`;
}

function remainingBySessionId(sessions: TaskSession[], stepTotal: number): Map<string, number> {
  const map = new Map<string, number>();
  if (stepTotal <= 0) return map;
  const done = new Set<number>();
  [...sessions].sort((a, b) => a.startTime - b.startTime).forEach((s) => {
    (s.completedStepIndices ?? []).forEach((i) => done.add(i));
    map.set(s.id, s.completed === true ? 0 : Math.max(0, stepTotal - done.size));
  });
  return map;
}

function sessionNote(
  s: TaskSession,
  stepTotal: number,
): { kind: 'done' | 'failed'; text: string } {
  const marked = s.completedStepIndices?.length ?? 0;
  if (s.completed === true) {
    return {
      kind: 'done',
      text: marked > 0 ? `Completed · ${marked} step task${marked > 1 ? 's' : ''}` : 'Task completed',
    };
  }
  if (marked > 0) {
    return {
      kind: 'done',
      text: `Completed ${marked} step task${marked > 1 ? 's' : ''}`,
    };
  }
  if (stepTotal <= 0) {
    return { kind: 'failed', text: 'Failed to complete the task' };
  }
  if (stepTotal === 1) {
    return { kind: 'failed', text: 'Failed to complete the step task' };
  }
  return { kind: 'failed', text: `Failed to complete any of ${stepTotal} step tasks` };
}

export function TaskSessionStats({ open, title, sessions, stepTotal = 0, onClose }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  if (!open) return null;

  const remainingMap = remainingBySessionId(sessions, stepTotal);
  const counted = sessions.filter(isCountableSession);
  const totalNFT = counted.reduce((acc, s) => acc + s.netFocusMs, 0);
  const totalDurationMs = counted.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
  const avgEff =
    counted.length === 0
      ? 0
      : Math.round(
          counted.reduce((acc, s) => acc + sessionEfficiency(s.netFocusMs, s.endTime - s.startTime), 0) /
            counted.length,
        );

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel panel-sheet sheet-up max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-border" />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[13px] font-semibold text-content-primary leading-tight">Session analytics</h3>
              <p className="text-[10.5px] text-content-secondary truncate mt-0.5">{title}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowHelp((v) => !v)}
              className={`p-2 rounded-xl ${showHelp ? 'bg-primary-soft text-primary' : 'text-content-secondary hover:text-content-primary hover:bg-elevated'}`}
              title="How stats work"
            >
              <Info className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-elevated"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
          {showHelp && (
            <div className="bg-surface border border-subtle rounded-[12px] p-3.5 space-y-2 text-[12px] text-content-secondary leading-relaxed">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">How stats work</p>
              <p><span className="font-semibold text-content-primary">Net focus</span> is time the session was running and not paused.</p>
              <p><span className="font-semibold text-content-primary">Total duration</span> is start-to-stop time, including pauses.</p>
              <p><span className="font-semibold text-content-primary">Average efficiency</span> is the average of each session’s net focus ÷ duration. Pauses lower efficiency; finishing the task does not change it.</p>
              <p>Each session below is a record of that sitting. If you completed the task or a step task, it is listed. If you stopped without completing anything, you will see a failed message and how many step tasks remain. The time still counts in net focus.</p>
              <p>Sessions under 15 seconds of focus are ignored in the summary so mis-taps do not inflate the numbers.</p>
            </div>
          )}

          {sessions.length === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-[12px] bg-surface border border-subtle flex items-center justify-center">
                <Clock className="w-7 h-7 text-content-muted opacity-50" />
              </div>
              <p className="text-sm text-content-secondary font-medium">No sessions recorded yet</p>
              <p className="text-xs text-content-muted text-center max-w-[220px]">
                Start a focus session on this task to see your analytics here.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-elevated rounded-[12px] border border-subtle p-4">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted mb-3">Summary</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-primary-soft rounded-[10px] p-3 text-center">
                    <p className="text-[10px] font-semibold tracking-wider text-primary mb-1">Net focus</p>
                    <p className="text-lg font-semibold text-primary tabular-nums">{formatDuration(totalNFT)}</p>
                  </div>
                  <div className="bg-base rounded-[10px] border border-subtle p-3 text-center">
                    <p className="text-[10px] font-semibold tracking-wider text-content-muted mb-1">Duration</p>
                    <p className="text-lg font-semibold text-content-primary tabular-nums">{formatDuration(totalDurationMs)}</p>
                  </div>
                  <div className="bg-base rounded-[10px] border border-subtle p-3 text-center">
                    <p className="text-[10px] font-semibold tracking-wider text-content-muted mb-1 leading-tight">Average efficiency</p>
                    <p className={`text-lg font-semibold tabular-nums ${efficiencyColor(avgEff)}`}>{avgEff}%</p>
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Timer size={12} className="text-content-secondary" />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-content-secondary">
                    Sessions ({sessions.length})
                  </span>
                </div>

                <div className="space-y-2">
                  {sessions.slice().reverse().map((s, revIdx) => {
                    const sessionNum = sessions.length - revIdx;
                    const durationMs = s.endTime - s.startTime;
                    const countable = isCountableSession(s);
                    const eff = sessionEfficiency(s.netFocusMs, durationMs);
                    const note = sessionNote(s, stepTotal);
                    const remainingText = remainingAfterSession(remainingMap.get(s.id) ?? stepTotal, stepTotal);

                    return (
                      <div
                        key={s.id}
                        className={`bg-elevated rounded-[12px] border border-subtle px-3.5 py-3 ${countable ? '' : 'opacity-55'}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-content-primary">
                              #{sessionNum} · {s.wallClockStart} → {s.wallClockEnd}
                            </p>
                            <p className="text-[11px] text-content-muted mt-0.5 tabular-nums">
                              {formatDuration(s.netFocusMs)} focus · {formatDuration(durationMs)} duration
                            </p>
                          </div>
                          <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${efficiencyColor(eff)}`}>
                            {eff}%
                          </span>
                        </div>
                        {countable ? (
                          <div className="mt-2 space-y-0.5">
                            <p className={`text-[11px] leading-snug ${note.kind === 'failed' ? 'text-error' : 'text-secondary'}`}>
                              {note.text}
                            </p>
                            {remainingText && (
                              <p className="text-[11px] leading-snug text-content-muted">{remainingText}</p>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-[11px] text-content-muted">Accidental session — not in summary</p>
                        )}
                        {countable && (s.completedStepIndices?.length ?? 0) > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {s.completedStepIndices.map((idx) => (
                              <span
                                key={idx}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-primary-soft text-primary"
                              >
                                Step {idx + 1}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          <div className="h-4" />
        </div>
      </div>
    </Overlay>
  );
}
