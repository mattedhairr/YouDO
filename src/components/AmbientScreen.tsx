import { useEffect, useState } from 'react';
import { Pause, Play, Square, Minimize2, Link2, ExternalLink, Clock } from 'lucide-react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { ActiveSession, Task } from '../types';

interface Props {
  activeSession: ActiveSession;
  task: Task;
  origin?: string;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMinimize: () => void;
  onJumpToGoal?: () => void;
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

export function AmbientScreen({
  activeSession,
  task,
  origin,
  onPause,
  onResume,
  onStop,
  onMinimize,
  onJumpToGoal,
}: Props) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    try {
      KeepAwake.keepAwake().catch(() => {});
    } catch {
      /* ignore */
    }

    return () => {
      try {
        KeepAwake.allowSleep().catch(() => {});
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    const calcElapsed = () => {
      const now = Date.now();
      const currentPause = activeSession.isPaused && activeSession.pauseStart ? now - activeSession.pauseStart : 0;
      const totalPaused = activeSession.pausedDuration + currentPause;
      return Math.max(0, Math.floor((now - activeSession.startTime - totalPaused) / 1000));
    };

    setElapsed(calcElapsed());

    if (activeSession.isPaused) return;

    const interval = setInterval(() => {
      setElapsed(calcElapsed());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession]);

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;

  const formattedTime = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleGoToGoal = () => {
    if (onJumpToGoal) {
      onMinimize();
      onJumpToGoal();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black text-slate-100 flex flex-col justify-between p-6 select-none animate-fade-in">
      {/* Top Bar with Dynamic Safe Area Padding */}
      <div
        className="flex items-center justify-between"
        style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}
      >
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-session-pulse" />
          <span className="text-xs font-mono text-amber-400 tracking-wider uppercase font-semibold">
            {activeSession.isPaused ? 'PAUSED' : 'FOCUS SESSION'}
          </span>
        </div>

        <button
          onClick={onMinimize}
          className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 transition flex items-center gap-1.5 text-xs font-medium"
        >
          <Minimize2 className="w-4 h-4" />
          <span>Exit Ambient</span>
        </button>
      </div>

      {/* Center Ticker & Task Info */}
      <div className="flex flex-col items-center justify-center text-center my-auto px-4">
        {/* Clickable Origin / Path */}
        {origin && (
          <button
            onClick={handleGoToGoal}
            className={`mb-6 w-full max-w-sm mx-auto flex items-center justify-center gap-1.5 flex-wrap text-[11px] leading-relaxed font-semibold text-slate-300 bg-white/5 border border-white/10 px-3 py-2 rounded-xl backdrop-blur-md transition-all active:scale-95 hover:bg-white/10 hover:border-violet-500/40 group ${!onJumpToGoal ? 'pointer-events-none' : ''}`}
          >
            <Link2 size={11} className="shrink-0 text-violet-400" />
            <span className="break-words text-center">{origin}</span>
            {onJumpToGoal && (
              <ExternalLink size={10} className="shrink-0 text-violet-400 opacity-60 group-hover:opacity-100 transition-opacity" />
            )}
          </button>
        )}

        {/* Task Title */}
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-100 mb-6 max-w-md leading-snug">
          {task.title}
        </h1>

        {/* Large Mono Timer */}
        <div className="relative mb-6">
          <div className="text-6xl sm:text-7xl font-mono font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-400 animate-ambient-clock drop-shadow-2xl">
            {formattedTime}
          </div>
          {activeSession.isPaused && (
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium text-amber-400/90 tracking-widest uppercase">
              Paused
            </span>
          )}
        </div>

        {/* Wall Clock Info */}
        <div className="text-xs font-mono text-slate-500 flex items-center gap-3">
          <span>Started at {activeSession.wallClockStart}</span>
          {activeSession.pauses.length > 0 && (
            <>
              <span>•</span>
              <span>{activeSession.pauses.length} pause{activeSession.pauses.length > 1 ? 's' : ''}</span>
            </>
          )}
        </div>

        {/* ── Detailed Pause Timestamps Log (Point 6) ── */}
        {activeSession.pauses.length > 0 && (
          <div className="mt-4 w-full max-w-xs space-y-1.5 max-h-32 overflow-y-auto no-scrollbar bg-white/5 border border-white/8 p-3 rounded-2xl">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-amber-400/80 text-left flex items-center gap-1">
              <Clock size={10} /> Pause Timestamps Log
            </p>
            {activeSession.pauses.map((p, idx) => {
              const startStr = p.wallClockStart || formatWallClockTime(p.start);
              const endStr = p.end ? (p.wallClockEnd || formatWallClockTime(p.end)) : 'Ongoing';
              const durMs = p.end ? (p.durationMs || (p.end - p.start)) : (activeSession.pauseStart ? Date.now() - activeSession.pauseStart : 0);
              return (
                <div key={idx} className="flex items-center justify-between text-[10.5px] font-mono text-slate-300 bg-white/5 px-2.5 py-1 rounded-lg">
                  <span>({startStr} - {endStr})</span>
                  <span className="font-bold text-amber-400">{formatPauseDuration(durMs)}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="max-w-xs w-full mx-auto flex items-center gap-4 pb-4">
        {activeSession.isPaused ? (
          <button
            onClick={onResume}
            className="flex-1 py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-black font-bold text-sm shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 transition"
          >
            <Play className="w-5 h-5 fill-current" />
            Resume
          </button>
        ) : (
          <button
            onClick={onPause}
            className="flex-1 py-4 px-6 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-200 font-semibold text-sm border border-white/10 flex items-center justify-center gap-2 transition"
          >
            <Pause className="w-5 h-5" />
            Pause
          </button>
        )}

        <button
          onClick={onStop}
          className="py-4 px-6 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-rose-400 border border-rose-500/30 font-semibold text-sm flex items-center justify-center gap-2 transition"
        >
          <Square className="w-4 h-4 fill-current" />
          Stop
        </button>
      </div>
    </div>
  );
}
