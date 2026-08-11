import { X, Clock, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import type { Task, TaskSession } from '../types';

interface Props {
  open: boolean;
  title: string;
  sessions: TaskSession[];
  onClose: () => void;
}

export function TaskSessionStats({ open, title, sessions, onClose }: Props) {
  if (!open) return null;

  const totalSessions = sessions.length;
  const totalFocusMs = sessions.reduce((acc, s) => acc + s.netFocusMs, 0);
  const avgFocusMs = totalSessions > 0 ? totalFocusMs / totalSessions : 0;

  const formatDuration = (ms: number) => {
    const mins = Math.floor(ms / 60000);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs > 0) return `${hrs}h ${remMins}m`;
    return `${mins} min`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="relative w-full max-w-md bg-[#14111F] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl sheet-up max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Session Analytics</h3>
              <p className="text-xs text-slate-400 truncate max-w-[220px]">{title}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Overview Stat Cards Grid */}
        <div className="grid grid-cols-3 gap-2.5 mb-5">
          <div className="bg-slate-900/50 border border-white/5 p-3 rounded-2xl text-center shadow-inner">
            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Sessions</p>
            <p className="text-lg font-black text-slate-100">{totalSessions}</p>
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-2xl text-center shadow-inner">
            <p className="text-[10px] uppercase tracking-widest text-amber-500/80 font-bold mb-1">Focus</p>
            <p className="text-lg font-black text-amber-400">{formatDuration(totalFocusMs)}</p>
          </div>
          <div className="bg-violet-600/10 border border-violet-500/20 p-3 rounded-2xl text-center shadow-inner">
            <p className="text-[10px] uppercase tracking-widest text-violet-400/80 font-bold mb-1">Average</p>
            <p className="text-lg font-black text-violet-400">{formatDuration(avgFocusMs)}</p>
          </div>
        </div>

        {/* Session Log List */}
        <h4 className="text-xs font-semibold text-slate-400 mb-2">History Logs</h4>
        {totalSessions === 0 ? (
          <div className="py-8 text-center bg-[#1D1930]/50 rounded-2xl border border-white/5">
            <Clock className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-40" />
            <p className="text-xs text-slate-400">No focus sessions recorded yet for this task.</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1 no-scrollbar">
            {sessions.slice().reverse().map((s) => {
              const wallClockDuration = s.endTime - s.startTime;
              return (
                <div
                  key={s.id}
                  className="bg-slate-900/40 border border-white/5 p-3 rounded-2xl flex items-center justify-between text-xs hover:bg-slate-800/40 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-1.5 mb-1">
                      <Calendar className="w-3 h-3 text-slate-400 shrink-0" />
                      <span className="font-bold text-slate-200">
                        {s.wallClockStart} – {s.wallClockEnd}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 tracking-wide">
                        ({formatDuration(wallClockDuration)})
                      </span>
                    </div>
                    <div className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span className="flex items-center gap-1">Net focus: <span className="text-amber-400 font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">{formatDuration(s.netFocusMs)}</span></span>
                      {wallClockDuration > 0 && (
                        <span className="flex items-center gap-1 ml-1 text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20 text-[10px] font-bold">
                          {Math.round((s.netFocusMs / wallClockDuration) * 100)}% eff.
                        </span>
                      )}
                      {s.pauses.length > 0 && <span className="text-slate-500"> • {s.pauses.length} pause{s.pauses.length > 1 ? 's' : ''}</span>}
                    </div>
                  </div>

                <div>
                  {s.completed === true && (
                    <span className="px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Done
                    </span>
                  )}
                  {s.completed === 'partial' && (
                    <span className="px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[10px] font-bold">
                      Partial
                    </span>
                  )}
                  {s.completed === false && (
                    <span className="px-2 py-1 rounded-lg bg-slate-800 border border-white/10 text-slate-400 text-[10px] font-medium">
                      Stopped
                    </span>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
