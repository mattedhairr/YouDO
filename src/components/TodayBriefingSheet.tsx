import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, CheckCircle2, ListTodo, Flame, ChevronRight, Repeat } from 'lucide-react';
import Overlay from './Overlay';
import type { Task, TaskSession } from '../types';
import { formatDuration } from '../lib/format';
import { isCountableSession, sessionOverlapsLocalDate } from '../lib/sessionStats';
import { hapticSuccess, hapticTap } from '../lib/haptics';
import { localISODate, shiftLocalISO } from '../lib/dates';
import type { StreakView } from '../lib/focusTrends';

interface Props {
  open: boolean;
  todayTasks: Task[];
  openTodayCount: number;
  todayDone: number;
  openBacklogCount: number;
  oldestBacklogDays: number | null;
  streakStatus: StreakView;
  sessionHistory: Record<string, TaskSession[]>;
  onDismiss: () => void;
}

/** Classic slide-to-unlock: must drag near the end, then release. */
const UNLOCK_THRESHOLD = 0.92;
const THUMB_PX = 40;
const TRACK_PAD = 6;
const TRACK_H = 52;

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub: string;
  valueClass: string;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-[18px] font-semibold tabular-nums leading-none ${valueClass}`}>{value}</p>
      <p className="text-[11px] text-content-secondary mt-1">{sub}</p>
    </div>
  );
}

function streakCardCopy(status: StreakView): { value: string | number; sub: string } {
  if (status.current > 0) {
    return {
      value: status.current,
      sub: status.current === 1 ? 'day with focus' : 'days with focus',
    };
  }
  if (status.revive?.active) {
    const tasks = status.revive.remainingTasks;
    const days = status.revive.daysLeft;
    const taskBit = `${tasks} left`;
    const dayBit = days === 1 ? '1 day' : `${days} days`;
    return { value: status.revive.previousStreak, sub: `${taskBit} · ${dayBit}` };
  }
  if (status.brokenDays > 0) {
    return {
      value: 0,
      sub: status.brokenDays === 1 ? 'broken 1 day' : `broken ${status.brokenDays} days`,
    };
  }
  return { value: 0, sub: 'start one' };
}

function backlogWaitSub(count: number, oldestDays: number | null): string {
  if (count === 0) return 'none open';
  if (oldestDays == null) return 'open';
  if (oldestDays <= 0) return 'waiting today';
  if (oldestDays === 1) return 'oldest 1 day';
  return `oldest ${oldestDays} days`;
}

export default function TodayBriefingSheet({
  open,
  todayTasks,
  openTodayCount,
  todayDone,
  openBacklogCount,
  oldestBacklogDays,
  streakStatus,
  sessionHistory,
  onDismiss,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const confirmedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [knobAnimating, setKnobAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [trackWidth, setTrackWidth] = useState(280);

  const todayStr = localISODate(new Date());
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const todayFocusMs = useMemo(() => {
    const all = Object.values(sessionHistory).flat();
    return all.reduce((acc, s) => {
      if (!isCountableSession(s)) return acc;
      const slice = sessionOverlapsLocalDate(s, todayStr);
      return acc + (slice?.netFocusMs ?? 0);
    }, 0);
  }, [sessionHistory, todayStr]);

  const yesterdayStr = shiftLocalISO(todayStr, -1);
  const yesterdayFocusMs = useMemo(() => {
    const all = Object.values(sessionHistory).flat();
    return all.reduce((acc, s) => {
      if (!isCountableSession(s)) return acc;
      const slice = sessionOverlapsLocalDate(s, yesterdayStr);
      return acc + (slice?.netFocusMs ?? 0);
    }, 0);
  }, [sessionHistory, yesterdayStr]);

  const scheduledTotal = todayTasks.length;
  const remainingToday = openTodayCount;
  const startedToday = todayDone > 0 || todayFocusMs > 0;
  const streakCopy = streakCardCopy(streakStatus);

  const headline = useMemo(() => {
    if (!startedToday) {
      if (scheduledTotal === 0 && openBacklogCount === 0) {
        return 'Clear slate — schedule something from Goals, or add a quick task.';
      }
      if (scheduledTotal === 0) return 'Nothing scheduled. The backlog is the menu.';
      if (openBacklogCount === 0) return 'Today is fully planned.';
      return 'Here’s the day.';
    }
    if (remainingToday === 0) return 'Today’s board is clear.';
    return 'Work in progress.';
  }, [startedToday, scheduledTotal, openBacklogCount, remainingToday]);

  const maxTravel = Math.max(0, trackWidth - THUMB_PX - TRACK_PAD * 2);

  const setKnobProgress = useCallback((next: number) => {
    setProgress(Math.min(1, Math.max(0, next)));
  }, []);

  const finish = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    setKnobProgress(1);
    setConfirmed(true);
    setExiting(true);
    hapticSuccess();
    window.setTimeout(() => onDismiss(), 480);
  }, [onDismiss, setKnobProgress]);

  const resetSlider = useCallback(() => {
    confirmedRef.current = false;
    dragging.current = false;
    setIsDragging(false);
    setKnobAnimating(false);
    setKnobProgress(0);
    setConfirmed(false);
    setExiting(false);
  }, [setKnobProgress]);

  useEffect(() => {
    if (!exiting) return;
    const layer = document.querySelector('#overlay-root .overlay-layer') as HTMLElement | null;
    if (!layer) return;
    layer.style.transition = 'opacity 420ms cubic-bezier(0.4, 0, 0.2, 1)';
    layer.style.opacity = '0';
  }, [exiting]);

  useLayoutEffect(() => {
    if (!open) return;
    const el = trackRef.current;
    if (!el) return;
    setTrackWidth(el.clientWidth);
  }, [open]);

  useEffect(() => {
    if (open) resetSlider();
  }, [open, resetSlider]);

  const progressFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, rect.width - THUMB_PX - TRACK_PAD * 2);
    return Math.min(1, Math.max(0, (clientX - rect.left - TRACK_PAD - THUMB_PX / 2) / travel));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (confirmedRef.current) return;
    dragging.current = true;
    setIsDragging(true);
    setKnobAnimating(false);
    hapticTap();
    e.currentTarget.setPointerCapture(e.pointerId);
    setKnobProgress(progressFromClientX(e.clientX));
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || confirmedRef.current) return;
    setKnobProgress(progressFromClientX(e.clientX));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (confirmedRef.current) return;

    setKnobAnimating(true);
    const releaseProgress = progressFromClientX(e.clientX);
    if (releaseProgress >= UNLOCK_THRESHOLD) {
      finish();
      return;
    }
    setKnobProgress(0);
  };

  if (!open) return null;

  const glow = confirmed ? 1 : Math.min(1, progress / UNLOCK_THRESHOLD);

  return (
    <Overlay open={open} scrim align="center">
      <div
        className={`panel sheet-up p-5 space-y-4 w-full max-w-sm briefing-sheet ${exiting ? 'briefing-sheet--exit' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{dateLabel}</p>
          <h3 className="text-[17px] font-semibold text-content-primary mt-1">Today at a glance</h3>
          <p className="text-[13px] text-content-secondary leading-relaxed mt-1.5">{headline}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {startedToday ? (
            <>
              <StatCard
                icon={<CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />}
                label="Left"
                value={remainingToday}
                sub={scheduledTotal === 0 ? 'nothing planned' : remainingToday === 0 ? 'board clear' : 'still open'}
                valueClass="text-content-primary"
              />
              <StatCard
                icon={<CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" />}
                label="Done"
                value={todayDone}
                sub="closed"
                valueClass="text-secondary"
              />
              <StatCard
                icon={<Flame className="w-3.5 h-3.5 text-primary shrink-0" />}
                label="Focus"
                value={formatDuration(todayFocusMs)}
                sub="net today"
                valueClass="text-primary"
              />
              <StatCard
                icon={<ListTodo className="w-3.5 h-3.5 text-error shrink-0" />}
                label="Backlog"
                value={openBacklogCount}
                sub={backlogWaitSub(openBacklogCount, oldestBacklogDays)}
                valueClass="text-error"
              />
            </>
          ) : (
            <>
              <StatCard
                icon={<CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />}
                label="Today"
                value={scheduledTotal}
                sub={scheduledTotal === 0 ? 'nothing planned' : 'on the board'}
                valueClass="text-content-primary"
              />
              <StatCard
                icon={<ListTodo className="w-3.5 h-3.5 text-error shrink-0" />}
                label="Backlog"
                value={openBacklogCount}
                sub={backlogWaitSub(openBacklogCount, oldestBacklogDays)}
                valueClass="text-error"
              />
              <StatCard
                icon={<Flame className="w-3.5 h-3.5 text-primary shrink-0" />}
                label="Yesterday"
                value={yesterdayFocusMs > 0 ? formatDuration(yesterdayFocusMs) : '0'}
                sub={yesterdayFocusMs > 0 ? 'yesterday' : 'no log yet'}
                valueClass="text-primary"
              />
              <StatCard
                icon={<Repeat className="w-3.5 h-3.5 text-primary shrink-0" />}
                label="Streak"
                value={streakCopy.value}
                sub={streakCopy.sub}
                valueClass="text-primary"
              />
            </>
          )}
        </div>

        <div className="pt-3">
          <div
            ref={trackRef}
            className={`briefing-slider relative overflow-hidden rounded-[999px] border select-none touch-none ${
              confirmed
                ? 'border-primary/50 briefing-slider--done'
                : isDragging
                  ? 'border-primary/35'
                  : 'border-subtle'
            }`}
            style={{
              height: TRACK_H,
              boxShadow: confirmed
                ? '0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent), 0 8px 28px color-mix(in srgb, var(--primary) 18%, transparent)'
                : isDragging
                  ? '0 0 0 1px color-mix(in srgb, var(--primary) 18%, transparent), 0 6px 20px color-mix(in srgb, black 22%, transparent)'
                  : 'inset 0 1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
            }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Slide to Got it"
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 58%, var(--bg-surface)), color-mix(in srgb, var(--bg-surface) 90%, var(--bg-base)))',
                boxShadow:
                  'inset 0 2px 6px color-mix(in srgb, black 30%, transparent), inset 0 -1px 0 color-mix(in srgb, var(--text-primary) 4%, transparent)',
              }}
            />

            {!isDragging && !confirmed && progress < 0.08 && (
              <div className="briefing-slider-sheen pointer-events-none" aria-hidden />
            )}

            <div
              className={`absolute inset-y-[5px] left-[5px] rounded-[999px] pointer-events-none ${
                knobAnimating && !isDragging ? 'transition-[width,opacity,box-shadow] duration-300 ease-out' : ''
              }`}
              style={{
                width: `${THUMB_PX + TRACK_PAD + progress * maxTravel}px`,
                maxWidth: `calc(100% - 10px)`,
                background: confirmed
                  ? 'linear-gradient(90deg, color-mix(in srgb, var(--primary) 42%, transparent), color-mix(in srgb, var(--primary-glow) 28%, transparent))'
                  : 'linear-gradient(90deg, color-mix(in srgb, var(--primary) 32%, transparent) 0%, color-mix(in srgb, var(--primary-glow) 16%, transparent) 72%, transparent 100%)',
                opacity: 0.5 + glow * 0.5,
                boxShadow:
                  glow > 0.4
                    ? `0 0 ${14 + glow * 16}px color-mix(in srgb, var(--primary) ${18 + glow * 18}%, transparent)`
                    : undefined,
              }}
            />

            <p
              className={`briefing-slider-label absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-[17px] font-semibold tracking-[0.07em] leading-none pointer-events-none whitespace-nowrap ${
                !isDragging && !confirmed && progress < 0.08 ? 'briefing-slider-label--idle' : ''
              }`}
              style={{
                color:
                  glow > 0.55
                    ? 'var(--primary-glow)'
                    : 'color-mix(in srgb, var(--text-secondary) 82%, var(--primary-glow) 18%)',
                opacity: Math.max(0.22, 0.82 - progress * 0.85 + glow * 0.12),
                textShadow:
                  glow > 0.4
                    ? `0 0 ${6 + glow * 10}px color-mix(in srgb, var(--primary) 30%, transparent)`
                    : '0 1px 0 color-mix(in srgb, black 18%, transparent)',
                transition: 'color 220ms ease, opacity 220ms ease, text-shadow 220ms ease',
              }}
              aria-hidden
            >
              Got it!
            </p>

            <button
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`briefing-slider-knob absolute top-1/2 z-[2] flex items-center justify-center rounded-full touch-none will-change-transform ${
                knobAnimating && !isDragging ? 'briefing-slider-knob--snap' : ''
              } ${confirmed ? 'briefing-slider-knob--done' : ''} ${isDragging ? 'briefing-slider-knob--drag' : ''}`}
              style={{
                width: THUMB_PX,
                height: THUMB_PX,
                left: TRACK_PAD,
                transform: `translate3d(${progress * maxTravel}px, -50%, 0) scale(${
                  confirmed ? 1.06 : isDragging ? 1.08 : 1
                })`,
              }}
              aria-label="Got it"
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full briefing-slider-knob-face"
                style={{
                  background: confirmed
                    ? 'linear-gradient(165deg, color-mix(in srgb, var(--secondary) 70%, white) 0%, var(--secondary) 55%, color-mix(in srgb, var(--secondary) 80%, black) 100%)'
                    : 'linear-gradient(165deg, color-mix(in srgb, var(--primary-glow) 95%, white) 0%, var(--primary) 48%, color-mix(in srgb, var(--primary) 85%, black) 100%)',
                  boxShadow: confirmed
                    ? '0 0 0 1px color-mix(in srgb, var(--secondary) 55%, transparent), 0 6px 20px color-mix(in srgb, var(--secondary) 35%, transparent), inset 0 1px 0 color-mix(in srgb, white 35%, transparent)'
                    : isDragging
                      ? '0 0 0 1px color-mix(in srgb, var(--primary-glow) 55%, transparent), 0 6px 22px color-mix(in srgb, var(--primary) 40%, transparent), inset 0 1px 0 color-mix(in srgb, white 35%, transparent)'
                      : '0 2px 10px color-mix(in srgb, black 34%, transparent), 0 0 0 1px color-mix(in srgb, var(--primary-glow) 35%, transparent), inset 0 1px 0 color-mix(in srgb, white 30%, transparent)',
                }}
              />
              {confirmed ? (
                <Check
                  size={18}
                  strokeWidth={2.75}
                  className="relative z-[1] text-on-primary drop-shadow-[0_1px_0_color-mix(in_srgb,black_25%,transparent)]"
                />
              ) : (
                <ChevronRight
                  size={20}
                  strokeWidth={2.5}
                  className="relative z-[1] text-on-primary drop-shadow-[0_1px_0_color-mix(in_srgb,black_25%,transparent)]"
                />
              )}
            </button>
          </div>
          <p
            className="mt-2 text-center text-[11px] text-content-muted tracking-wide transition-opacity duration-300"
            style={{ opacity: exiting ? 0 : 1 }}
          >
            Slide to continue
          </p>
        </div>
      </div>
    </Overlay>
  );
}
