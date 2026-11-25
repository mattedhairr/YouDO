import { lazy, Suspense, useState, useEffect, useRef } from 'react';
import { Calendar, Clock, FileText, Play, Pause, Square, StickyNote, Trash2, CheckCircle2, Check, MoonStar } from 'lucide-react';
import { useUiPrefs } from '../hooks/useUiPrefs';
import type { Priority, Task, ActiveSession, TaskSession } from '../types';
import { isBacklogTask, isTaskComplete } from '../store';
import { hapticSessionStart, hapticSessionPause, hapticAmbient } from '../lib/haptics';
import Overlay from './Overlay';
import { computeNetFocusMs } from '../lib/sessionStats';
import { sessionClockLabel, sessionClockRange } from '../lib/sessionClock';
import ActivityRing from './ActivityRing';
import OriginChip from './OriginChip';
import { ambientTipSeen, markAmbientTipSeen } from '../lib/ambient';

// The v7 TaskCard is only fetched when Classic Look is on, to keep it out of the initial bundle.
const LegacyTaskCard = lazy(() => import('../legacy/LegacyTaskCard'));

interface Props {
  task: Task;
  stepDone?: boolean[];
  activeSession?: ActiveSession | null;
  onAdvance: (id: string) => void;
  onUndo: (id: string) => void;
  onDelete: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnter: (id: string) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragOver: boolean;
  originNodes?: { title: string; kind: string }[];
  softRemove?: boolean;
  dark?: boolean;
  onCardClick?: () => void;
  streakSave?: boolean;
  onJumpToGoal?: () => void;
  onOpenDescription?: (title: string, description: string) => void;
  // Session callbacks
  onStartSession?: (id: string) => void;
  onPauseSession?: () => void;
  onResumeSession?: () => void;
  onStopSession?: () => void;
  onOpenAmbient?: () => void;
  taskSessions?: TaskSession[];
}

const priorityStyles: Record<Priority, { dot: string; bar: string; tone: string; label: string }> = {
  high:   { dot: 'bg-error', bar: 'bg-error', tone: 'var(--error)', label: 'High priority' },
  medium: { dot: 'bg-primary', bar: 'bg-primary', tone: 'var(--primary)', label: 'Medium priority' },
  low:    { dot: 'bg-secondary', bar: 'bg-secondary', tone: 'var(--secondary)', label: 'Low priority' },
};

