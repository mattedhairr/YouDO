import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LANDSCAPE_KEEP_OUT,
  PORTRAIT_KEEP_OUT,
  constellation,
  dustMap,
  rgbOf,
  skyProgress,
  skySway,
  starMap,
  swayed,
  type SkyKeepOut,
} from '../lib/focusSky';

interface Props {
  /** Today's focus so far, including the running sitting. */
  focusMs: number;
  barHours: number;
  /** Today's local date, "YYYY-MM-DD": sets the day's sky. */
  dateKey: string;
}

/** A new star fades in over this long; the constellation draws over LINES_MS. */
const STAR_FADE_MS = 2000;
const LINES_MS = 3500;
/** The sky's sway is redrawn this often: far below a pixel each time, and no animation between. */
const SWAY_REDRAW_MS = 20_000;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The ambient screen's night sky (src/lib/focusSky.ts): one star for each part
 * of today's focus, spread evenly over the screen and different every day, a
 * faint dust of distant stars, and a constellation once the bar is reached.
 * Dim and small on true black, and the whole sky sways very slowly, so it
 * never marks the screen.
 */
export default function FocusSky({ focusMs, barHours, dateKey }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const starCanvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Where the timer's digits really are, as fractions of the sky (rounded, so
  // the slow drift doesn't redraw it). Until measured, a box for the orientation.
  const [timer, setTimer] = useState<SkyKeepOut | null>(null);
  const [swayTick, setSwayTick] = useState(0);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setSize((old) => (old.w === w && old.h === h ? old : { w, h }));
      const digits = el.closest('.ambient-screen')?.querySelector('.ambient-digits')?.getBoundingClientRect();
      const sky = el.getBoundingClientRect();
      if (!digits || !digits.width || !sky.width || !sky.height) return;
      const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 50) / 50;
      const next = {
        left: round((digits.left - sky.left) / sky.width),
        top: round((digits.top - sky.top) / sky.height),
        right: round((digits.right - sky.left) / sky.width),
        bottom: round((digits.bottom - sky.top) / sky.height),
      };
      setTimer((old) => (old && old.left === next.left && old.top === next.top && old.right === next.right && old.bottom === next.bottom ? old : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The rounded digits arrive with their font; measure again once it has.
    void document.fonts?.ready.then(measure);
    const late = window.setTimeout(measure, 600);
    return () => {
      observer.disconnect();
      window.clearTimeout(late);
    };
  }, []);

  // The sway moves on a little every SWAY_REDRAW_MS; with reduce motion the sky stays still.
  useEffect(() => {
    if (reducedMotion()) return;
    const id = window.setInterval(() => setSwayTick((n) => n + 1), SWAY_REDRAW_MS);
    return () => window.clearInterval(id);
  }, []);

  const aspect = size.h ? size.w / size.h : 1;
  const keepOut = timer ?? (aspect >= 1 ? LANDSCAPE_KEEP_OUT : PORTRAIT_KEEP_OUT);
  // Laid out for the orientation (rounded, so tiny size changes keep the same sky).
  const shapeAspect = Math.round(aspect * 10) / 10 || 1;
  const stars = useMemo(() => starMap(dateKey, keepOut, shapeAspect), [dateKey, keepOut, shapeAspect]);
  const dust = useMemo(() => dustMap(dateKey, shapeAspect), [dateKey, shapeAspect]);
  const progress = skyProgress(focusMs, barHours);
  const shape = useMemo(
    () => constellation(stars, progress.lit, progress.constellationSize, aspect, keepOut),
    [stars, progress.lit, progress.constellationSize, aspect, keepOut],
  );

  // What was already on screen, so only new stars and a new constellation animate.
  const shown = useRef<{ lit: number; lines: number; litAt: number; linesAt: number } | null>(null);

  useEffect(() => {
    const canvas = starCanvas.current;
    // Wait for the timer's real box, so stars never jump into place on opening.
    if (!canvas || !size.w || !size.h || !timer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    if (canvas.width !== Math.round(size.w * dpr)) canvas.width = Math.round(size.w * dpr);
    if (canvas.height !== Math.round(size.h * dpr)) canvas.height = Math.round(size.h * dpr);
    const still = reducedMotion();
    const now = performance.now();
    const before = shown.current;
    // First draw shows everything at once; later, only new stars fade in.
    const fadeFrom = before ? Math.min(before.lit, progress.lit) : progress.lit;
    const litAt = before && progress.lit > before.lit ? now : before?.litAt ?? 0;
    const linesAt = before && shape.lines.length > 0 && before.lines === 0 ? now : before?.linesAt ?? 0;
    shown.current = { lit: progress.lit, lines: shape.lines.length, litAt, linesAt };
    const [r, g, b] = rgbOf(getComputedStyle(wrap.current!).color);
    const angle = still ? 0 : skySway(Date.now());
    const at = (star: { x: number; y: number }) => swayed(star, angle, size.w, size.h);
    let frame = 0;

    const dot = (x: number, y: number, radius: number, [cr, cg, cb]: [number, number, number], alpha: number) => {
      ctx.fillStyle = `rgba(${cr}, ${cg}, ${cb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    };

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const starFade = still ? 1 : Math.min(1, (t - litAt) / STAR_FADE_MS);
      const lineGrow = still || !linesAt ? 1 : Math.min(1, (t - linesAt) / LINES_MS);
      for (const star of dust) {
        const [x, y] = at(star);
        dot(x, y, star.size, star.tint, star.brightness);
      }
      // Lines first, under their stars, growing from each star toward its neighbour.
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.34)`;
      for (const { from, to } of shape.lines) {
        const [ax, ay] = at(stars[from]);
        const [cx, cy] = at(stars[to]);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax + (cx - ax) * lineGrow, ay + (cy - ay) * lineGrow);
        ctx.stroke();
      }
      const bright = new Set(shape.points);
      for (let i = 0; i < progress.lit; i++) {
        const star = stars[i];
        const alpha = star.brightness * (i >= fadeFrom ? starFade : 1);
        if (alpha <= 0) continue;
        const [x, y] = at(star);
        if (bright.has(i)) {
          dot(x, y, 3, [244, 227, 195], 0.32 * lineGrow);
          dot(x, y, 1.3, [255, 250, 240], 0.95);
          continue;
        }
        // The brightest have a soft halo, as real bright stars do.
        if (star.size > 1.5) {
          const halo = ctx.createRadialGradient(x, y, 0, x, y, star.size * 3.2);
          halo.addColorStop(0, `rgba(${star.tint.join(', ')}, ${alpha * 0.28})`);
          halo.addColorStop(1, `rgba(${star.tint.join(', ')}, 0)`);
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(x, y, star.size * 3.2, 0, Math.PI * 2);
          ctx.fill();
        }
        dot(x, y, star.size, star.tint, alpha);
      }
      if (starFade < 1 || lineGrow < 1) frame = requestAnimationFrame(draw);
    };
    draw(now);
    return () => cancelAnimationFrame(frame);
  }, [stars, dust, shape, progress.lit, size.w, size.h, timer, swayTick]);

  return (
    <div ref={wrap} className="focus-sky" aria-hidden>
      <canvas ref={starCanvas} className="focus-sky-stars" />
    </div>
  );
}
