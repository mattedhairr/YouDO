import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ListTodo, Flame, ChevronRight } from 'lucide-react';
import Overlay from './Overlay';
import type { Task, TaskSession } from '../types';
import { isTaskComplete } from '../store';
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

  const previewTitles = useMemo(
    () => todayTasks.filter((t) => !isTaskComplete(t)).slice(0, 3).map((t) => t.title),
    [todayTasks],
  );

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

        {previewTitles.length > 0 && (
          <div className="bg-elevated border border-subtle rounded-[12px] p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Up next</p>
            {previewTitles.map((title) => (
              <p key={title} className="text-[12px] text-content-primary truncate">
                · {title}
              </p>
            ))}
            {openTodayCount > previewTitles.length && (
              <p className="text-[11px] text-content-muted">
                +{openTodayCount - previewTitles.length} more
              </p>
            )}
          </div>
        )}

        <div className="pt-3">
          <div
            ref={trackRef}
            className="briefing-slider relative overflow-hidden rounded-[999px] border border-subtle select-none touch-none"
            style={{ height: TRACK_H }}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Slide to Got it"
          >
            {/* Recessed track well */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, color-mix(in srgb, var(--bg-base) 55%, var(--bg-surface)), color-mix(in srgb, var(--bg-surface) 92%, var(--bg-base)))',
                boxShadow:
                  'inset 0 2px 5px color-mix(in srgb, black 28%, transparent), inset 0 1px 0 color-mix(in srgb, var(--text-primary) 5%, transparent)',
              }}
            />

            {/* Progress wash */}
            <div
              className="absolute inset-y-[5px] left-[5px] rounded-[999px] pointer-events-none transition-[width,opacity] duration-150"
              style={{
                width: `${THUMB_PX + TRACK_PAD + progress * maxTravel}px`,
                maxWidth: `calc(100% - 10px)`,
                background:
                  'linear-gradient(90deg, color-mix(in srgb, var(--primary) 28%, transparent) 0%, color-mix(in srgb, var(--primary-glow) 14%, transparent) 70%, transparent 100%)',
                opacity: 0.55 + glow * 0.4,
                boxShadow: glow > 0.45 ? '0 0 20px color-mix(in srgb, var(--primary) 22%, transparent)' : undefined,
              }}
            />

            {/* Label — true centre of track */}
            <p
              className="absolute left-1/2 top-1/2 z-[1] -translate-x-1/2 -translate-y-1/2 text-[18px] font-semibold tracking-[0.06em] leading-none pointer-events-none whitespace-nowrap transition-[color,opacity,text-shadow] duration-300"
              style={{
                color:
                  glow > 0.55
                    ? 'var(--primary-glow)'
                    : `color-mix(in srgb, var(--text-secondary) 88%, var(--primary-glow) 12%)`,
                opacity: Math.max(0.35, 0.78 - progress * 0.55 + glow * 0.22),
                textShadow: confirmed
                  ? '0 0 14px color-mix(in srgb, var(--primary) 55%, transparent), 0 0 28px color-mix(in srgb, var(--primary-glow) 30%, transparent)'
                  : glow > 0.35
                    ? `0 0 ${8 + glow * 8}px color-mix(in srgb, var(--primary) 35%, transparent)`
                    : '0 1px 0 color-mix(in srgb, black 20%, transparent)',
              }}
              aria-hidden
            >
              Got it!
            </p>

            {/* Trailing hint */}
            <span
              className="absolute right-4 top-1/2 -translate-y-1/2 z-[1] pointer-events-none text-[11px] font-bold tracking-widest transition-opacity duration-300"
              style={{
                color: 'color-mix(in srgb, var(--text-muted) 70%, var(--primary) 30%)',
                opacity: Math.max(0.15, 0.45 - progress * 0.5),
              }}
              aria-hidden
            >
              ››
            </span>

            <button
              type="button"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`briefing-slider-knob absolute top-1/2 z-[2] flex items-center justify-center rounded-full touch-none will-change-transform active:scale-[0.98] ${
                knobAnimating && !dragging.current ? 'transition-transform duration-300 ease-out' : ''
              }`}
              style={{
                width: THUMB_PX,
                height: THUMB_PX,
                left: TRACK_PAD,
                transform: `translate(${progress * maxTravel}px, -50%)`,
              }}
              aria-label="Got it"
            >
              <span
                className="pointer-events-none absolute inset-0 rounded-full"
                style={{
                  background:
                    'linear-gradient(165deg, color-mix(in srgb, var(--primary-glow) 95%, white) 0%, var(--primary) 48%, color-mix(in srgb, var(--primary) 85%, black) 100%)',
                  boxShadow: confirmed
                    ? '0 0 0 1px color-mix(in srgb, var(--primary-glow) 70%, transparent), 0 4px 18px color-mix(in srgb, var(--primary) 45%, transparent), inset 0 1px 0 color-mix(in srgb, white 35%, transparent)'
                    : '0 2px 8px color-mix(in srgb, black 32%, transparent), 0 0 0 1px color-mix(in srgb, var(--primary-glow) 35%, transparent), inset 0 1px 0 color-mix(in srgb, white 30%, transparent)',
                }}
              />
              <ChevronRight
                size={20}
                strokeWidth={2.5}
                className="relative z-[1] text-on-primary drop-shadow-[0_1px_0_color-mix(in_srgb,black_25%,transparent)]"
              />
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