function fmtDate(iso: string | null): string {
  if (!iso) return 'No date';
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return iso;
  const [y, m, d] = parts;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
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

function ModernTaskCard({
  task, stepDone, activeSession, onAdvance, onDelete,
  onDragStart, onDragEnter, onDragEnd, isDragging, dragOver, originNodes, softRemove,
  onCardClick, onJumpToGoal, onOpenDescription,
  onStartSession, onPauseSession, onResumeSession, onStopSession, onOpenAmbient, taskSessions,
  streakSave,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const longPressTimer = useRef<number | null>(null);
  const skipClickAfterAmbient = useRef(false);

  const isSessionTask = activeSession?.taskId === task.id;
  /** One-time pointer to the ambient clock, shown on the first running session. */
  const [ambientTip, setAmbientTip] = useState(() => !ambientTipSeen());
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
  const originBadgeNodes = originNodes?.slice(0, Math.min(2, originNodes.length)) ?? [];
  const originContextNodes = originNodes?.slice(originBadgeNodes.length) ?? [];

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
        data-task-id={task.id}
        className={`
          overflow-hidden relative rounded-[20px]
          bg-surface shadow-card transition-all duration-300 ease-spring
          active:scale-[0.98]
          ${isDragging ? 'dragging-card' : ''}
          ${dragOver  ? 'drag-over-card ring-2 ring-primary' : ''}
          ${isSessionTask ? 'card-session-active' : ''}
          ${complete ? 'opacity-[0.68] saturate-[0.82]' : ''}
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
          <div className="bg-primary-soft px-4 py-2.5 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-content-muted' : 'bg-primary animate-session-pulse'}`} />
              <span className="text-[13px] font-semibold tabular-nums text-primary">
                {isPaused ? 'Paused' : 'Focus'} · {tickerText}
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              {activeSession && (
                <div className="text-[13px] text-content-secondary tabular-nums" title="Session in progress">
                  {sessionClockLabel(activeSession.startTime, activeSession.wallClockStart)}
                  {' – '}
                  <span className="text-primary">∞</span>
                </div>
              )}
              {onOpenAmbient && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    hapticAmbient();
                    markAmbientTipSeen();
                    setAmbientTip(false);
                    onOpenAmbient();
                  }}
                  aria-label="Open the ambient clock"
                  className="inline-flex h-7 items-center gap-1 rounded-full bg-surface px-2.5 text-[12px] font-semibold text-primary transition-transform active:scale-95"
                >
                  <MoonStar size={13} className="shrink-0" />
                  Ambient
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Main Card Body ── */}
        <div className="flex items-start gap-3 px-4 pt-3.5 pb-3.5">
          {/* Progress ring — Reminders-style leading control, tinted by priority. */}
          <div
            className="mt-0.5 shrink-0 cursor-grab active:cursor-grabbing relative grid place-items-center"
            onClick={(e) => e.stopPropagation()}
            title={ps.label}
            aria-hidden="true"
          >
            {complete ? (
              <span className="w-[26px] h-[26px] rounded-full grid place-items-center text-white" style={{ background: ps.tone }}>
                <Check size={16} strokeWidth={3} />
              </span>
            ) : (
              <ActivityRing progress={hasSteps ? fillPct : 0} size={26} stroke={3} color={ps.tone} />
            )}
          </div>

          {/* Content Column */}
          <div className="flex-1 min-w-0">
            {/* Chip, title and path stack tightly; the play ring sits centred beside
                them instead of stretching the title row. */}
            <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
            {/* EYEBROW: where the task lives (first two path items); the rest of
                the path follows under the title. */}
            {originBadgeNodes.length > 0 ? (
              <div className="mb-1.5">
                <OriginChip names={originBadgeNodes.map((n) => n.title)} onClick={onJumpToGoal} />
              </div>
            ) : !task.goalNodeId ? (
              <div className="mb-0.5 text-[12px] font-semibold text-content-secondary">
                Quick task
              </div>
            ) : null}

            {/* Title Row */}
            <div className="flex items-start justify-between gap-3 pr-1">
              <div className="flex items-start gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                  <h3 className={`text-[17px] font-semibold leading-[22px] transition-colors duration-200 ${
                    complete
                      ? 'line-through decoration-[1px] animate-strike text-content-muted'
                      : 'text-content-primary'
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
                      className="inline-flex items-center gap-1 font-medium text-[13px] text-primary transition-colors shrink-0"
                      title="View full description"
                    >
                      <FileText size={13} className="shrink-0" />
                      <span>Description</span>
                    </button>
                  )}
                </div>
              </div>
              

            </div>

            {/* SUBTITLE: remaining path context. */}
            {originNodes && originNodes.length > 0 && (() => {
              const ctxNodes = originContextNodes;
              if (ctxNodes.length === 0) return null;
              return (
                <div className="mt-1 flex min-w-0 items-center gap-1 whitespace-nowrap text-[13px] text-content-secondary font-normal">
                  {ctxNodes.map((n, i) => (
                    <span key={i} className="inline-flex min-w-0 items-center gap-1">
                      <span className="truncate">{n.title}</span>
                      {i < ctxNodes.length - 1 && <span className="shrink-0 text-content-muted/60">/</span>}
                    </span>
                  ))}
                </div>
              );
            })()}
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

            {!complete && task.resumeNote && (
              <div className="mt-2 flex items-start gap-1.5 rounded-xl bg-primary-soft px-3 py-2 text-[13px] leading-snug text-content-secondary">
                <StickyNote size={12} className="mt-0.5 shrink-0 text-primary" />
                <span className="line-clamp-2"><span className="font-semibold text-primary">Resume:</span> {task.resumeNote}</span>
              </div>
            )}

            {/* Date / Deadline / Description Row */}
            <div className="mt-1.5 flex items-center gap-3 text-[13px] text-content-secondary flex-wrap">
              <span className="inline-flex items-center gap-1">
                <Calendar size={13} className="text-content-muted" /> {fmtDate(task.targetDate)}
              </span>
              {isBacklogTask(task) && (
                <span className="inline-flex items-center font-semibold text-[12px] text-error bg-error-soft px-2 py-0.5 rounded-full">
                  Backlog
                </span>
              )}
              {streakSave && (
                <span className="inline-flex items-center font-semibold text-[12px] text-primary bg-primary-soft px-2 py-0.5 rounded-full">
                  Save streak
                </span>
              )}
              {task.deadline && (
                <span className={`inline-flex items-center gap-1 font-semibold ${
                  new Date(task.deadline).getTime() < Date.now() ? 'text-error' : ''
                }`}>
                  <Clock size={13} className={new Date(task.deadline).getTime() < Date.now() ? "text-error" : "text-content-muted"} /> {fmtCountdown(task.deadline)}
                </span>
              )}
            </div>
          </div>
        </div>
        
      </div>

      {isSessionTask && onOpenAmbient && ambientTip && (
        <Overlay open onClose={() => { markAmbientTipSeen(); setAmbientTip(false); }} align="center">
          <div className="panel sheet-up w-[min(20rem,calc(100vw-2rem))] p-5 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl bg-primary-soft text-primary">
              <MoonStar size={24} />
            </div>
            <h3 className="text-[17px] font-semibold text-content-primary">Meet the ambient clock</h3>
            <p className="mt-1.5 text-[13.5px] leading-snug text-content-secondary">
              Turn your phone sideways during a session, or tap <span className="font-semibold text-primary">Ambient</span> at the top of the card, for a big, calm full-screen timer.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { markAmbientTipSeen(); setAmbientTip(false); }}
                className="h-11 rounded-xl bg-fill text-[14px] font-semibold text-content-primary"
              >
                Got it
              </button>
              <button
                type="button"
                onClick={() => { markAmbientTipSeen(); setAmbientTip(false); hapticAmbient(); onOpenAmbient(); }}
                className="h-11 rounded-xl bg-primary text-[14px] font-semibold text-on-primary"
              >
                Try it
              </button>
            </div>
          </div>
        </Overlay>
      )}

      <Overlay open={expanded} onClose={() => setExpanded(false)} align="bottom">
        <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] min-h-0 flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
          {/* Grab Handle */}
          <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70 shrink-0" />

          {/* Scrollable Content */}
          <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col [&>*]:shrink-0 gap-4">
            
            {/* Header / Info Section */}
            <div className="px-1 space-y-1.5">
              {originBadgeNodes.length > 0 && (
                <p className="text-[13px] font-semibold text-primary">
                  {originBadgeNodes.map((n) => n.title).join(' · ')}
                </p>
              )}
              <h3 className={`text-[22px] font-bold leading-tight ${complete ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                {task.title}
              </h3>
              {originContextNodes.length > 0 && (
                <p className="text-[13px] font-medium text-content-muted leading-snug">
                  {originContextNodes.map((n) => n.title).join(' / ')}
                </p>
              )}
            </div>

            {/* Resume Note Card */}
            {!complete && task.resumeNote && (
              <div className="bg-primary-soft rounded-2xl p-4">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                  <StickyNote size={14} strokeWidth={2.5} /> Continue from here
                </p>
                <p className="mt-2 whitespace-pre-wrap text-[14px] font-medium leading-relaxed text-content-primary">
                  {task.resumeNote}
                </p>
              </div>
            )}

            {/* Steps Card */}
            {hasSteps && (
              <div className="bg-surface rounded-2xl overflow-hidden shadow-card flex flex-col">
                <div className="flex items-center justify-between px-4 h-11 border-b border-[var(--separator)]">
                  <span className="text-[13px] font-semibold text-content-secondary">Steps</span>
                  <span className={`text-[12px] font-bold tabular-nums ${task.progress === task.steps.length ? 'text-secondary' : 'text-content-secondary'}`}>
                    {stepDone ? stepDone.filter(Boolean).length : task.progress} of {task.steps.length}
                  </span>
                </div>
                <ul className="divide-y divide-subtle">
                  {task.steps.map((s, i) => {
                    const done = stepDone?.[i] ?? i < task.progress;
                    let stamp: string | null = null;
                    if (done && taskSessions) {
                      const sess = taskSessions.find((item) => item.completedStepIndices?.includes(i));
                      if (sess?.manual) stamp = 'Manual';
                      else if (sess) stamp = sessionClockRange(sess.startTime, sess.endTime, sess.wallClockStart, sess.wallClockEnd);
                    }
                    return (
                      <li key={i} className="flex items-center gap-3 px-4 h-12 transition-colors bg-surface">
                        <div className="shrink-0">
                          {done ? (
                            <div className="w-[22px] h-[22px] rounded-full bg-primary text-on-primary flex items-center justify-center">
                              <Check size={14} strokeWidth={3} />
                            </div>
                          ) : (
                            <div className="w-[22px] h-[22px] rounded-full border-[1.5px] border-[var(--text-muted)]" />
                          )}
                        </div>
                        <span className={`flex-1 min-w-0 text-[17px] truncate ${done ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                          {s}
                        </span>
                        {stamp && (
                          <span className="text-[11px] font-medium tabular-nums text-content-muted shrink-0 bg-elevated px-2 py-0.5 rounded-md">
                            {stamp}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          {/* Fixed Footer Actions */}
          <div className="flex flex-col gap-2 mt-2 shrink-0">
            {isSessionTask ? (
              <button
                onClick={() => { setExpanded(false); onStopSession?.(); }}
                className="w-full h-[50px] rounded-full bg-error text-white font-semibold text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Square size={16} strokeWidth={2.5} className="fill-current" />
                Stop session
              </button>
            ) : !complete ? (
              <button
                onClick={() => { setExpanded(false); hapticSessionStart(); onStartSession?.(task.id); }}
                className="btn-primary w-full h-[50px] text-[17px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
              >
                <Play size={16} strokeWidth={2.5} className="fill-current" />
                Start focus session
              </button>
            ) : null}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setExpanded(false);
                  if (task.goalNodeId && onJumpToGoal) onJumpToGoal();
                  else if (isSessionTask) onStopSession?.();
                  else onAdvance(task.id);
                }}
                className="flex-1 h-[50px] rounded-full bg-surface text-primary text-[15px] font-semibold flex items-center justify-center gap-2 shadow-card active:opacity-70 transition-opacity"
              >
                <CheckCircle2 size={18} />
                {task.goalNodeId ? 'Jump' : isSessionTask ? 'Finish sitting' : 'Advance'}
              </button>

              {!isSessionTask && (
                <button
                  onClick={() => { setExpanded(false); onDelete(task.id); }}
                  className="flex-1 h-[50px] rounded-full bg-surface text-error text-[15px] font-semibold flex items-center justify-center gap-2 shadow-card active:opacity-70 transition-opacity"
                >
                  <Trash2 size={18} />
                  {softRemove ? 'Remove' : 'Delete task'}
                </button>
              )}
            </div>
          </div>
        </div>
      </Overlay>
    </>
  );
}


/** The redesign, or the v7 TaskCard under Settings → Appearance → Classic look. */
export default function TaskCard(props: Props) {
  const [{ legacyStyle }] = useUiPrefs();
  return legacyStyle ? (
    <Suspense fallback={null}>
      <LegacyTaskCard {...props} />
    </Suspense>
  ) : (
    <ModernTaskCard {...props} />
  );
}
