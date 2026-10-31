import { useCallback, useEffect, useRef, useState } from 'react';
import { Minimize2, Music, Pause, Play, Square } from 'lucide-react';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { Capacitor } from '@capacitor/core';
import { StatusBar } from '@capacitor/status-bar';
import type { ActiveSession, Task } from '../types';
import Overlay from './Overlay';
import OriginChip from './OriginChip';
import { computeNetFocusMs } from '../lib/sessionStats';
import { sessionClockLabel } from '../lib/sessionClock';
import FocusSoundPicker from './FocusSoundPicker';
import { ambientClockDriftRange, ambientDigits, ambientDrift, formatAmbientTimer } from '../lib/ambient';
import '@fontsource/quicksand/600.css';
import './ambient.css';

/** One digit that rolls softly to its next value: the old one rises and blurs away as the new one settles in. */
function RollDigit({ digit }: { digit: string }) {
  const [roll, setRoll] = useState({ current: digit, previous: null as string | null, count: 0 });
  if (roll.current !== digit) setRoll({ current: digit, previous: roll.current, count: roll.count + 1 });
  return (
    <span className="ambient-digit">
      {roll.previous !== null && (
        <span
          key={`out-${roll.count}`}
          className="ambient-digit-out"
          onAnimationEnd={() => setRoll((r) => ({ ...r, previous: null }))}
        >
          {roll.previous}
        </span>
      )}
      <span key={`in-${roll.count}`} className={roll.count > 0 ? 'ambient-digit-in' : undefined}>{roll.current}</span>
    </span>
  );
}

function RollNumber({ value, className }: { value: string; className: string }) {
  return (
    <span className={className}>
      {value.split('').map((digit, idx) => <RollDigit key={idx} digit={digit} />)}
    </span>
  );
}

function formatPauseDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
}

interface Props {
  activeSession: ActiveSession;
  task: Task;
  /** First one or two names on the way to the task, shown as the Today chip. */
  originNames?: string[];
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onMinimize: () => void;
  onJumpToGoal?: () => void;
}

/** How long the controls stay after a tap. */
const CONTROLS_MS = 4000;
/** The face moves a little every minute so nothing stays lit in one place. */
const DRIFT_MS = 60_000;
/** After this long without a tap the digits dim a little, so fewer pixels run at full brightness. */
const REST_MS = 3 * 60_000;

/**
 * StandBy-style ambient clock: the session timer in huge accent-coloured digits
 * on true black, the clock and the task small around it. Tap to show the
 * controls and the session log; the music note opens the focus sound picker.
 * A slow drift guards against screen burn-in.
 */
