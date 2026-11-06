import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LANDSCAPE_KEEP_OUT,
  PORTRAIT_KEEP_OUT,
  constellation,
  rgbOf,
  skyProgress,
  starMap,
  type SkyKeepOut,
} from '../lib/focusSky';
import { focusSoundPlayer } from '../lib/focusSoundPlayer';

interface Props {
  /** Today's focus so far, including the running sitting. */
  focusMs: number;
  barHours: number;
  /** Today's local date, "YYYY-MM-DD": sets the star map. */
  dateKey: string;
}

/** A new star fades in over this long; the constellation draws over LINES_MS. */
const STAR_FADE_MS = 2000;
const LINES_MS = 3500;
/** The aurora redraws about 20 times a second, and only while sound plays. */
const AURORA_FRAME_MS = 50;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The ambient screen's night sky (src/lib/focusSky.ts): one star for each part
 * of today's focus, a constellation once the bar is reached, and an aurora
 * along the bottom that moves with the focus sound and sits higher as the day
 * nears the bar. Stars are tiny and dim on true black, and drift with the face.
 */
export default function FocusSky({ focusMs, barHours, dateKey }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const starCanvas = useRef<HTMLCanvasElement>(null);
  const auroraCanvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Where the timer's digits really are, as fractions of the sky (rounded, so
  // the slow drift doesn't redraw it). Until measured, a box for the orientation.
  const [timer, setTimer] = useState<SkyKeepOut | null>(null);

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

  const keepOut = timer ?? (size.w >= size.h ? LANDSCAPE_KEEP_OUT : PORTRAIT_KEEP_OUT);
  const stars = useMemo(() => starMap(dateKey, keepOut), [dateKey, keepOut]);
  const progress = skyProgress(focusMs, barHours);
  const shape = useMemo(
    () => constellation(stars, progress.lit, progress.constellationSize, size.h ? size.w / size.h : 1, keepOut),
    [stars, progress.lit, progress.constellationSize, size.w, size.h, keepOut],
  );

  // What was already on screen, so only new stars and a new constellation animate.
  const shown = useRef<{ lit: number; lines: number; litAt: number; linesAt: number } | null>(null);

  // Stars and the constellation: drawn when they change, animated only while fading in.
  useEffect(() => {
    const canvas = starCanvas.current;
    // Wait for the timer's real box, so stars never jump into place on opening.
    if (!canvas || !size.w || !size.h || !timer) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    const still = reducedMotion();
    const now = performance.now();
    const before = shown.current;
    // First draw shows everything at once; later, only new stars fade in.
    const fadeFrom = before ? Math.min(before.lit, progress.lit) : progress.lit;
    const litAt = before && progress.lit > before.lit ? now : before?.litAt ?? 0;
    const linesAt = before && shape.lines.length > 0 && before.lines === 0 ? now : before?.linesAt ?? 0;
    shown.current = { lit: progress.lit, lines: shape.lines.length, litAt, linesAt };
    const [r, g, b] = rgbOf(getComputedStyle(wrap.current!).color);
    let frame = 0;

    const draw = (t: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      const starFade = still ? 1 : Math.min(1, (t - litAt) / STAR_FADE_MS);
      const lineGrow = still || !linesAt ? 1 : Math.min(1, (t - linesAt) / LINES_MS);
      // Lines first, under their stars, growing from each star toward its neighbour.
      ctx.lineWidth = 0.8;
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, 0.34)`;
      for (const { from, to } of shape.lines) {
        const a = stars[from];
        const c = stars[to];
        ctx.beginPath();
        ctx.moveTo(a.x * size.w, a.y * size.h);
        ctx.lineTo((a.x + (c.x - a.x) * lineGrow) * size.w, (a.y + (c.y - a.y) * lineGrow) * size.h);
        ctx.stroke();
      }
      const bright = new Set(shape.points);
      for (let i = 0; i < progress.lit; i++) {
        const star = stars[i];
        const fresh = i >= fadeFrom;
        const alpha = star.brightness * (fresh ? starFade : 1);
        if (alpha <= 0) continue;
        const x = star.x * size.w;
        const y = star.y * size.h;
        if (bright.has(i)) {
          ctx.fillStyle = `rgba(244, 227, 195, ${0.35 * lineGrow})`;
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 250, 240, 0.95)';
          ctx.beginPath();
          ctx.arc(x, y, 1.3, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
        ctx.fillStyle = `rgba(233, 220, 196, ${alpha})`;
        ctx.beginPath();
        ctx.arc(x, y, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      if (starFade < 1 || lineGrow < 1) frame = requestAnimationFrame(draw);
    };
    draw(now);
    return () => cancelAnimationFrame(frame);
  }, [stars, shape, progress.lit, size.w, size.h, timer]);

  // The aurora: a soft ribbon that follows the sound's loudness, low and calm.
  const progressRef = useRef(progress.progress);
  progressRef.current = progress.progress;
  useEffect(() => {
    const canvas = auroraCanvas.current;
    if (!canvas || !size.w || !size.h) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Drawn small and stretched: the browser's scaling softens it like a blur, cheaply.
    const scale = 0.125;
    const w = Math.max(16, Math.round(size.w * scale));
    const h = Math.max(16, Math.round(size.h * scale));
    canvas.width = w;
    canvas.height = h;
    const [r, g, b] = rgbOf(getComputedStyle(wrap.current!).color);
    const still = reducedMotion();
    let level = 0;
    let phase = 0;
    let timer = 0;
    let last = performance.now();

    const paint = () => {
      ctx.clearRect(0, 0, w, h);
      if (level < 0.004) return;
      const lift = progressRef.current;
      // It rises less in portrait, where the seconds sit low on the screen.
      const base = h * (0.93 - (w >= h ? 0.2 : 0.08) * lift);
      // Glow rising from the horizon, only below the ribbon: the rest stays true black.
      const top = base - h * 0.12;
      const glow = ctx.createLinearGradient(0, top, 0, h);
      glow.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      glow.addColorStop(1, `rgba(${r}, ${g}, ${b}, ${0.16 * level})`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, top, w, h - top);
      // The ribbon: brightest in the middle, fading at both ends.
      const band = ctx.createLinearGradient(0, 0, w, 0);
      band.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0)`);
      band.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${0.38 * level})`);
      band.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${0.55 * level})`);
      band.addColorStop(0.8, `rgba(${r}, ${g}, ${b}, ${0.32 * level})`);
      band.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = band;
      const amp = h * (0.02 + 0.035 * level);
      const thick = h * 0.07;
      ctx.beginPath();
      const edge = (x: number) => base + Math.sin(x / (w * 0.083) + phase) * amp + Math.sin(x / (w * 0.027) + phase * 2) * amp * 0.35;
      for (let x = 0; x <= w; x += 1) ctx.lineTo(x, edge(x));
      for (let x = w; x >= 0; x -= 1) ctx.lineTo(x, edge(x) + thick);
      ctx.closePath();
      ctx.fill();
    };

    const step = () => {
      const now = performance.now();
      const dt = Math.min(0.2, (now - last) / 1000);
      last = now;
      const target = focusSoundPlayer.meter();
      // Slower than the music: it breathes rather than flickers.
      level += (target - level) * Math.min(1, dt * (target > level ? 2.2 : 0.9));
      if (!still) phase += dt * (0.12 + level * 0.18);
      paint();
      // Silent and settled: check again in a second instead of every frame.
      timer = window.setTimeout(step, level < 0.004 && target === 0 ? 1000 : still ? 1000 : AURORA_FRAME_MS);
    };
    step();
    return () => window.clearTimeout(timer);
  }, [size.w, size.h]);

  return (
    <div ref={wrap} className="focus-sky" aria-hidden>
      <canvas ref={auroraCanvas} className="focus-sky-aurora" />
      <canvas ref={starCanvas} className="focus-sky-stars" />
    </div>
  );
}
