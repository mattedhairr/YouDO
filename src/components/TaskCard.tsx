import { useState, useEffect, useRef } from 'react';
import { Calendar, Clock, Copy, FileText, GripVertical, Link2, Play, Pause, Square, BarChart2, Trash2, CheckCircle2 } from 'lucide-react';
import type { Priority, Task, ActiveSession, TaskSession } from '../types';
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

const priorityStyles: Record<Priority, { dot: string; bar: string; glow: string }> = {
  high:   { dot: 'bg-error',   bar: 'bg-error',   glow: 'shadow-sm' },
  medium: { dot: 'bg-accent',  bar: 'bg-accent',  glow: 'shadow-sm' },
  low:    { dot: 'bg-secondary', bar: 'bg-secondary', glow: 'shadow-sm' },
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
  
  useEffect(() => {
    if (expanded) {
      document.body.classList.add('task-card-expanded');
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    } else {
      document.body.classList.remove('task-card-expanded');
    }
    return () => document.body.classList.remove('task-card-expanded');
  }, [expanded]);


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
      {/* Expanded Dimmed Overlay Backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 z-30 bg-black/50 dark:bg-black/60 backdrop-blur-[2px] transition-opacity animate-fade-in"
          onClick={() => setExpanded(false)}
        />
      )}

      <div
        ref={cardRef}
        className={`
          overflow-hidden transition-all p-0 relative rounded-2xl border border-subtle
          ${expanded ? 'z-40 shadow-elevated bg-elevated' : 'bg-surface shadow-card'}
          ${isDragging ? 'dragging-card' : ''}
          ${dragOver  ? 'drag-over-card ring-2 ring-primary' : ''}
          ${isSessionTask ? 'card-session-active' : ''}
          ${complete ? 'opacity-60' : ''}
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
          <div className="bg-accent/10 border-b border-warning/20 px-3.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPaused ? 'bg-accent/50' : 'bg-accent'}`}></span>
              </span>
              <span className={`text-[11px] font-mono font-bold ${isPaused ? 'text-warning/70' : 'text-warning'}`}>
                {isPaused ? 'PAUSED' : 'SESSION RUNNING'} • {tickerText}
              </span>
            </div>

            {/* Session Timestamp */}
            {activeSession && (
              <div className="text-[10.5px] font-mono text-warning/80 font-bold tracking-tight">
                ({new Date(activeSession.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ∞)
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
                      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-elevated border border-subtle rounded-lg px-2 py-0.5 leading-normal shadow-xs ${
                        onJumpToGoal ? 'cursor-pointer hover:bg-primary-soft hover:border-primary/20 transition-all group/path' : ''
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
              <div className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-primary bg-elevated border border-subtle px-2 py-0.5 rounded-lg shadow-xs">
                ⚡ Quick Task
              </div>
            ) : null}

            {/* Title Row */}
            <div className="flex items-start justify-between gap-3 pr-1">
              <div className="flex items-start gap-2 flex-1">
                <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${ps.dot} shadow-sm ${ps.glow}`} />
                <h3 className={`text-[15px] font-bold leading-snug tracking-tight ${
                  complete ? 'line-through text-content-muted' : 'text-content-primary'
                }`}>
                  {task.title}
                </h3>
              </div>
              
              {/* Circular Play/Pause "Music Player" Chip (Right Aligned) */}
              {isSessionTask && (
                <button
                  onClick={(e) => { e.stopPropagation(); if (isPaused) { onResumeSession?.(); } else { onPauseSession?.(); } }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (onOpenAmbient) onOpenAmbient();
                  }}
                  title="Long press for Ambient Mode"
                  className="relative shrink-0 flex items-center justify-center w-[38px] h-[38px] rounded-full group transition-transform active:scale-95"
                >
                  {/* Spinning ring when playing */}
                  {!isPaused && (
                    <div className="absolute inset-0 rounded-full border-[1.5px] border-warning/20 border-t-accent border-r-accent animate-spin" style={{ animationDuration: '3s' }}></div>
                  )}
                  <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                    isPaused 
                      ? 'bg-accent text-on-accent shadow-[0_0_12px_var(--warning)] group-hover:bg-accent-hover' 
                      : 'bg-accent/20 text-warning group-hover:bg-accent/30'
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
                <div className="mt-1 flex items-center flex-wrap gap-1 text-[10.5px] text-content-secondary font-semibold tracking-wide ml-3.5">
                  {ctxNodes.map((n, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span>{n.title}</span>
                      {i < ctxNodes.length - 1 && <span className="text-content-muted">/</span>}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Date / Deadline / Description Row */}
            <div className="mt-2.5 flex items-center gap-3 text-[11px] text-content-secondary font-medium flex-wrap ml-3.5">
              {task.originalTargetDate && (
                <span className="inline-flex items-center gap-1 font-bold text-[10px] text-error bg-error-soft border border-error px-2 py-0.5 rounded-lg">
                  📋 Backlog
                </span>
              )}
              
              {/* Completed Session Timestamp removed from here as per user request */}

              <span className="inline-flex items-center gap-1">
                <Calendar size={11} className="text-content-muted" /> {fmtDate(task.targetDate)}
              </span>
              {task.deadline && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  new Date(task.deadline).getTime() < Date.now() ? 'text-error' : ''
                }`}>
                  <Clock size={11} className={new Date(task.deadline).getTime() < Date.now() ? "text-error" : "text-content-muted"} /> {fmtCountdown(task.deadline)}
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
                  className="inline-flex items-center gap-1 font-medium hover:text-primary-glow transition-colors"
                  title="View full description"
                >
                  <FileText size={11} className="text-primary shrink-0" />
                  <span className="max-w-[140px] sm:max-w-[200px] truncate">Description</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ── EXPANDED ACTION GRID OVERLAY ── */}
        {expanded && (
          <div
            className="px-4 pb-4 pt-1 animate-fade-in flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── ZONE 1: MICRO TASKS ── */}
            {hasSteps && (
              <div className="flex flex-col gap-2.5">
                <div className="text-[9px] font-extrabold text-content-secondary uppercase tracking-widest flex items-center justify-between">
                  <span>Micro Tasks</span>
                  <span className={task.progress === task.steps.length ? 'text-secondary' : 'text-content-secondary'}>
                    {task.progress}/{task.steps.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {task.steps.map((s, i) => {
                    const done = i < task.progress;
                    let stamp = null;
                    if (done && taskSessions) {
                      const sess = taskSessions.find(sess => sess.completedStepIndices?.includes(i));
                      if (sess) {
                        stamp = `(${sess.wallClockStart} - ${sess.wallClockEnd || '∞'})`;
                      }
                    }
                    return (
                      <div key={i} className="flex items-start gap-2.5 group/step">
                        <span className={`
                          mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors border
                          ${done 
                            ? 'bg-secondary border-secondary text-on-accent shadow-[0_0_8px_var(--secondary)]' 
                            : 'bg-transparent border-subtle group-hover/step:border-content-muted'}
                        `}>
                           {done && <CheckCircle2 className="w-3 h-3 text-on-accent" strokeWidth={3} />}
                        </span>
                        <div className="flex-1 flex items-start justify-between gap-3 min-w-0">
                          <span className={`text-[12px] leading-[1.4] break-words ${
                            done ? 'line-through text-content-muted' : 'text-content-primary'
                          }`}>
                            {s}
                          </span>
                          {stamp && (
                            <span className="shrink-0 text-[10px] font-mono text-warning/80 font-bold whitespace-nowrap bg-accent/10 px-1.5 py-0.5 rounded-md self-start mt-0.5">
                              {stamp}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEPARATOR */}
            {hasSteps && (
              <div className="flex justify-center">
                <div className="h-px w-3/4 bg-subtle" />
              </div>
            )}

            {/* ── ZONE 2: ACTIONS ── */}
            <div className="flex flex-col gap-2">
              <div className="text-[9px] font-extrabold text-content-secondary uppercase tracking-widest text-center mb-0.5">
                Actions
              </div>
              
              {/* Primary Action Button (Start / Stop Session) */}
              {isSessionTask ? (
                <button
                  onClick={() => { setExpanded(false); if (onStopSession) onStopSession(); }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-error hover:bg-error-soft active:scale-[0.98] text-white font-black text-[13px] flex items-center justify-center gap-2 border border-error shadow-sm transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Active Session
                </button>
              ) : (
                <button
                  onClick={() => { setExpanded(false); if (onStartSession) onStartSession(task.id); }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-accent hover:bg-accent-hover active:scale-[0.98] text-on-accent font-black text-[13px] flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Focus Session
                </button>
              )}

              {/* Secondary Actions 2x2 Grid */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => { setExpanded(false); if (onViewStats) onViewStats(task); }}
                  className="py-2.5 px-2 rounded-xl bg-surface hover:bg-elevated text-content-primary border border-subtle text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-warning" />
                  Stats
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
                  className="py-2.5 px-2 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-[11px] font-bold flex items-center justify-center gap-1.5 border border-secondary/30 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {task.goalNodeId ? 'Jump' : 'Advance'}
                </button>

                <button
                  onClick={() => { setExpanded(false); onDuplicate(task.id); }}
                  className="py-2.5 px-2 rounded-xl bg-surface hover:bg-elevated text-content-primary border border-subtle text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-primary" />
                  Duplicate
                </button>

                <button
                  onClick={() => { setExpanded(false); onDelete(task.id); }}
                  className="py-2.5 px-2 rounded-xl bg-error-soft hover:bg-error text-error border border-error-soft text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {softRemove ? 'Remove' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Thin progress bar at bottom */}
        {hasSteps && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-transparent">
            <div
              className={`h-full ${ps.bar} opacity-80`}
              style={{ width: `${fillPct}%` }}
            />
          </div>
        )}
      </div>
    </>
  );
}
