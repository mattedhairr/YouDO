import { useEffect, useMemo, useRef, useState } from 'react';
import { PLANETS, moonLayout, moonPhase, planetPosition, planetSubtitle, weekdayOf } from '../lib/planet';
import { drawPlanet } from '../lib/planetArt';

interface Props {
  /** Today's local date, "YYYY-MM-DD". */
  dateKey: string;
}

/** The tap moment lasts this long, its fade-out included. */
const LOOK_MS = 4000;
const LEAVE_MS = 600;
/** The planet's place is updated this often, gliding there over the same time. */
const MOVE_MS = 60_000;
/** Drawn size of the planet's canvas, and the planet's radius in it. */
const CANVAS = 36;
const RADIUS = [8.5, 7.5, 7.5, 7.5, 7.5, 7.5, 6.5];

const minutesNow = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
};

function PlanetCanvas({ index, phase }: { index: number; phase: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(CANVAS * dpr);
    canvas.height = Math.round(CANVAS * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CANVAS, CANVAS);
    drawPlanet(ctx, CANVAS / 2, CANVAS / 2, RADIUS[index], index, phase);
  }, [index, phase]);
  return <canvas ref={ref} style={{ width: CANVAS, height: CANVAS }} aria-hidden />;
}

/**
 * The planet of the day (src/lib/planet.ts) in the ambient sky: small,
 * crossing the sky once a day. A tap is a short telescope moment: a ring
 * focuses in around it, its moons come out, and its name appears beside it,
 * then all of it fades away by itself.
 */
export default function PlanetOfTheDay({ dateKey }: Props) {
  const index = weekdayOf(dateKey);
  const planet = PLANETS[index];
  const phase = useMemo(() => moonPhase(dateKey), [dateKey]);
  const subtitle = useMemo(() => planetSubtitle(index, dateKey), [index, dateKey]);
  const moons = useMemo(() => moonLayout(index, dateKey), [index, dateKey]);
  const [minutes, setMinutes] = useState(minutesNow);
  const [portrait, setPortrait] = useState(() => window.innerHeight > window.innerWidth);
  const [look, setLook] = useState<'off' | 'on' | 'leaving'>('off');
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const id = window.setInterval(() => setMinutes(minutesNow()), MOVE_MS);
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', onResize);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const place = planetPosition(dateKey, minutes, portrait);
  // Glide between minutes, but not across the screen when it sets on the right and rises on the left.
  const last = useRef(place.x);
  const wrapped = Math.abs(place.x - last.current) > 0.3;
  last.current = place.x;

  const startLook = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    setLook('on');
    timers.current = [
      window.setTimeout(() => setLook('leaving'), LOOK_MS - LEAVE_MS),
      window.setTimeout(() => setLook('off'), LOOK_MS),
    ];
  };

  const r = RADIUS[index];
  // The name goes on the side with room, past the moons.
  const onLeft = place.x > 0.6;
  const gap = r * (moons.length ? 4.4 : 3) + 4;

  return (
    <div
      className={`planet-day ${wrapped ? 'is-jumping' : ''}`}
      style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%`, opacity: place.opacity }}
    >
      <button
        type="button"
        className="planet-button"
        style={{ pointerEvents: place.opacity < 0.3 ? 'none' : undefined }}
        aria-label={`${planet.name}, ${subtitle}`}
        onClick={(event) => {
          // A tap here is for the planet, not the clock's controls.
          event.stopPropagation();
          startLook();
        }}
      >
        <PlanetCanvas index={index} phase={phase} />
      </button>
      {look !== 'off' && (
        <div className={`planet-look ${look === 'leaving' ? 'is-leaving' : ''}`} aria-hidden>
          <svg className="planet-look-ring" width="60" height="60" viewBox="-30 -30 60 60">
            <circle r={r * 2.15} fill="none" />
            {[45, 135, 225, 315].map((deg) => {
              const a = (deg * Math.PI) / 180;
              return (
                <line key={deg} x1={Math.cos(a) * r * 2.15} y1={Math.sin(a) * r * 2.15} x2={Math.cos(a) * r * 2.6} y2={Math.sin(a) * r * 2.6} />
              );
            })}
          </svg>
          {moons.map((moon, i) => (
            <i
              key={i}
              className="planet-look-moon"
              style={{ transform: `translate(${moon.dx * r}px, ${moon.dy * r}px)`, width: moon.size * 2, height: moon.size * 2, animationDelay: `${0.25 + i * 0.12}s` }}
            />
          ))}
          <div className={`planet-look-name ${onLeft ? 'on-left' : ''}`} style={onLeft ? { right: `calc(50% + ${gap}px)` } : { left: `calc(50% + ${gap}px)` }}>
            <b>{planet.name}</b>
            <span>{subtitle}</span>
          </div>
        </div>
      )}
    </div>
  );
}
