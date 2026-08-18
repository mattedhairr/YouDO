import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ListTodo, Flame, ChevronRight } from 'lucide-react';
import Overlay from './Overlay';
import type { Task, TaskSession } from '../types';
import { formatDuration } from '../lib/format';
import { isCountableSession, sessionOverlapsLocalDate } from '../lib/sessionStats';
import { hapticSuccess, hapticTap } from '../lib/haptics';
import { localISODate } from '../lib/dates';

interface Props {
  open: boolean;
  todayTasks: Task[];
  openTodayCount: number;
  todayDone: number;
  openBacklogCount: number;
  openBacklogDateCount: number;
  sessionHistory: Record<string, TaskSession[]>;
  onDismiss: () => void;
}

/** Classic slide-to-unlock: must drag near the end, then release. */
const UNLOCK_THRESHOLD = 0.92;
const THUMB_PX = 40;
const TRACK_PAD = 6;
const TRACK_H = 52;

export default function TodayBriefingSheet({
  open,
  todayTasks,
  openTodayCount,
  todayDone,
  openBacklogCount,
  openBacklogDateCount,
  sessionHistory,
  onDismiss,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const confirmedRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
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

  const headline = useMemo(() => {
    if (openTodayCount === 0 && openBacklogCount === 0) {
      return 'Clear slate — schedule something from Goals, or add a quick task.';
    }
    if (openTodayCount === 0 && openBacklogCount > 0) {
      return `Nothing on today. ${openBacklogCount} backlog ${openBacklogCount === 1 ? 'item' : 'items'} waiting.`;
    }
    if (openTodayCount > 0 && openBacklogCount === 0) {
      return `${openTodayCount} ${openTodayCount === 1 ? 'task' : 'tasks'} on today. No open backlog.`;
    }
    return `${openTodayCount} on today · ${openBacklogCount} in backlog.`;
  }, [openTodayCount, openBacklogCount]);

  const maxTravel = Math.max(0, trackWidth - THUMB_PX - TRACK_PAD * 2);

  const setKnobProgress = useCallback((next: number) => {
    setProgress(Math.min(1, Math.max(0, next)));
  }, []);

  const finish = useCallback(() => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    setKnobProgress(1);
    setConfirmed(true);
    hapticSuccess();
    window.setTimeout(() => onDismiss(), 320);
  }, [onDismiss, setKnobProgress]);

  const resetSlider = useCallback(() => {
    confirmedRef.current = false;
    dragging.current = false;
    setIsDragging(false);
    setKnobAnimating(false);
    setKnobProgress(0);
    setConfirmed(false);
  }, [setKnobProgress]);

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
      <div className="panel sheet-up p-5 space-y-4 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">{dateLabel}</p>
          <h3 className="text-[17px] font-semibold text-content-primary mt-1">Today at a glance</h3>
          <p className="text-[13px] text-content-secondary leading-relaxed mt-1.5">{headline}</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Scheduled</span>
            </div>
            <p className="text-[18px] font-semibold text-content-primary tabular-nums leading-none">{openTodayCount}</p>
            <p className="text-[11px] text-content-secondary mt-1">
              {todayDone}/{todayTasks.length} done
            </p>
          </div>
          <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
              <ListTodo className="w-3.5 h-3.5 text-error shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Backlog</span>
            </div>
            <p className="text-[18px] font-semibold text-error tabular-nums leading-none">{openBacklogCount}</p>
            <p className="text-[11px] text-content-secondary mt-1">
              {openBacklogCount === 0
                ? 'None open'
                : `${openBacklogDateCount} ${openBacklogDateCount === 1 ? 'day' : 'days'}`}
            </p>
          </div>
          <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-secondary shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Done today</span>
            </div>
            <p className="text-[18px] font-semibold text-secondary tabular-nums leading-none">{todayDone}</p>
            <p className="text-[11px] text-content-secondary mt-1">of {todayTasks.length} scheduled</p>
          </div>
          <div className="bg-surface border border-subtle rounded-[12px] p-3 min-w-0">
            <div className="flex items-center gap-1.5 text-content-muted mb-1.5">
              <Flame className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Focus so far</span>
            </div>
            <p className="text-[18px] font-semibold text-primary tabular-nums leading-none">
              {formatDuration(todayFocusMs)}
            </p>
            <p className="text-[11px] text-content-secondary mt-1">net focus today</p>
          </div>
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
                color: confirmed
                  ? 'var(--primary-glow)'
                  : glow > 0.55
                    ? 'var(--primary-glow)'
                    : 'color-mix(in srgb, var(--text-secondary) 82%, var(--primary-glow) 18%)',
                opacity: confirmed
                  ? 1
                  : Math.max(0.28, 0.82 - progress * 0.72 + glow * 0.18),
                textShadow: confirmed
                  ? '0 0 16px color-mix(in srgb, var(--primary) 50%, transparent)'
                  : glow > 0.4
                    ? `0 0 ${6 + glow * 10}px color-mix(in srgb, var(--primary) 30%, transparent)`
                    : '0 1px 0 color-mix(in srgb, black 18%, transparent)',
                transition: 'color 200ms ease, opacity 200ms ease, text-shadow 200ms ease',
              }}
              aria-hidden
            >
              {confirmed ? 'Done' : 'Got it!'}
            </p>

            <span
              className={`briefing-slider-hints absolute right-3.5 top-1/2 -translate-y-1/2 z-[1] pointer-events-none flex items-center gap-0.5 ${
                !isDragging && !confirmed && progress < 0.08 ? 'briefing-slider-hints--idle' : ''
              }`}
              style={{
                opacity: Math.max(0, 0.55 - progress * 0.75),
              }}
              aria-hidden
            >
              <ChevronRight size={12} strokeWidth={2.5} className="text-content-muted opacity-50" />
              <ChevronRight size={12} strokeWidth={2.5} className="text-content-muted opacity-75" />
              <ChevronRight size={12} strokeWidth={2.5} className="text-primary/80" />
            </span>

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
          <p className="mt-2 text-center text-[11px] text-content-muted tracking-wide">
            {confirmed ? 'Opening Today…' : 'Slide to continue'}
          </p>
        </div>
      </div>
    </Overlay>
  );
}
