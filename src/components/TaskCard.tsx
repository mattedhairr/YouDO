import { useState, useEffect } from 'react';
import { Calendar, Clock, Copy, FileText, GripVertical, Link2, RotateCcw, X, Play, Pause, Square, BarChart2, Edit, Trash2, CheckCircle2 } from 'lucide-react';
import type { Priority, Task, ActiveSession } from '../types';
import { isTaskComplete } from '../store';

interface Props {
  task: Task;
  activeSession?: ActiveSession | null;
  onAdvance: (id: string) => void;
  onUndo: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragOver: boolean;
  origin?: string;
  softRemove?: boolean;
  dark?: boolean;
  onCardClick?: () => void;
  backlogAction?: React.ReactNode;
  onJumpToGoal?: () => void;
  onOpenDescription?: (title: string, description: string) => void;
  // Session callbacks
  onStartSession?: (id: string) => void;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  onStopSession?: () => void;
  onViewStats?: (task: Task) => void;
  onOpenAmbient?: () => void;
}

const priorityStyles: Record<Priority, { dot: string; bar: string; glow: string }> = {
  high:   { dot: 'bg-rose-500',   bar: 'bg-rose-500',   glow: 'shadow-rose-500/20' },
  medium: { dot: 'bg-amber-500',  bar: 'bg-amber-500',  glow: 'shadow-amber-500/20' },
  low:    { dot: 'bg-emerald-500', bar: 'bg-emerald-500', glow: 'shadow-emerald-500/20' },
};

