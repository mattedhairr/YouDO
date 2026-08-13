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
  task, activeSession, onAdvance, onUndo: _onUndo, onDelete, onDuplicate,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, originNodes, softRemove, dark: _dark = true,
  onCardClick, backlogAction: _backlogAction, onJumpToGoal, onOpenDescription,
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
          overflow-hidden transition-all p-0 relative rounded-2xl bg-[#14111F] border border-white/5
          ${expanded ? 'z-40 ring-1 ring-violet-500/50 shadow-2xl' : 'shadow-sm'}
          ${isDragging ? 'dragging-card' : ''}
          ${dragOver  ? 'drag-over-card ring-2 ring-emerald-500' : ''}
          ${isSessionTask ? 'card-session-active' : ''}
          ${complete && !expanded ? 'opacity-60 ring-1 ring-emerald-500/20' : ''}
          ${complete && expanded ? 'ring-1 ring-emerald-500/20' : ''}
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
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-3.5 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-2.5 w-2.5">
                {!isPaused && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isPaused ? 'bg-amber-500/50' : 'bg-amber-500'}`}></span>
              </span>
              <span className={`text-[11px] font-mono font-bold ${isPaused ? 'text-amber-500/70' : 'text-amber-400'}`}>
                {isPaused ? 'PAUSED' : 'SESSION RUNNING'} • {tickerText}
              </span>
            </div>

            {/* Session Timestamp */}
            {activeSession && (
              <div className="text-[10.5px] font-mono text-amber-500/80 font-bold tracking-tight">
                ({new Date(activeSession.startTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ∞)
              </div>
            )}
          </div>
        )}

        {/* ── Main Card Body ── */}
        <div className="flex items-start gap-2.5 px-3.5 pt-3.5 pb-3">
          {/* Drag Handle */}
          <div
            className="mt-1 cursor-grab active:cursor-grabbing shrink-0 text-slate-600 hover:text-slate-400 transition"
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
                      className={`inline-flex items-center gap-1.5 text-[10px] font-extrabold bg-[#1A1625] border border-white/5 rounded-lg px-2 py-0.5 leading-normal shadow-xs ${
                        onJumpToGoal ? 'cursor-pointer hover:bg-[#1F1B2C] hover:border-violet-500/20 transition-all group/path' : ''
                      }`}
                      title={onJumpToGoal ? 'Jump to this task in Goal Blueprint' : undefined}
                    >
                      <Link2 size={10} className="shrink-0 text-violet-500 mr-0.5 group-hover/path:text-violet-400 transition-colors" />
                      {badgeNodes.map((n, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5">
                          <span className="text-violet-300 group-hover/path:text-violet-200 transition-colors">
                            {n.title}
                          </span>
                          {i < badgeNodes.length - 1 && (
                            <span className="text-white/20">•</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()
            ) : !task.goalNodeId ? (
              <div className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-extrabold text-violet-400 bg-[#1A1625] border border-white/5 px-2 py-0.5 rounded-lg shadow-xs">
                ⚡ Quick Task
              </div>
            ) : null}

            {/* Title Row */}
            <div className="flex items-start justify-between gap-3 pr-1">
              <div className="flex items-start gap-2 flex-1">
                <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${ps.dot} shadow-sm ${ps.glow}`} />
                <h3 className={`text-[15px] font-bold leading-snug tracking-tight ${
                  complete ? 'line-through text-slate-500' : 'text-slate-100'
                }`}>
                  {task.title}
                </h3>
              </div>
              
              {/* Circular Play/Pause "Music Player" Chip (Right Aligned) */}
              {isSessionTask && (
                <button
                  onClick={(e) => { e.stopPropagation(); isPaused ? onResumeSession?.() : onPauseSession?.(); }}
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
                    <div className="absolute inset-0 rounded-full border-[1.5px] border-amber-500/20 border-t-amber-500 border-r-amber-500 animate-spin" style={{ animationDuration: '3s' }}></div>
                  )}
                  <div className={`relative z-10 flex items-center justify-center w-7 h-7 rounded-full transition-colors ${
                    isPaused 
                      ? 'bg-amber-500 text-[#14111F] shadow-[0_0_12px_rgba(245,158,11,0.5)] group-hover:bg-amber-400' 
                      : 'bg-amber-500/20 text-amber-400 group-hover:bg-amber-500/30'
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
                <div className="mt-1 flex items-center flex-wrap gap-1 text-[10.5px] text-slate-500 font-semibold tracking-wide ml-3.5">
                  {ctxNodes.map((n, i) => (
                    <span key={i} className="inline-flex items-center gap-1">
                      <span>{n.title}</span>
                      {i < ctxNodes.length - 1 && <span className="text-white/10">/</span>}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Date / Deadline / Description Row */}
            <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-500 font-medium flex-wrap ml-3.5">
              {task.originalTargetDate && (
                <span className="inline-flex items-center gap-1 font-bold text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-lg">
                  📋 Backlog
                </span>
              )}
              
              {/* Completed Session Timestamp removed from here as per user request */}

              <span className="inline-flex items-center gap-1">
                <Calendar size={11} className="text-slate-600" /> {fmtDate(task.targetDate)}
              </span>
              {task.deadline && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  new Date(task.deadline).getTime() < Date.now() ? 'text-rose-500' : ''
                }`}>
                  <Clock size={11} className={new Date(task.deadline).getTime() < Date.now() ? "text-rose-500" : "text-slate-600"} /> {fmtCountdown(task.deadline)}
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
                  className="inline-flex items-center gap-1 font-medium hover:text-violet-300 transition-colors"
                  title="View full description"
                >
                  <FileText size={11} className="text-violet-500/70 shrink-0" />
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
                <div className="text-[9px] font-extrabold text-[#5F5980] uppercase tracking-widest flex items-center justify-between">
                  <span>Micro Tasks</span>
                  <span className={task.progress === task.steps.length ? 'text-emerald-400' : 'text-[#5F5980]'}>
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
                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.25)]' 
                            : 'bg-transparent border-white/10 group-hover/step:border-white/30'}
                        `}>
                           {done && <CheckCircle2 className="w-3 h-3 text-white" strokeWidth={3} />}
                        </span>
                        <div className="flex-1 flex items-start justify-between gap-3 min-w-0">
                          <span className={`text-[12px] leading-[1.4] break-words ${
                            done ? 'line-through text-[#5F5980]' : 'text-[#EEE9FC]'
                          }`}>
                            {s}
                          </span>
                          {stamp && (
                            <span className="shrink-0 text-[10px] font-mono text-amber-500/50 font-bold whitespace-nowrap bg-amber-500/5 px-1.5 py-0.5 rounded-md self-start mt-0.5">
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
                <div className="h-px w-3/4 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
              </div>
            )}

            {/* ── ZONE 2: ACTIONS ── */}
            <div className="flex flex-col gap-2">
              <div className="text-[9px] font-extrabold text-[#5F5980] uppercase tracking-widest text-center mb-0.5">
                Actions
              </div>
              
              {/* Primary Action Button (Start / Stop Session) */}
              {isSessionTask ? (
                <button
                  onClick={() => { setExpanded(false); if (onStopSession) onStopSession(); }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-rose-600 hover:bg-rose-500 active:scale-[0.98] text-white font-black text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                  Stop Active Session
                </button>
              ) : (
                <button
                  onClick={() => { setExpanded(false); if (onStartSession) onStartSession(task.id); }}
                  className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-black font-black text-[13px] flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Start Focus Session
                </button>
              )}

              {/* Secondary Actions 2x2 Grid */}
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  onClick={() => { setExpanded(false); if (onViewStats) onViewStats(task); }}
                  className="py-2.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <BarChart2 className="w-3.5 h-3.5 text-amber-400" />
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
                  className="py-2.5 px-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 border border-emerald-500/20 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {task.goalNodeId ? 'Jump' : 'Advance'}
                </button>

                <button
                  onClick={() => { setExpanded(false); onDuplicate(task.id); }}
                  className="py-2.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-violet-400" />
                  Duplicate
                </button>

                <button
                  onClick={() => { setExpanded(false); onDelete(task.id); }}
                  className="py-2.5 px-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors"
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