export function AmbientScreen({
  activeSession,
  task,
  originNames,
  onPause,
  onResume,
  onStop,
  onMinimize,
  onJumpToGoal,
}: Props) {
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [controls, setControls] = useState(true);
  const [soundsOpen, setSoundsOpen] = useState(false);
  const [drift, setDrift] = useState({ x: 0, y: 0 });
  const [clockDrift, setClockDrift] = useState({ x: 0, y: 0 });
  const [resting, setResting] = useState(false);
  const hideTimer = useRef(0);
  const restTimer = useRef(0);

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

  // Full screen: the phone's status bar hides while the clock shows, and
  // again on coming back from the notification shade or another app.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const hide = () => {
      if (document.visibilityState === 'visible') StatusBar.hide().catch(() => {});
    };
    hide();
    window.addEventListener('focus', hide);
    document.addEventListener('visibilitychange', hide);
    return () => {
      window.removeEventListener('focus', hide);
      document.removeEventListener('visibilitychange', hide);
      StatusBar.show().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      setElapsed(Math.floor(computeNetFocusMs(activeSession, Date.now()) / 1000));
      setNow(new Date());
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  useEffect(() => {
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      setDrift(ambientDrift(step));
      // The big digits walk further, on their own path, so their thick strokes move too.
      setClockDrift(ambientDrift(step + 5, ambientClockDriftRange(window.innerWidth, window.innerHeight)));
    }, DRIFT_MS);
    return () => clearInterval(interval);
  }, []);

  const showControls = useCallback(() => {
    setControls(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => setControls(false), CONTROLS_MS);
    setResting(false);
    window.clearTimeout(restTimer.current);
    restTimer.current = window.setTimeout(() => setResting(true), REST_MS);
  }, []);
  useEffect(() => {
    showControls();
    return () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(restTimer.current);
    };
  }, [showControls]);
  // The controls stay while the sound panel is open.
  useEffect(() => {
    if (soundsOpen) window.clearTimeout(hideTimer.current);
  }, [soundsOpen]);

  const timer = formatAmbientTimer(elapsed);
  const digits = ambientDigits(elapsed);
  const clock = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const paused = activeSession.isPaused;

  const control = (event: React.MouseEvent, action: () => void) => {
    event.stopPropagation();
    action();
    showControls();
  };

  return (
    <Overlay open scrim={false} align="full" fullWidth="bleed">
      <div
        className={`ambient-screen ${paused ? 'is-paused' : ''} ${resting ? 'is-resting' : ''} ${controls ? 'controls-on' : ''} ${soundsOpen ? 'sounds-on' : ''}`}
        onClick={() => {
          setSoundsOpen(false);
          showControls();
        }}
        role="presentation"
      >
        <div
          className="ambient-face"
          style={{ transform: `translate3d(${drift.x}px, ${drift.y}px, 0)` }}
        >
          <div className="ambient-top">
            <span>{clock}</span>
            <span>
              {paused ? 'Paused · ' : ''}Started {sessionClockLabel(activeSession.startTime, activeSession.wallClockStart)}
              {activeSession.pauses.length > 0 ? ` · ${activeSession.pauses.length} ${activeSession.pauses.length === 1 ? 'pause' : 'pauses'}` : ''}
            </span>
          </div>

          {/* Minutes and seconds big (stacked in portrait, side by side in landscape), hours small above. */}
          <div className="ambient-clock" style={{ transform: `translate3d(${clockDrift.x}px, ${clockDrift.y}px, 0)` }} role="timer" aria-live="off" aria-label={`Focused ${timer}`}>
            <span className="ambient-hours" aria-hidden>
              {digits.hours > 0 ? `${digits.hours} ${digits.hours === 1 ? 'hr' : 'hrs'}` : ''}
            </span>
            <span className="ambient-digits" aria-hidden>
              <RollNumber value={digits.minutes} className="ambient-minutes" />
              <span className="ambient-divider" />
              <RollNumber value={digits.seconds} className="ambient-seconds" />
            </span>
          </div>

          <div className="ambient-task">
            <p className="ambient-title">{task.title}</p>
            {originNames && originNames.length > 0 && (
              <OriginChip names={originNames} onClick={onJumpToGoal ? () => { onMinimize(); onJumpToGoal(); } : undefined} />
            )}
          </div>
        </div>

        {/* Session log: every pause of this sitting, shown with the controls. */}
        {activeSession.pauses.length > 0 && (
          <div className={`ambient-log ${controls ? 'is-visible' : ''}`} aria-hidden={!controls}>
            <p className="ambient-log-title">
              Pauses{activeSession.pauses.length > 4 ? ` · last 4 of ${activeSession.pauses.length}` : ''}
            </p>
            {activeSession.pauses.slice(-4).map((p, idx) => {
              const start = sessionClockLabel(p.start, p.wallClockStart);
              const end = p.end ? sessionClockLabel(p.end, p.wallClockEnd) : 'now';
              const ms = p.end ? (p.durationMs || p.end - p.start) : activeSession.pauseStart ? now.getTime() - activeSession.pauseStart : 0;
              return (
                <p key={idx} className="ambient-log-row">
                  <span>{start} – {end}</span>
                  <span className="ambient-log-time">{formatPauseDuration(ms)}</span>
                </p>
              );
            })}
          </div>
        )}

        {soundsOpen && controls && (
          <div className="ambient-sounds" onClick={(e) => e.stopPropagation()} role="presentation">
            <FocusSoundPicker variant="ambient" />
          </div>
        )}

        <div className={`ambient-controls ${controls ? 'is-visible' : ''}`} aria-hidden={!controls}>
          <button type="button" tabIndex={controls ? 0 : -1} onClick={(e) => control(e, paused ? onResume : onPause)} aria-label={paused ? 'Resume' : 'Pause'}>
            {paused ? <Play size={20} className="fill-current" /> : <Pause size={20} />}
          </button>
          <button type="button" tabIndex={controls ? 0 : -1} onClick={(e) => control(e, onStop)} aria-label="Stop session">
            <Square size={17} className="fill-current" />
          </button>
          <button
            type="button"
            tabIndex={controls ? 0 : -1}
            onClick={(e) => control(e, () => setSoundsOpen(!soundsOpen))}
            aria-label="Focus sound"
            aria-expanded={soundsOpen}
            aria-pressed={soundsOpen}
          >
            <Music size={19} />
          </button>
          <button type="button" tabIndex={controls ? 0 : -1} onClick={(e) => control(e, onMinimize)} aria-label="Minimize">
            <Minimize2 size={19} />
          </button>
        </div>
      </div>
    </Overlay>
  );
}
