import { useEffect, useState } from 'react';
import { Pause, Play, Square, Minimize2, Link2, Clock } from 'lucide-react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import type { ActiveSession, Task } from '../types';
import Overlay from './Overlay';
import { formatElapsed } from '../lib/format';
import { computeNetFocusMs } from '../lib/sessionStats';

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
  return new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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
      return Math.floor(computeNetFocusMs(activeSession, Date.now()) / 1000);
    };
    setElapsed(calcElapsed());
    if (activeSession.isPaused) return;
    const interval = setInterval(() => setElapsed(calcElapsed()), 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  const formattedTime = formatElapsed(elapsed);
  const circumference = 2 * Math.PI * 116;
  const minuteProgress = (elapsed % 3600) / 3600;
  const dash = circumference * minuteProgress;

  const handleGoToGoal = () => {
    if (onJumpToGoal) {
      onMinimize();
      onJumpToGoal();
    }
  };

  return (
    <Overlay open scrim={false} align="full">
      <div className="h-full bg-base text-content-primary flex flex-col justify-between px-6 pb-6 fade-in relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div
            className="ambient-orb absolute -top-16 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--primary-soft), transparent 68%)' }}
          />
          <div
            className="ambient-orb ambient-orb-delay absolute bottom-8 -right-10 h-56 w-56 rounded-full"
            style={{ background: 'radial-gradient(circle, var(--secondary-soft), transparent 70%)' }}
          />
        </div>

        <div className="relative flex items-center justify-between" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${activeSession.isPaused ? 'bg-content-muted' : 'bg-primary animate-session-pulse'}`} />
            <span className="text-[11px] font-mono tracking-[0.16em] uppercase text-content-muted">
              {activeSession.isPaused ? 'Paused' : 'Focus'}
            </span>
          </div>
          <button
            onClick={onMinimize}
            className="p-2 rounded-[12px] bg-surface border border-subtle text-content-secondary text-xs font-medium flex items-center gap-1.5"
          >
            <Minimize2 className="w-4 h-4" />
            Minimize
          </button>
        </div>

        <div className="relative flex flex-col items-center justify-center text-center my-auto px-2">
          {origin && (
            <button
              onClick={handleGoToGoal}
              className={`mb-5 max-w-sm text-[11px] leading-relaxed text-content-muted ${!onJumpToGoal ? 'pointer-events-none' : ''}`}
            >
              <Link2 size={11} className="inline mr-1 text-primary" />
              {origin}
            </button>
          )}

          <h1 className="text-[22px] font-semibold text-content-primary mb-8 max-w-md leading-snug">
            {task.title}
          </h1>

          <div className="relative mb-8 w-[264px] h-[264px] grid place-items-center">
            <svg width="264" height="264" className="-rotate-90 absolute inset-0" aria-hidden="true">
              <circle cx="132" cy="132" r="116" fill="none" stroke="var(--border-subtle)" strokeWidth="3" />
              <circle
                cx="132"
                cy="132"
                r="116"
                fill="none"
                stroke="var(--primary)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={`${dash} ${circumference}`}
                style={{ transition: 'stroke-dasharray 0.8s ease' }}
              />
            </svg>
            <div className="font-mono text-[40px] sm:text-[44px] font-semibold tabular-nums tracking-tight text-content-primary animate-ambient-clock leading-none px-5 text-center">
              {formattedTime}
            </div>
          </div>

          <p className="text-[12px] font-mono text-content-muted">
            Started {activeSession.wallClockStart}
            {activeSession.pauses.length > 0 && ` · ${activeSession.pauses.length} pause${activeSession.pauses.length > 1 ? 's' : ''}`}
          </p>

          {activeSession.pauses.length > 0 && (
            <div className="mt-5 w-full max-w-xs space-y-1.5 max-h-28 overflow-y-auto no-scrollbar text-left">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted flex items-center gap-1">
                <Clock size={10} /> Pauses
              </p>
              {activeSession.pauses.map((p, idx) => {
                const startStr = p.wallClockStart || formatWallClockTime(p.start);
                const endStr = p.end ? (p.wallClockEnd || formatWallClockTime(p.end)) : 'now';
                const durMs = p.end ? (p.durationMs || (p.end - p.start)) : (activeSession.pauseStart ? Date.now() - activeSession.pauseStart : 0);
                return (
                  <div key={idx} className="flex items-center justify-between text-[11px] font-mono text-content-secondary">
                    <span>{startStr} – {endStr}</span>
                    <span className="text-primary">{formatPauseDuration(durMs)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="relative max-w-sm w-full mx-auto flex items-center gap-3">
          {activeSession.isPaused ? (
            <button
              onClick={onResume}
              className="flex-1 py-3.5 rounded-[12px] bg-primary text-on-primary font-semibold text-sm flex items-center justify-center gap-2"
            >
              <Play className="w-5 h-5 fill-current" />
              Resume
            </button>
          ) : (
            <button
              onClick={onPause}
              className="flex-1 py-3.5 rounded-[12px] bg-surface border border-subtle text-content-primary font-medium text-sm flex items-center justify-center gap-2"
            >
              <Pause className="w-5 h-5" />
              Pause
            </button>
          )}
          <button
            onClick={onStop}
            className="py-3.5 px-5 rounded-[12px] bg-error-soft text-error font-medium text-sm flex items-center justify-center gap-2"
          >
            <Square className="w-4 h-4 fill-current" />
            Stop
          </button>
        </div>
      </div>
    </Overlay>
  );
}
