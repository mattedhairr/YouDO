import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CalendarDays, Check, CheckCircle2, ListTodo, Flame, ChevronRight, Repeat } from 'lucide-react';
import Overlay from './Overlay';
import type { Task, TaskSession } from '../types';
import { formatCountdownHm, formatDuration } from '../lib/format';
import { isCountableSession, sessionOverlapsLocalDate } from '../lib/sessionStats';
import { hapticSuccess, hapticTap, hapticTick } from '../lib/haptics';
import { localISODate, msUntilEndOfLocalISODate, shiftLocalISO } from '../lib/dates';
import { useReviveTimeLeftSub } from '../hooks/useReviveCountdown';
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
const UNLOCK_THRESHOLD = 0.88;
const FLICK_VELOCITY = 0.0022; // progress units per ms
const THUMB_W = 56;
const THUMB_H = 36;
const TRACK_PAD = 6;
const TRACK_H = 48;
const FOLLOW_EASE = 0.28;

function StatCard({
  icon,
  label,
  value,
  sub,
  valueClass,
  valueBroken,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub: string;
  valueClass: string;
  valueBroken?: boolean;
}) {
  return (
    <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-[18px] font-semibold tabular-nums leading-none ${valueClass}`}>
        {valueBroken ? (
          <span className="relative inline-block opacity-75">
            {value}
            <span
              className="pointer-events-none absolute left-[-2px] right-[-2px] top-1/2 h-[2px] -translate-y-1/2 rotate-[-8deg] rounded-full bg-current opacity-70"
              aria-hidden
            />
          </span>
        ) : (
          value
        )}
      </p>
      <p className="text-[11px] text-content-secondary mt-1">{sub}</p>
    </div>
  );
}

function streakCardCopy(
  status: StreakView,
  reviveSub: string | null,
): { value: string | number; sub: string; valueBroken?: boolean } {
  if (status.current > 0) {
    return {
      value: status.current,
      sub: status.current === 1 ? 'day with focus' : 'days with focus',
    };
  }
  if (status.revive?.active && reviveSub) {
    const streak =
      status.revive.previousStreak === 1 ? '1 day' : `${status.revive.previousStreak} days`;
    return { value: streak, sub: reviveSub, valueBroken: true };
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
  const knobRef = useRef<HTMLButtonElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLParagraphElement>(null);
  const dragging = useRef(false);
  const confirmedRef = useRef(false);
  const progressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const rafRef = useRef(0);
  const lastSampleRef = useRef<{ x: number; t: number; p: number } | null>(null);
  const velocityRef = useRef(0);
  const hapticBucketRef = useRef(0);
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [knobAnimating, setKnobAnimating] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [trackWidth, setTrackWidth] = useState(280);
  const [now, setNow] = useState(() => Date.now());

  const todayStr = localISODate(new Date());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [open]);
  const dayLeftMs = msUntilEndOfLocalISODate(todayStr, now);
  const dayLeftClass =
    dayLeftMs <= 0
      ? 'text-content-muted'
      : dayLeftMs < 3_600_000
        ? 'text-error/80'
        : dayLeftMs < 10_800_000
          ? 'text-warning'
          : 'text-content-muted';
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
  const reviveTimeSub = useReviveTimeLeftSub(
    streakStatus.revive?.windowEnds,
    !!streakStatus.revive?.active,
  );
  const streakCopy = useMemo(
    () => streakCardCopy(streakStatus, reviveTimeSub),
    [streakStatus, reviveTimeSub],
  );

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

  const maxTravel = Math.max(0, trackWidth - THUMB_W - TRACK_PAD * 2);

  const paintSlider = useCallback((p: number, draggingNow: boolean) => {
    const travel = Math.max(0, (trackRef.current?.clientWidth ?? trackWidth) - THUMB_W - TRACK_PAD * 2);
    const glow = Math.min(1, p / UNLOCK_THRESHOLD);
    const scale = confirmedRef.current ? 1.04 : draggingNow ? 1.06 : 1;
    if (knobRef.current) {
      knobRef.current.style.transform = `translate3d(${p * travel}px, -50%, 0) scale(${scale})`;
    }
    if (fillRef.current) {
      fillRef.current.style.width = `${THUMB_W + TRACK_PAD + p * travel}px`;
      fillRef.current.style.opacity = String(0.45 + glow * 0.55);
    }
    if (labelRef.current) {
      labelRef.current.style.opacity = String(Math.max(0.18, 0.82 - p * 0.9 + glow * 0.1));
    }
  }, [trackWidth]);

  const setKnobProgress = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    progressRef.current = clamped;
    targetProgressRef.current = clamped;
    setProgress(clamped);
    paintSlider(clamped, dragging.current);
  }, [paintSlider]);

  const finish = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    dragging.current = false;
    setIsDragging(false);
    setKnobAnimating(true);
    setKnobProgress(1);
    setConfirmed(true);
    setExiting(true);
    hapticSuccess();
    window.setTimeout(() => onDismiss(), 520);
  }, [onDismiss, setKnobProgress]);

  const resetSlider = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    confirmedRef.current = false;
    dragging.current = false;
    progressRef.current = 0;
    targetProgressRef.current = 0;
    velocityRef.current = 0;
    hapticBucketRef.current = 0;
    lastSampleRef.current = null;
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

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const progressFromClientX = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const travel = Math.max(1, rect.width - THUMB_W - TRACK_PAD * 2);
    return Math.min(1, Math.max(0, (clientX - rect.left - TRACK_PAD - THUMB_W / 2) / travel));
  };

  const tickDrag = useCallback(() => {
    if (!dragging.current || confirmedRef.current) {
      rafRef.current = 0;
      return;
    }
    const current = progressRef.current;
    const target = targetProgressRef.current;
    const next = current + (target - current) * FOLLOW_EASE;
    progressRef.current = Math.abs(target - next) < 0.001 ? target : next;
    paintSlider(progressRef.current, true);

    const bucket = Math.floor(progressRef.current * 6);
    if (bucket > hapticBucketRef.current && progressRef.current > 0.08) {
      hapticBucketRef.current = bucket;
      hapticTick();
    }

    if (Math.abs(target - progressRef.current) > 0.001) {
      rafRef.current = requestAnimationFrame(tickDrag);
    } else {
      rafRef.current = 0;
      setProgress(progressRef.current);
    }
  }, [paintSlider]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (confirmedRef.current) return;
    dragging.current = true;
    setIsDragging(true);
    setKnobAnimating(false);
    hapticTap();
    hapticBucketRef.current = 0;
    const p = progressFromClientX(e.clientX);
    targetProgressRef.current = p;
    progressRef.current = p;
    lastSampleRef.current = { x: e.clientX, t: performance.now(), p };
    velocityRef.current = 0;
    paintSlider(p, true);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tickDrag);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || confirmedRef.current) return;
    const p = progressFromClientX(e.clientX);
    const now = performance.now();
    const prev = lastSampleRef.current;
    if (prev && now > prev.t) {
      velocityRef.current = (p - prev.p) / (now - prev.t);
    }
    lastSampleRef.current = { x: e.clientX, t: now, p };
    targetProgressRef.current = p;
    if (!rafRef.current) rafRef.current = requestAnimationFrame(tickDrag);
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

    const releaseProgress = Math.max(progressRef.current, progressFromClientX(e.clientX));
    const flicked = velocityRef.current >= FLICK_VELOCITY && releaseProgress >= 0.55;
    setKnobAnimating(true);
    if (releaseProgress >= UNLOCK_THRESHOLD || flicked) {
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
          <p className={`text-[12px] font-semibold tabular-nums mt-1 ${dayLeftClass}`}>
            {dayLeftMs <= 0 ? 'Day ended' : `${formatCountdownHm(dayLeftMs)} left today`}
          </p>
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
                valueBroken={streakCopy.valueBroken}
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
              ref={fillRef}
              className={`absolute left-[6px] rounded-[999px] pointer-events-none ${
                knobAnimating && !isDragging ? 'briefing-slider-fill--snap' : ''
              }`}
              style={{
                top: TRACK_PAD,
                bottom: TRACK_PAD,
                width: `${THUMB_W + TRACK_PAD + progress * maxTravel}px`,
                maxWidth: `calc(100% - ${TRACK_PAD * 2}px)`,
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
              ref={labelRef}
              className={`briefing-slider-label absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-[16px] font-semibold tracking-[0.07em] leading-none pointer-events-none whitespace-nowrap ${
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
              }}
              aria-hidden
            >
              Got it!
            </p>

            <button
              ref={knobRef}
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`briefing-slider-knob absolute top-1/2 z-[2] flex items-center justify-center rounded-full touch-none will-change-transform ${
                knobAnimating && !isDragging ? 'briefing-slider-knob--snap' : ''
              } ${confirmed ? 'briefing-slider-knob--done' : ''} ${isDragging ? 'briefing-slider-knob--drag' : ''}`}
              style={{
                width: THUMB_W,
                height: THUMB_H,
                left: TRACK_PAD,
                transform: `translate3d(${progress * maxTravel}px, -50%, 0) scale(${
                  confirmed ? 1.04 : isDragging ? 1.06 : 1
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
                  size={16}
                  strokeWidth={2.75}
                  className="relative z-[1] text-on-primary drop-shadow-[0_1px_0_color-mix(in_srgb,black_25%,transparent)]"
                />
              ) : (
                <ChevronRight
                  size={17}
                  strokeWidth={2.35}
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
