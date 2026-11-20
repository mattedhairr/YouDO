import { useEffect, useMemo, useRef } from 'react';
import { cloudField, cloudTones, weatherLook, type CloudField, type CloudLayerLook, type Weather } from '../lib/weather';

interface Props {
  weather: Weather;
  /** The day (YYYY-MM-DD): each day has its own clouds and rain. */
  dateKey: string;
  width: number;
  /** The scene's height (the art's coordinates). */
  height: number;
  night: number;
  /** 0 with the sun high, 1 with it low (warm light on the clouds). */
  sunLow: number;
  /** Stop the rain's motion (folded away, off screen, reduced motion). */
  still?: boolean;
  /** Clouds only (the slim folded bar). */
  noRain?: boolean;
}

const RES = 0.5; // clouds are soft: drawn at half resolution and scaled up
const CLOUD_TOP = -40; // the strip starts above the visible sky, under the status bar's colour
const CLOUD_HEIGHT = 170;

function parseRgb(c: string): [number, number, number] {
  const m = (c.match(/[\d.]+/g) ?? []).map(Number);
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0];
}

/**
 * The noise is the slow part; the colours change with the hour. Fields are
 * kept, so a colour change only repaints and never stalls the drift. The
 * header and its folded bar share them.
 */
const fields = new Map<string, CloudField>();
function fieldFor(w: number, h: number, look: CloudLayerLook): CloudField {
  const key = `${w}x${h}:${look.cover}:${look.scale}:${look.seed}`;
  let field = fields.get(key);
  if (!field) {
    field = cloudField(w, h, look.cover, look.scale * RES, look.seed);
    if (fields.size >= 8) fields.delete(fields.keys().next().value as string);
    fields.set(key, field);
  }
  return field;
}

/** One drifting layer of cloud, drawn into a strip two tiles wide. */
function CloudLayer({ width, look, tones, direction }: {
  width: number;
  look: CloudLayerLook;
  tones: { light: string; dark: string };
  direction: 1 | -1;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = Math.max(32, Math.round(width * RES));
    const h = Math.round(CLOUD_HEIGHT * RES);
    const field = fieldFor(w, h, look);
    if (canvas.width !== w * 2) canvas.width = w * 2;
    if (canvas.height !== h) canvas.height = h;
    const image = ctx.createImageData(w * 2, h);
    const light = parseRgb(tones.light);
    const dark = parseRgb(tones.dark);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = field.density[y * w + x];
        if (d <= 0.001) continue;
        // Light comes from above: what lies over a point shades it, so tops shine and bases darken.
        let above = 0;
        for (let k = 1; k <= 4; k++) above += field.density[Math.max(0, y - k * 2) * w + x];
        const lit = Math.max(0, Math.min(1, 1.05 - above * 0.24 - d * 0.25));
        const r = dark[0] + (light[0] - dark[0]) * lit;
        const g = dark[1] + (light[1] - dark[1]) * lit;
        const b = dark[2] + (light[2] - dark[2]) * lit;
        const a = Math.min(1, d * 1.15) * look.alpha * 255;
        for (const copy of [0, w]) {
          const i = (y * w * 2 + x + copy) * 4;
          image.data[i] = r;
          image.data[i + 1] = g;
          image.data[i + 2] = b;
          image.data[i + 3] = a;
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [width, look, tones.light, tones.dark]);
  // The drift runs on the wall clock: it carries on where it was after a
  // visit elsewhere, and the header and its folded bar move as one. Fixed
  // once per layer, since changing a running animation's delay makes it jump.
  const delay = useMemo(() => -((Date.now() / 1000) % look.seconds), [look.seconds]);
  return (
    <canvas
      ref={ref}
      className="sky-cloud"
      style={{
        width: width * 2,
        height: CLOUD_HEIGHT,
        top: CLOUD_TOP + look.offsetY,
        animationDuration: `${look.seconds}s`,
        animationDelay: `${delay}s`,
        animationDirection: direction === 1 ? 'normal' : 'reverse',
      }}
      aria-hidden
    />
  );
}

/** Fine rain in two depths, slanting with the day's wind. */
function Rain({ width, height, night, still, rain, direction }: {
  width: number;
  height: number;
  night: number;
  still?: boolean;
  rain: { drops: number; wind: number; speed: number; seed: number };
  direction: 1 | -1;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let seed = rain.seed;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const wind = rain.wind * direction; // > 0 falls to the left, like the clouds' drift
    const spread = height * Math.abs(wind) + 30; // drops start upwind so the slant fills the sky
    const startX = () => rand() * (width + spread) - (wind > 0 ? 0 : spread);
    const nearCount = Math.round(rain.drops * 0.4);
    const drops = Array.from({ length: rain.drops }, (_, i) => {
      const near = i < nearCount;
      return {
        x: startX(),
        y: rand() * height,
        len: near ? 11 + rand() * 9 : 5 + rand() * 5,
        speed: (near ? 620 + rand() * 260 : 360 + rand() * 160) * rain.speed,
        alpha: near ? 0.16 + rand() * 0.2 : 0.08 + rand() * 0.12,
        width: near ? 1 : 0.6,
      };
    });
    const tint = night > 0.5 ? '170,182,205' : '222,230,240';
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.lineCap = 'round';
      for (const d of drops) {
        ctx.strokeStyle = `rgba(${tint},${d.alpha})`;
        ctx.lineWidth = d.width;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - d.len * wind, d.y + d.len);
        ctx.stroke();
      }
    };
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      for (const d of drops) {
        d.y += d.speed * dt;
        d.x -= d.speed * dt * wind;
        if (d.y > height) {
          d.y = -d.len - rand() * 40;
          d.x = startX();
        }
      }
      draw();
      frame = requestAnimationFrame(tick);
    };
    draw();
    if (!still) frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [width, height, night, still, rain, direction]);
  return <canvas ref={ref} className="sky-rain" style={{ width, height }} aria-hidden />;
}

/**
 * The weather over the header's sky: drifting clouds (two depths, lit from
 * above, warm near sunrise and sunset, dark at night) and, in rain, a heavier
 * overcast with fine rain falling through it. Each day has its own clouds,
 * wind and rain (`weatherLook`).
 */
export default function SkyWeather({ weather, dateKey, width, height, night, sunLow, still, noRain }: Props) {
  const look = useMemo(() => weatherLook(dateKey, weather), [dateKey, weather]);
  const tones = cloudTones(weather, night, sunLow);
  if (weather === 'clear') return null;
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <div className={`sky-weather ${reduceMotion ? 'is-still' : ''}`} aria-hidden>
      {look.layers.map((layer, i) => (
        <CloudLayer key={i} width={width} look={layer} tones={tones} direction={look.direction} />
      ))}
      {weather === 'rainy' && !noRain && (
        <Rain width={width} height={height} night={night} still={still || reduceMotion} rain={look.rain} direction={look.direction} />
      )}
    </div>
  );
}