function fmtDate(date: string | null): string {
  if (!date) return 'No date';
  return new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtCountdown(deadline: string | null): string {
  if (!deadline) return '';
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return 'Overdue';
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h left`;
}

export default function TaskCard({
  task, activeSession, onAdvance, onUndo, onDelete, onDuplicate,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, origin, softRemove, dark = true,
  onCardClick, backlogAction, onJumpToGoal, onOpenDescription,
  onStartSession, onPauseSession, onResumeSession, onStopSession, onViewStats, onOpenAmbient,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const isSessionTask = activeSession?.taskId === task.id;
  const isPaused = isSessionTask && activeSession?.isPaused;

  // Live timer for active session
  useEffect(() => {
    if (!isSessionTask || !activeSession) return;

    const calc = () => {
      const now = Date.now();
      const currentPause = activeSession.isPaused && activeSession.pauseStart ? now - activeSession.pauseStart : 0;
      const totalPaused = activeSession.pausedDuration + currentPause;
      return Math.max(0, Math.floor((now - activeSession.startTime - totalPaused) / 1000));
    };

    setElapsed(calc());
    if (activeSession.isPaused) return;

    const interval = setInterval(() => {
      setElapsed(calc());
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSession, isSessionTask]);

  const ps = priorityStyles[task.priority];
  const total = task.steps.length || 1;
  const fillPct = (task.progress / total) * 100;
  const complete = isTaskComplete(task);
  const hasSteps = task.steps.length > 0;

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const tickerText = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleCardClick = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (onCardClick) {
      onCardClick();
    } else {
      // Expand action menu on tap
      setExpanded(true);
    }
  };

  return (
    <>
      {/* Expanded Blur Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-md animate-fade-in"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        className={`
          card overflow-hidden transition-all p-0 relative
          ${expanded ? 'z-40 ring-2 ring-violet-500/80 shadow-2xl scale-[1.01]' : ''}
          ${isDragging ? 'dragging-card' : ''}
          ${dragOver  ? 'drag-over-card' : ''}
          ${isSessionTask ? 'card-session-active' : ''}
          ${complete  ? 'opacity-75 ring-1 ring-emerald-500/30 animate-glow-pulse' : ''}
        `}
        onClick={handleCardClick}
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', task.id); onDragStart(task.id); }}
        onDragEnter={(e) => { e.preventDefault(); onDragEnter(task.id); }}
        onDragOver={(e) => e.preventDefault()}
        onDragEnd={onDragEnd}
        onDrop={(e) => e.preventDefault()}
      >
        {/* ── Active Session Pulsing Header Banner (if active) ── */}
        {isSessionTask && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-3.5 py-1.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-session-pulse" />
              <span className="text-[11px] font-mono font-bold text-amber-400">
                {isPaused ? 'PAUSED' : 'SESSION RUNNING'} • {tickerText}
              </span>
            </div>

            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
              {isPaused ? (
                <button
                  onClick={onResumeSession}
                  className="px-2 py-0.5 rounded-lg bg-amber-500 text-black text-[10px] font-bold flex items-center gap-1 hover:bg-amber-400 transition"
                >
                  <Play className="w-3 h-3 fill-current" /> Resume
                </button>
              ) : (
                <button
                  onClick={onPauseSession}
                  className="px-2 py-0.5 rounded-lg bg-white/10 text-amber-300 text-[10px] font-semibold flex items-center gap-1 hover:bg-white/20 transition"
                >
                  <Pause className="w-3 h-3" /> Pause
                </button>
              )}

              {onOpenAmbient && (
                <button
                  onClick={onOpenAmbient}
                  className="px-2 py-0.5 rounded-lg bg-violet-600/30 text-violet-300 border border-violet-500/30 text-[10px] font-semibold hover:bg-violet-600/40 transition"
                >
                  Ambient Mode
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Main Card Body ── */}
        <div className="flex items-stretch">
          {/* LEFT: Grip + Main content */}
          <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3 flex-1 min-w-0">
            {/* Drag Handle */}
            <div
              className="mt-0.5 cursor-grab active:cursor-grabbing shrink-0 text-slate-500 hover:text-slate-300 transition"
              onClick={(e) => e.stopPropagation()}
            >
              <GripVertical size={16} />
            </div>

            {/* Content Column */}
            <div className="flex-1 min-w-0">
              {/* Title Row */}
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${ps.dot}`} />
                <h3 className={`flex-1 text-[14px] font-bold leading-snug ${
                  complete ? 'line-through text-slate-500' : 'text-slate-100'
                }`}>
                  {task.title}
                </h3>
              </div>

              {/* Origin Breadcrumb OR Standalone Quick Task Badge */}
              {origin ? (
                <div
                  onClick={(e) => {
                    if (onJumpToGoal) {
                      e.stopPropagation();
                      onJumpToGoal();
                    }
                  }}
                  className={`mt-1.5 flex items-center gap-1 flex-wrap text-[10.5px] font-semibold bg-violet-950/40 border border-violet-800/40 rounded-lg px-2 py-1 w-full leading-normal ${
                    onJumpToGoal ? 'cursor-pointer hover:bg-violet-900/60 hover:border-violet-600 transition-all group/path' : ''
                  }`}
                  title={onJumpToGoal ? 'Jump to this task in Goal Blueprint' : undefined}
                >
                  <Link2 size={10} className="shrink-0 text-violet-400 mr-0.5 group-hover/path:scale-110 transition-transform" />
                  {origin.split(' > ').map((seg, i, arr) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span className={i === arr.length - 1
                        ? 'font-bold text-violet-300 group-hover/path:underline'
                        : 'font-medium text-slate-400 group-hover/path:text-slate-200'
                      }>{seg}</span>
                      {i < arr.length - 1 && <span className="text-slate-600">/</span>}
                    </span>
                  ))}
                </div>
              ) : !task.goalNodeId ? (
                <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-violet-300 bg-violet-600/15 border border-violet-500/30 px-2 py-0.5 rounded-md">
                  ⚡ Quick Task
                </div>
              ) : null}

              {/* Date / Deadline / Description Row */}
              <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 flex-wrap">
                {task.originalTargetDate && (
                  <span className="inline-flex items-center gap-1 font-bold text-[10px] text-rose-400 bg-rose-500/15 border border-rose-500/25 px-2 py-0.5 rounded-md">
                    📋 Backlog
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Calendar size={11} /> {fmtDate(task.targetDate)}
                </span>
                {task.deadline && (
                  <span className={`inline-flex items-center gap-1 font-semibold ${
                    new Date(task.deadline).getTime() < Date.now() ? 'text-rose-500' : ''
                  }`}>
                    <Clock size={11} /> {fmtCountdown(task.deadline)}
                  </span>
                )}
                {task.description && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpenDescription) {
                        onOpenDescription(task.title, task.description);
                      }
                    }}
                    className="inline-flex items-center gap-1 font-medium text-slate-400 hover:text-violet-400 transition-colors"
                    title="View full description"
                  >
                    <FileText size={11} className="text-violet-400 shrink-0" />
                    <span className="max-w-[140px] sm:max-w-[200px] truncate">{task.description}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT: Micro-steps panel */}
          {hasSteps && (
            <div className="w-[120px] shrink-0 flex flex-col border-l border-white/10 bg-[#1D1930]/40">
              <div className="px-3 pt-2.5 pb-2 border-b border-white/5 bg-[#1D1930]/80">
                <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-500">
                  Micro-steps
                </div>
                <div className="text-[12px] font-bold tabular-nums text-slate-200 mt-0.5">
                  <span className={task.progress === task.steps.length ? 'text-emerald-400' : 'text-slate-200'}>
                    {task.progress}
                  </span>
                  <span className="text-slate-500 font-normal">/{task.steps.length}</span>
                  <span className="text-[9px] text-slate-500 font-normal ml-1">done</span>
                </div>
              </div>

              <div className="flex-1 flex flex-col gap-1.5 px-2.5 py-2.5 overflow-y-auto no-scrollbar">
                {task.steps.map((s, i) => {
                  const done = i < task.progress;
                  return (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`
                        mt-[1px] w-4 h-4 rounded-full shrink-0 flex items-center justify-center
                        text-[8px] font-extrabold leading-none
                        ${done
                          ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                          : 'bg-white/10 text-slate-400'}
                      `}>
                        {done ? '✓' : i + 1}
                      </span>
                      <span className={`text-[10.5px] leading-snug break-words flex-1 min-w-0 ${
                        done
                          ? 'line-through text-slate-500'
                          : 'text-slate-200 font-medium'
                      }`}>
                        {s}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── EXPANDED ACTION GRID OVERLAY (Pure actions, no repeated info) ── */}
        {expanded && (
          <div
            className="p-3.5 bg-[#1D1930] border-t border-white/10 space-y-2.5 animate-fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Primary Action Button (Start / Stop Session) */}
            {isSessionTask ? (
              <button
                onClick={() => { setExpanded(false); if (onStopSession) onStopSession(); }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-rose-600/25 transition"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop Active Session
              </button>
            ) : (
              <button
                onClick={() => { setExpanded(false); if (onStartSession) onStartSession(task.id); }}
                className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition"
              >
                <Play className="w-4 h-4 fill-current" />
                Start Focus Session
              </button>
            )}

            {/* Secondary Actions 2-Column Grid */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setExpanded(false); if (onViewStats) onViewStats(task); }}
                className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/5 transition"
              >
                <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
                Session Stats
              </button>

              <button
                onClick={() => {
                  setExpanded(false);
                  if (task.goalNodeId && onJumpToGoal) {
                    onJumpToGoal();
                  } else {
                    onAdvance(task.id);
                  }
                }}
                className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/5 transition"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {task.goalNodeId ? 'Jump to Goal' : 'Advance Step'}
              </button>

              <button
                onClick={() => { setExpanded(false); onDuplicate(task.id); }}
                className="py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/5 transition"
              >
                <Copy className="w-3.5 h-3.5 text-violet-400" />
                Duplicate
              </button>

              <button
                onClick={() => { setExpanded(false); onDelete(task.id); }}
                className="py-2 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center justify-center gap-1.5 border border-rose-500/20 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {softRemove ? 'Remove' : 'Delete'}
              </button>
            </div>
          </div>
        )}

        {/* Full-width progress bar at bottom */}
        <div className="h-1.5 bg-slate-800">
          <div
            className={`h-full progress-bar-fill ${ps.bar}`}
            style={{ width: `${fillPct}%` }}
          />
        </div>
      </div>
    </>
  );
}
