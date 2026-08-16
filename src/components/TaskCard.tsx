import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, Copy, FileText, GripVertical, Link2, Play, Pause, Square, BarChart2, Trash2, CheckCircle2, Check } from 'lucide-react';
import type { Priority, Task, ActiveSession, TaskSession } from '../types';
import { isBacklogTask, isTaskComplete } from '../store';
import { hapticSessionStart, hapticSessionPause, hapticAmbient } from '../lib/haptics';
import Overlay from './Overlay';
import { computeNetFocusMs } from '../lib/sessionStats';

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
  originNodes?: { title: string; kind: string }[];
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
  taskSessions?: TaskSession[];
}

const priorityStyles: Record<Priority, { dot: string; bar: string }> = {
  high:   { dot: 'bg-error', bar: 'bg-error' },
  medium: { dot: 'bg-primary', bar: 'bg-primary' },
  low:    { dot: 'bg-secondary', bar: 'bg-secondary' },
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
  task, activeSession, onAdvance, onDelete, onDuplicate,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, originNodes, softRemove,
  onCardClick, onJumpToGoal, onOpenDescription,
  onStartSession, onPauseSession, onResumeSession, onStopSession, onViewStats, onOpenAmbient, taskSessions
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const skipClickAfterAmbient = useRef(false);

  const isSessionTask = activeSession?.taskId === task.id;
  const isPaused = isSessionTask && activeSession?.isPaused;

  // Live timer for active session
  useEffect(() => {
    if (!isSessionTask || !activeSession) return;

    const calc = () => {
      return Math.floor(computeNetFocusMs(activeSession, Date.now()) / 1000);
    };

    setElapsed(calc());
    if (activeSession.isPaused) return;

    const interval = setInterval(() => {
      setElapsed(calc());
    }, 1000);

    return () => {
      clearInterval(interval);
      clearLongPress();
    };
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

  const clearLongPress = () => {
    if (longPressTimer.current != null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openAmbient = () => {
    skipClickAfterAmbient.current = true;
    clearLongPress();
    onOpenAmbient?.();
  };
  
  const handleCardClick = () => {
    if (expanded) {
      setExpanded(false);
      return;
    }
    if (onCardClick) {
      onCardClick();
    } else {
      setExpanded(true);
    }
  };

  return (
    <>
      <div
        ref={cardRef}
        className={`
          overflow-hidden relative rounded-[12px] border
          bg-surface shadow-card border-subtle transition-all duration-200
          active:scale-[0.98]
          ${isDragging ? 'dragging-card' : ''}
          ${dragOver  ? 'drag-over-card ring-2 ring-primary' : ''}
          ${isSessionTask ? 'card-session-active' : ''}
          ${complete ? 'opacity-50 grayscale-[0.2]' : ''}
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
          <div className="bg-primary-soft border-b border-subtle px-3.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-content-muted' : 'bg-primary animate-session-pulse'}`} />
              <span className="text-[11px] font-mono font-semibold text-primary">
                {isPaused ? 'Paused' : 'Focus'} · {tickerText}
              </span>
            </div>
            {activeSession && (
              <div className="text-[11px] font-mono text-content-muted tabular-nums" title="Session in progress">
                {activeSession.wallClockStart || new Date(activeSession.startTime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                {' – '}
                <span className="text-primary">∞</span>
              </div>
            )}
          </div>
        )}

        {/* ── Main Card Body ── */}
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
          {/* Drag Handle */}
          <div
            className="mt-1 cursor-grab active:cursor-grabbing shrink-0 text-content-muted hover:text-content-secondary transition"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={16} />
          </div>

          {/* Content Column */}
          <div className="flex-1 min-w-0">
            {/* EYEBROW: Path / Origin Tags (Goal & Phase) */}
            {originNodes && originNodes.length > 0 ? (
              (() => {
                const badgeNodes = originNodes.filter(n => n.kind === 'goal' || n.kind === 'phase');
                if (badgeNodes.length === 0) return null;
                return (
                  <div className="mb-1.5">
                    <div
                      onClick={(e) => {
                        if (onJumpToGoal) {
                          e.stopPropagation();
                          onJumpToGoal();
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 text-[10px] font-semibold bg-base border border-subtle rounded-lg px-2 py-0.5 ${
                        onJumpToGoal ? 'cursor-pointer hover:border-primary' : ''
                      }`}
                      title={onJumpToGoal ? 'Jump to this task in Goal Blueprint' : undefined}
                    >
                      <Link2 size={10} className="shrink-0 text-primary mr-0.5 group-hover/path:text-primary-glow transition-colors" />
                      {badgeNodes.map((n, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          <span className="text-primary group-hover/path:text-primary-glow transition-colors">
                            {n.title}
                          </span>
                          {i < badgeNodes.length - 1 && (
                            <span className="text-content-muted">•</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : !task.goalNodeId ? (
              <div className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-lg">
                Quick task
              </div>
            ) : null}

            {/* Title Row */}
            <div className="flex items-start justify-between gap-3 pr-1">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${ps.dot}`} />
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <h3 className={`text-[15px] font-semibold leading-snug transition-colors duration-200 ${
                    complete ? 'animate-strike text-content-muted' : 'text-content-primary'
                  }`}>
                    {task.title}
                  </h3>
                  {task.description && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenDescription) {
                          onOpenDescription(task.title, task.description);
                        }
                      }}
                      className="inline-flex items-center gap-1 font-medium text-[11px] text-content-secondary hover:text-primary-glow transition-colors shrink-0"
                      title="View full description"
                    >
                      <FileText size={11} className="text-primary shrink-0" />
                      <span>Description</span>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Circular Play/Pause "Music Player" Chip (Right Aligned) */}
              {isSessionTask && (
                <button
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    if (e.pointerType === 'mouse' && e.button !== 0) return;
                    skipClickAfterAmbient.current = false;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    clearLongPress();
                    longPressTimer.current = window.setTimeout(openAmbient, 450);
                  }}
                  onPointerUp={(e) => {
                    e.stopPropagation();
                    clearLongPress();
                    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
                  }}
                  onPointerCancel={clearLongPress}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (skipClickAfterAmbient.current) {
                      skipClickAfterAmbient.current = false;
                      return;
                    }
                    if (isPaused) {
                      hapticSessionStart();
                      onResumeSession?.();
                    } else {
                      hapticSessionPause();
                      onPauseSession?.();
                    }
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    hapticAmbient();
                    openAmbient();
                  }}
                  title="Hold for Ambient Mode"
                  className="relative shrink-0 flex items-center justify-center w-[38px] h-[38px] rounded-full group transition-transform active:scale-95"
                >
                  {/* Spinning ring when playing */}
                  {!isPaused && (
                    <div className="absolute inset-0 rounded-full border-[1.5px] border-primary/20 border-t-primary animate-spin" style={{ animationDuration: '3s' }}></div>
                  )}
                  <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full ${
                    isPaused
                      ? 'bg-primary text-on-primary'
                      : 'bg-primary-soft text-primary'
                  }`}>
                    {isPaused ? <Play className="w-3.5 h-3.5 fill-current ml-[1.5px]" /> : <Pause className="w-3.5 h-3.5 fill-current" />}
                  </div>
                </button>
              )}
            </div>

            {/* SUBTITLE: Sections and Subtasks Context */}
            {originNodes && originNodes.length > 0 && (() => {
              const ctxNodes = originNodes.filter(n => n.kind !== 'goal' && n.kind !== 'phase');
              if (ctxNodes.length === 0) return null;
              return (
                <div className="mt-1 flex items-center flex-wrap gap-1 text-[11px] text-content-muted font-normal ml-3.5">
                  {ctxNodes.map((n, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span>{n.title}</span>
                      {i < ctxNodes.length - 1 && <span className="text-content-muted/60">/</span>}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Date / Deadline / Description Row */}
            <div className="mt-2.5 flex items-center gap-3 text-[11px] text-content-secondary font-medium flex-wrap ml-3.5">
              <span className="inline-flex items-center gap-1">
                <Calendar size={11} className="text-content-muted" /> {fmtDate(task.targetDate)}
              </span>
              {isBacklogTask(task) && (
                <span className="inline-flex items-center font-semibold text-[10px] text-error bg-error-soft px-2 py-0.5 rounded-lg">
                  Backlog
                </span>
              )}
              {task.deadline && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  new Date(task.deadline).getTime() < Date.now() ? 'text-error' : ''
                }`}>
                  <Clock size={11} className={new Date(task.deadline).getTime() < Date.now() ? "text-error" : "text-content-muted"} /> {fmtCountdown(task.deadline)}
                </span>
              )}
            </div>
          </div>
        </div>

        {hasSteps && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent">
            <div
              className={`h-full ${ps.bar} opacity-80`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        )}
      </div>

      <Overlay open={expanded} onClose={() => setExpanded(false)} align="center">
        <div className="panel sheet-up max-h-[85vh] overflow-y-auto no-scrollbar p-4 space-y-4" onClick={(e) => e.stopPropagation()}>
          <div className="space-y-1.5">
            {originNodes && originNodes.filter((n) => n.kind === 'goal' || n.kind === 'phase').length > 0 && (
              <p className="text-[11px] font-semibold text-primary">
                {originNodes.filter((n) => n.kind === 'goal' || n.kind === 'phase').map((n) => n.title).join(' · ')}
              </p>
            )}
            <h3 className={`text-[16px] font-semibold leading-snug ${complete ? 'line-through text-content-muted' : 'text-content-primary'}`}>
              {task.title}
            </h3>
            {originNodes && originNodes.filter((n) => n.kind !== 'goal' && n.kind !== 'phase').length > 0 && (
              <p className="text-[12px] text-content-muted leading-snug">
                {originNodes.filter((n) => n.kind !== 'goal' && n.kind !== 'phase').map((n) => n.title).join(' / ')}
              </p>
            )}
          </div>

          {hasSteps && (
            <div className="bg-surface border border-subtle rounded-[12px] overflow-hidden">
              <div className="flex items-center justify-between px-3.5 h-10">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">Steps</span>
                <span className={`text-[11px] font-medium tabular-nums ${task.progress === task.steps.length ? 'text-secondary' : 'text-content-secondary'}`}>
                  {task.progress}/{task.steps.length}
                </span>
              </div>
              <ul>
                {task.steps.map((s, i) => {
                  const done = i < task.progress;
                  let stamp: string | null = null;
                  if (done && taskSessions) {
                    const sess = taskSessions.find((item) => item.completedStepIndices?.includes(i));
                    if (sess?.manual) stamp = 'Manual';
                    else if (sess) stamp = `${sess.wallClockStart} – ${sess.wallClockEnd || 'now'}`;
                  }
                  return (
                    <li key={i} className="flex items-center gap-3 px-3.5 h-11 border-t border-subtle">
                      <span className="w-5 h-5 grid place-items-center shrink-0">
                        {done ? (
                          <Check size={15} strokeWidth={2.25} className="text-secondary" />
                        ) : (
                          <span className="w-[7px] h-[7px] rounded-full bg-[color:var(--text-muted)] opacity-50" />
                        )}
                      </span>
                      <span className={`flex-1 min-w-0 text-[13px] truncate ${done ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                        {s}
                      </span>
                      {stamp && (
                        <span className="text-[11px] tabular-nums text-content-muted shrink-0">
                          {stamp}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">Actions</p>
            {isSessionTask ? (
              <button
                onClick={() => { setExpanded(false); onStopSession?.(); }}
                className="w-full py-3 px-4 rounded-[12px] bg-error text-white font-semibold text-[13px] flex items-center justify-center gap-2"
              >
                <Square className="w-4 h-4 fill-current" />
                Stop session
              </button>
            ) : (
              <button
                onClick={() => { setExpanded(false); hapticSessionStart(); onStartSession?.(task.id); }}
                className="w-full py-3 px-4 rounded-[12px] btn-primary text-[13px] flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                Start focus session
              </button>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setExpanded(false); onViewStats?.(task); }}
                className="py-2.5 rounded-[12px] bg-surface text-content-primary border border-subtle text-[12px] font-medium flex items-center justify-center gap-1.5"
              >
                <BarChart2 className="w-3.5 h-3.5 text-primary" />
                Stats
              </button>
              <button
                onClick={() => {
                  setExpanded(false);
                  if (task.goalNodeId && onJumpToGoal) onJumpToGoal();
                  else onAdvance(task.id);
                }}
                className="py-2.5 rounded-[12px] bg-surface text-content-primary border border-subtle text-[12px] font-medium flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-secondary" />
                {task.goalNodeId ? 'Jump' : 'Advance'}
              </button>
              <button
                onClick={() => { setExpanded(false); onDuplicate(task.id); }}
                className="py-2.5 rounded-[12px] bg-surface text-content-primary border border-subtle text-[12px] font-medium flex items-center justify-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5 text-primary" />
                Duplicate
              </button>
              <button
                onClick={() => { setExpanded(false); onDelete(task.id); }}
                className="py-2.5 rounded-[12px] bg-error-soft text-error border border-subtle text-[12px] font-medium flex items-center justify-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {softRemove ? 'Remove' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      </Overlay>
    </>
  );
}
