import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LANDSCAPE_KEEP_OUT,
  PORTRAIT_KEEP_OUT,
  constellation,
  milkyWay,
  milkyWayGlow,
  milkyWayLevel,
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
  /** Today's local date, "YYYY-MM-DD": sets the star map and the Milky Way. */
  dateKey: string;
  /** A paused sitting: the Milky Way fades nearly away. */
  paused?: boolean;
}

/** A new star fades in over this long; the constellation draws over LINES_MS. */
const STAR_FADE_MS = 2000;
const LINES_MS = 3500;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * The ambient screen's night sky (src/lib/focusSky.ts): one star for each part
 * of today's focus, a constellation once the bar is reached, and a faint Milky
 * Way, its own shape each day, that breathes with the focus sound. Dim, soft
 * and always drifting, on true black, so it never marks the screen.
 */
export default function FocusSky({ focusMs, barHours, dateKey, paused = false }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const starCanvas = useRef<HTMLCanvasElement>(null);
  const milky = useRef<HTMLDivElement>(null);
  const layerA = useRef<HTMLCanvasElement>(null);
  const layerB = useRef<HTMLCanvasElement>(null);
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

  // The Milky Way: two layers, each drawn once (in small slices, so opening
  // never stutters). The compositor drifts them apart slowly and sets their
  // brightness, so nothing is redrawn while it moves.
  const way = useMemo(() => milkyWay(dateKey), [dateKey]);
  useEffect(() => {
    if (!size.w || !size.h) return;
    const [r, g, b] = rgbOf(getComputedStyle(wrap.current!).color);
    const jobs: { canvas: HTMLCanvasElement; layer: number; peak: number }[] = [];
    if (layerA.current) jobs.push({ canvas: layerA.current, layer: 0, peak: 0.095 });
    if (layerB.current) jobs.push({ canvas: layerB.current, layer: 1, peak: 0.05 });
    let cancelled = false;
    // Each layer covers 130% of the sky, so drifting never shows an edge.
    const scale = 0.75;
    const W = Math.round(size.w * 1.3 * scale);
    const H = Math.round(size.h * 1.3 * scale);
    let job = 0;
    let row = 0;
    let image: ImageData | null = null;
    let timer = 0;
    const slice = () => {
      if (cancelled) return;
      const current = jobs[job];
      if (!current) return;
      const ctx = current.canvas.getContext('2d');
      if (!ctx) return;
      if (!image) {
        current.canvas.width = W;
        current.canvas.height = H;
        current.canvas.classList.remove('is-ready');
        image = ctx.createImageData(W, H);
      }
      const data = image.data;
      const until = performance.now() + 8;
      for (; row < H && performance.now() < until; row++) {
        // Screen position of this row, in screen heights from the centre.
        const y = (row / scale - size.h * 0.15 - size.h / 2) / size.h;
        for (let col = 0; col < W; col++) {
          const x = (col / scale - size.w * 0.15 - size.w / 2) / size.h;
          const level = milkyWayLevel(way, x, y, current.layer);
          if (level <= 0) continue;
          const i = (row * W + col) * 4;
          // A little cooler at the core, the accent toward the edges.
          const core = 0.25 * level;
          data[i] = r * (1 - core) + 235 * core;
          data[i + 1] = g * (1 - core) + 238 * core;
          data[i + 2] = b * (1 - core) + 245 * core;
          data[i + 3] = level * current.peak * 255;
        }
      }
      if (row < H) {
        timer = window.setTimeout(slice, 0);
        return;
      }
      ctx.putImageData(image, 0, 0);
      current.canvas.classList.add('is-ready');
      job += 1;
      row = 0;
      image = null;
      timer = window.setTimeout(slice, 0);
    };
    timer = window.setTimeout(slice, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [way, size.w, size.h]);

  // Brightness: quieter with no sound, a little brighter as the day nears the
  // bar, breathing with the music, nearly gone in a pause. Set a few times a
  // second; the CSS transition makes every step smooth.
  const glowState = useRef({ progress: progress.progress, paused });
  glowState.current = { progress: progress.progress, paused };
  useEffect(() => {
    const el = milky.current;
    if (!el) return;
    let music = 0;
    const tick = () => {
      const target = focusSoundPlayer.meter();
      music += (target - music) * (target > music ? 0.5 : 0.2);
      el.style.opacity = String(milkyWayGlow({ ...glowState.current, music }));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div ref={wrap} className="focus-sky" aria-hidden>
      <div ref={milky} className="focus-sky-milky">
        <canvas ref={layerA} className="focus-sky-layer is-a" />
        <canvas ref={layerB} className="focus-sky-layer is-b" />
      </div>
      <canvas ref={starCanvas} className="focus-sky-stars" />
    </div>
  );
}
