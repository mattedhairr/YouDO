import { X, Clock, Zap, BarChart2, Timer } from 'lucide-react';
import type { TaskSession } from '../types';

interface Props {
  open: boolean;
  title: string;
  sessions: TaskSession[];
  onClose: () => void;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0 min';
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins} min`;
}

function formatPauseDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins}m`;
}

function formatWallClockTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function efficiencyColor(pct: number): string {
  if (pct >= 80) return 'text-secondary';
  if (pct >= 55) return 'text-accent';
  return 'text-error';
}

function EfficiencyBar({ pct }: { pct: number }) {
  const barColor = pct >= 80 ? 'bg-secondary' : pct >= 55 ? 'bg-accent' : 'bg-error-soft';
  return (
    <div className="h-1.5 w-full rounded-full bg-border-subtle overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function TaskSessionStats({ open, title, sessions, onClose }: Props) {
  if (!open) return null;

  const totalSessions = sessions.length;

  // Aggregate stats
  const totalNFT = sessions.reduce((acc, s) => acc + s.netFocusMs, 0);
  const totalDurationMs = sessions.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
  const overallEff = totalDurationMs > 0 ? Math.min(100, Math.round((totalNFT / totalDurationMs) * 100)) : 0;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center modal-backdrop animate-fade-in cursor-pointer p-0 sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-elevated card border border-subtle rounded-t-[2rem] sm:rounded-3xl shadow-2xl sheet-up max-h-[90vh] overflow-hidden flex flex-col cursor-default"
      >
        {/* ── Drag Handle ── */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent/15 border border-accent/20 flex items-center justify-center text-accent">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[13px] font-black text-content-primary leading-tight">Session Analytics</h3>
              <p className="text-[10.5px] text-content-secondary max-w-[220px] truncate mt-0.5">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-elevated transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto no-scrollbar px-5 py-4 space-y-4">
          {totalSessions === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-surface border border-subtle flex items-center justify-center">
                <Clock className="w-7 h-7 text-content-muted opacity-50" />
              </div>
              <p className="text-sm text-content-secondary font-medium">No sessions recorded yet</p>
              <p className="text-xs text-content-muted text-center max-w-[220px]">
                Start a focus session on this task to see your analytics here.
              </p>
            </div>
          ) : (
            <>
              {/* ── Overall Summary ── */}
              <div className="bg-elevated rounded-2xl border border-subtle p-4 space-y-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={12} className="text-primary" />
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-content-secondary">
                    Overall Summary
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Sessions */}
                  <div className="bg-base rounded-xl border border-subtle p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
                      Sessions
                    </p>
                    <p className="text-xl font-black text-content-primary">{totalSessions}</p>
                  </div>
                  {/* Net Focus */}
                  <div className="bg-accent/10 rounded-xl border border-accent/20 p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-accent/80 mb-1">
                      Net Focus
                    </p>
                    <p className="text-xl font-black text-accent">{formatDuration(totalNFT)}</p>
                  </div>
                  {/* Total Duration */}
                  <div className="bg-surface/40 rounded-xl border border-subtle p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-content-secondary mb-1">
                      Total Duration
                    </p>
                    <p className="text-xl font-black text-content-muted">{formatDuration(totalDurationMs)}</p>
                  </div>
                </div>

                {/* Efficiency Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-content-secondary">
                      Overall Efficiency <span className="text-content-muted font-normal">(Net Focus ÷ Total Duration)</span>
                    </span>
                    <span className={`text-sm font-black tabular-nums ${efficiencyColor(overallEff)}`}>
                      {overallEff}%
                    </span>
                  </div>
                  <EfficiencyBar pct={overallEff} />
                </div>
              </div>

              {/* ── Session Log ── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Timer size={12} className="text-content-secondary" />
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-content-secondary">
                    Session History ({totalSessions})
                  </span>
                </div>

                <div className="space-y-2.5">
                  {sessions.slice().reverse().map((s, revIdx) => {
                    const sessionNum = totalSessions - revIdx;
                    const durationMs = s.endTime - s.startTime;
                    const eff = durationMs > 0 ? Math.min(100, Math.round((s.netFocusMs / durationMs) * 100)) : 0;
                    const outcomeLabel =
                      s.completed === true
                        ? { label: 'Completed', cls: 'text-secondary bg-secondary/10 border-secondary/20' }
                        : s.completed === 'partial'
                          ? { label: 'Partial', cls: 'text-accent bg-accent/10 border-accent/20' }
                          : { label: 'Stopped', cls: 'text-content-secondary bg-surface border-subtle' };

                    return (
                      <div key={s.id} className="bg-elevated rounded-2xl border border-subtle overflow-hidden">
                        {/* Session Header */}
                        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-primary-soft border border-primary/20 text-[9px] font-black text-primary-glow flex items-center justify-center">
                              #{sessionNum}
                            </span>
                            <span className="text-[11px] font-bold text-content-primary">
                              {s.wallClockStart} → {s.wallClockEnd}
                            </span>
                            <span className="text-[10px] text-content-secondary font-medium">({formatDuration(durationMs)})</span>
                          </div>
                          <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border ${outcomeLabel.cls}`}>
                            {outcomeLabel.label}
                          </span>
                        </div>

                        {/* Session Metrics */}
                        <div className="px-3.5 py-2.5 space-y-2">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-[9px] font-bold uppercase text-content-muted mb-0.5">Net Focus</p>
                              <p className="text-[12px] font-black text-accent">{formatDuration(s.netFocusMs)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase text-content-muted mb-0.5">Total Duration</p>
                              <p className="text-[12px] font-black text-content-muted">{formatDuration(durationMs)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase text-content-muted mb-0.5">Efficiency</p>
                              <p className={`text-[12px] font-black ${efficiencyColor(eff)}`}>{eff}%</p>
                            </div>
                          </div>

                          <EfficiencyBar pct={eff} />

                          {/* ── Detailed Pause Timestamps Log (Point 6) ── */}
                          {s.pauses && s.pauses.length > 0 && (
                            <div className="mt-2 pt-2 border-t border-subtle space-y-1">
                              <p className="text-[9.5px] font-extrabold uppercase text-accent/80 flex items-center gap-1">
                                <Clock size={9} /> Pause Timestamps ({s.pauses.length}):
                              </p>
                              <div className="space-y-1">
                                {s.pauses.map((p, pIdx) => {
                                  const startStr = p.wallClockStart || formatWallClockTime(p.start);
                                  const endStr = p.end ? (p.wallClockEnd || formatWallClockTime(p.end)) : 'Ended';
                                  const durMs = p.durationMs || (p.end ? p.end - p.start : 0);
                                  return (
                                    <div key={pIdx} className="flex items-center justify-between text-[10px] font-mono text-content-muted bg-surface px-2 py-0.5 rounded">
                                      <span>({startStr} - {endStr})</span>
                                      <span className="font-bold text-accent">{formatPauseDuration(durMs)}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Completed Steps */}
                          {s.completedStepIndices && s.completedStepIndices.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {s.completedStepIndices.map((idx) => (
                                <span
                                  key={idx}
                                  className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-primary-soft text-primary-glow border border-primary/20"
                                >
                                  ✓ Step {idx + 1}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Bottom spacer for safe area */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  );
}
