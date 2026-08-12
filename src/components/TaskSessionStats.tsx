import { X, Clock, CheckCircle2, Zap, BarChart2, Timer } from 'lucide-react';
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

function formatTime12(timeStr: string): string {
  // timeStr is "HH:MM AM/PM" or similar — pass through
  return timeStr;
}

function efficiencyColor(pct: number): string {
  if (pct >= 80) return 'text-emerald-400';
  if (pct >= 55) return 'text-amber-400';
  return 'text-rose-400';
}

function EfficiencyBar({ pct }: { pct: number }) {
  const barColor = pct >= 80 ? 'bg-emerald-500/70' : pct >= 55 ? 'bg-amber-500/70' : 'bg-rose-500/60';
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
      <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function TaskSessionStats({ open, title, sessions, onClose }: Props) {
  if (!open) return null;

  const totalSessions = sessions.length;

  // Aggregate stats
  const totalNFT = sessions.reduce((acc, s) => acc + s.netFocusMs, 0);
  const totalWCD = sessions.reduce((acc, s) => acc + (s.endTime - s.startTime), 0);
  const overallEff = totalWCD > 0 ? Math.min(100, Math.round((totalNFT / totalWCD) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0E0C18] border border-white/10 rounded-t-[2rem] shadow-2xl sheet-up max-h-[90vh] overflow-hidden flex flex-col">

        {/* ── Drag Handle ── */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 pt-2 pb-3 border-b border-white/5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-amber-400">
              <BarChart2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-[13px] font-black text-slate-100 leading-tight">Session Analytics</h3>
              <p className="text-[10.5px] text-slate-400 max-w-[220px] truncate mt-0.5">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-200 hover:bg-white/8 transition active:scale-95"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="overflow-y-auto no-scrollbar px-5 py-4 space-y-4">

          {totalSessions === 0 ? (
            <div className="py-12 flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
                <Clock className="w-7 h-7 text-slate-600 opacity-50" />
              </div>
              <p className="text-sm text-slate-500 font-medium">No sessions recorded yet</p>
              <p className="text-xs text-slate-600 text-center max-w-[220px]">Start a focus session on this task to see your analytics here.</p>
            </div>
          ) : (
            <>
              {/* ── Overall Summary ── */}
              <div className="bg-[#16132a] rounded-2xl border border-white/8 p-4 space-y-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Zap size={12} className="text-violet-400" />
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Overall Summary</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {/* Sessions */}
                  <div className="bg-[#0D0B1A] rounded-xl border border-white/5 p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">Sessions</p>
                    <p className="text-xl font-black text-slate-100">{totalSessions}</p>
                  </div>
                  {/* Net Focus */}
                  <div className="bg-amber-500/8 rounded-xl border border-amber-500/15 p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-amber-500/70 mb-1">Net Focus</p>
                    <p className="text-xl font-black text-amber-400">{formatDuration(totalNFT)}</p>
                  </div>
                  {/* Wall Clock */}
                  <div className="bg-slate-800/40 rounded-xl border border-white/5 p-3 text-center">
                    <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-slate-500 mb-1">Wall Clock</p>
                    <p className="text-xl font-black text-slate-300">{formatDuration(totalWCD)}</p>
                  </div>
                </div>

                {/* Efficiency Bar */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400">Overall Efficiency <span className="text-slate-600 font-normal">(Net Focus ÷ Wall Clock)</span></span>
                    <span className={`text-sm font-black tabular-nums ${efficiencyColor(overallEff)}`}>{overallEff}%</span>
                  </div>
                  <EfficiencyBar pct={overallEff} />
                </div>
              </div>

              {/* ── Session Log ── */}
              <div>
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Timer size={12} className="text-slate-500" />
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">
                    Session History ({totalSessions})
                  </span>
                </div>

                <div className="space-y-2.5">
                  {sessions.slice().reverse().map((s, revIdx) => {
                    const sessionNum = totalSessions - revIdx;
                    const wcd = s.endTime - s.startTime;
                    const eff = wcd > 0 ? Math.min(100, Math.round((s.netFocusMs / wcd) * 100)) : 0;
                    const outcomeLabel = s.completed === true ? { label: 'Completed', cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/25' }
                      : s.completed === 'partial' ? { label: 'Partial', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/25' }
                      : { label: 'Stopped', cls: 'text-slate-400 bg-slate-800 border-white/8' };

                    return (
                      <div key={s.id} className="bg-[#13102A] rounded-2xl border border-white/8 overflow-hidden">
                        {/* Session Header */}
                        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-white/5">
                          <div className="flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-violet-600/25 border border-violet-500/30 text-[9px] font-black text-violet-300 flex items-center justify-center">
                              #{sessionNum}
                            </span>
                            <span className="text-[11px] font-bold text-slate-200">
                              {s.wallClockStart} → {s.wallClockEnd}
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">({formatDuration(wcd)})</span>
                          </div>
                          <span className={`text-[9.5px] font-bold px-2 py-0.5 rounded-lg border ${outcomeLabel.cls}`}>
                            {outcomeLabel.label}
                          </span>
                        </div>

                        {/* Session Metrics */}
                        <div className="px-3.5 py-2.5 space-y-2">
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-[9px] font-bold uppercase text-slate-600 mb-0.5">Net Focus</p>
                              <p className="text-[12px] font-black text-amber-400">{formatDuration(s.netFocusMs)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase text-slate-600 mb-0.5">Wall Clock</p>
                              <p className="text-[12px] font-black text-slate-300">{formatDuration(wcd)}</p>
                            </div>
                            <div>
                              <p className="text-[9px] font-bold uppercase text-slate-600 mb-0.5">Efficiency</p>
                              <p className={`text-[12px] font-black ${efficiencyColor(eff)}`}>{eff}%</p>
                            </div>
                          </div>

                          <EfficiencyBar pct={eff} />

                          {/* Pauses */}
                          {s.pauses.length > 0 && (
                            <p className="text-[10px] text-slate-600 font-medium">
                              {s.pauses.length} pause{s.pauses.length > 1 ? 's' : ''} • {formatDuration(s.pausedDuration ?? 0)} paused
                            </p>
                          )}

                          {/* Completed Steps */}
                          {s.completedStepIndices && s.completedStepIndices.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {s.completedStepIndices.map((idx) => (
                                <span
                                  key={idx}
                                  className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-md bg-violet-600/15 text-violet-300 border border-violet-500/25"
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
