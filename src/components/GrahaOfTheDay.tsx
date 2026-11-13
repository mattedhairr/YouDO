import { useEffect, useMemo, useRef, useState } from 'react';
import { GRAHAS, firstFact, grahaPosition, moonPhase, weekdayOf } from '../lib/graha';
import { drawGraha } from '../lib/grahaArt';

interface Props {
  /** Today's local date, "YYYY-MM-DD". */
  dateKey: string;
  /** The card opened: the ambient screen hides its buttons, which share the bottom. */
  onOpen?: () => void;
}

/** The card closes by itself after this long without a tap. */
const CARD_MS = 10_000;
/** The planet's place is updated this often: it moves a few pixels an hour. */
const MOVE_MS = 60_000;

function PlanetCanvas({ index, phase, size, radius }: { index: number; phase: number; size: number; radius: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawGraha(ctx, size / 2, size / 2, radius, index, phase);
  }, [index, phase, size, radius]);
  return <canvas ref={ref} style={{ width: size, height: size }} aria-hidden />;
}

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

/**
 * Today's graha (src/lib/graha.ts) in the ambient sky: a small planet that
 * moves slowly through the day. A tap opens a card with one story or fact and
 * its source; "Another" shows the next. It closes by itself, or with a tap
 * anywhere else.
 */
export default function GrahaOfTheDay({ dateKey, onOpen }: Props) {
  const index = weekdayOf(dateKey);
  const graha = GRAHAS[index];
  const phase = useMemo(() => moonPhase(dateKey), [dateKey]);
  const [minutes, setMinutes] = useState(minutesNow);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [open, setOpen] = useState(false);
  const [fact, setFact] = useState(() => firstFact(dateKey, graha.facts.length));
  const button = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const closeTimer = useRef(0);

  useEffect(() => {
    const id = window.setInterval(() => setMinutes(minutesNow()), MOVE_MS);
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  // A new day brings its own graha and first fact.
  useEffect(() => {
    setFact(firstFact(dateKey, GRAHAS[weekdayOf(dateKey)].facts.length));
  }, [dateKey]);

  const keepOpen = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CARD_MS);
  };

  useEffect(() => {
    if (!open) return;
    keepOpen();
    // A tap anywhere else closes it (and still does what that tap does).
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (card.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.clearTimeout(closeTimer.current);
    };
  }, [open]);

  const place = grahaPosition(minutes, portrait);
  const current = graha.facts[fact % graha.facts.length];

  return (
    <>
      <button
        ref={button}
        type="button"
        className="graha-button"
        style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%` }}
        aria-label={`Today’s graha: ${graha.name}, ${graha.planet}. Show a fact`}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          if (!open) onOpen?.();
          setOpen(!open);
        }}
      >
        <PlanetCanvas index={index} phase={phase} size={36} radius={index === 0 ? 8.5 : index === 6 ? 6.5 : 7.5} />
      </button>
      {open && (
        <div
          ref={card}
          className="graha-card"
          role="note"
          aria-live="polite"
          onClick={(event) => {
            event.stopPropagation();
            keepOpen();
          }}
        >
          <div className="graha-card-head">
            <span className="graha-card-planet">
              <PlanetCanvas index={index} phase={phase} size={46} radius={index === 6 ? 9 : 11} />
            </span>
            <div className="min-w-0">
              <div className="graha-card-name">
                <span lang="sa">{graha.dev}</span> · {graha.name}
              </div>
              <div className="graha-card-sub">
                {graha.planet} · {graha.vara}
              </div>
            </div>
          </div>
          <p className="graha-card-fact">{current.text}</p>
          <div className="graha-card-source">{current.source}</div>
          <div className="graha-card-foot">
            <div className="graha-card-dots" aria-hidden>
              {graha.facts.map((_, i) => (
                <i key={i} className={i === fact % graha.facts.length ? 'is-on' : ''} />
              ))}
            </div>
            <button
              type="button"
              className="graha-card-more"
              onClick={(event) => {
                event.stopPropagation();
                setFact((n) => (n + 1) % graha.facts.length);
                keepOpen();
              }}
            >
              Another →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
