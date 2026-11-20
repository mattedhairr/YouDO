import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Cloud, CloudRain, MapPin, Moon, Sun } from 'lucide-react';
import { ambientPlanetEnabled } from '../lib/ambient';
import type { AppQuote } from '../lib/appQuotes';
import { todayISO } from '../lib/dates';
import { skyProgress } from '../lib/focusSky';
import {
  HEADER_BACKGROUND_EVENT,
  loadHeaderBackground,
  loadHeaderPhoto,
  type HeaderBackground,
} from '../lib/headerBackground';
import {
  dustStars,
  greeting,
  headerConstellation,
  headerStars,
  hourOf,
  mixColor,
  nightness,
  ridgeLine,
  skyColors,
  sunState,
  upcomingDeadlines,
  type DeadlineGoal,
  type HeaderStar,
} from '../lib/headerSky';
import type { GoalNode } from '../types';
import { moonPhase, weekdayOf } from '../lib/planet';
import { deviceTimeZone, formatClock, isIndiaTimeZone, loadSkyPlace, saveSkyPlace, setSkyInviteDone, SKY_PLACE_EVENT, SKY_PLACES, skyInviteDone, sunDayForPlace } from '../lib/skyPlaces';
import { loadDayWeather, nextWeather, saveDayWeather, SKY_WEATHER_EVENT, weatherButtonEnabled, weatherColors, type Weather } from '../lib/weather';
import Overlay from './Overlay';
import SkyWeather from './SkyWeather';
import { sunAltitude, type SunDay } from '../lib/sunPath';
import { drawPlanet } from '../lib/planetArt';
import { hapticTick } from '../lib/haptics';
import './skyHeader.css';

export type SkyHeaderView = 'tasks' | 'goals' | 'calendar' | 'board';

interface Props {
  view: SkyHeaderView;
  /** The user's first name, or null (an offline workspace). */
  name: string | null;
  quote: AppQuote | null;
  /** The goal tree: its top-level goals' end dates feed the countdown. */
  goals: GoalNode[];
  /** Today's focus and the daily bar: today's earned stars, as on the ambient screen. */
  focusMs: number;
  barHours: number;
  onOpenGuide: () => void;
}

/** Scene coordinates: the art is drawn as if the content started 36px down. */
const OFFSET = 36;
const HEIGHT = { today: 178, tab: 114 };
/** The time-lapse's length, and how long today's path stays after it. */
const REPLAY_MS = 3200;
const PATH_MS = 5200;
/** Where the time-lapse's closing line sits (scene y): under the name, above the quote. */
const PATH_LINE_Y = 122;
/** How far the page scrolls before the header has folded away. */
const FOLD_SPAN = 76;
const RIDGES = [
  { seed: 3, base: 132, amp: 72, rough: 0.55, sink: 0.35 },
  { seed: 14, base: 148, amp: 54, rough: 0.55, sink: 0.6 },
  { seed: 22, base: 166, amp: 36, rough: 0.55, sink: 0.85 },
  { seed: 31, base: 182, amp: 20, rough: 0.45, sink: 1 },
];
const TAB_LIFT = 14;
/** On Today the peaks sit a little lower, under the name and the countdown. */
const TODAY_LIFT = -14;
const QUOTE_OPEN_MS = 9000;
const TITLES: Record<Exclude<SkyHeaderView, 'tasks'>, string> = { goals: 'Goals', calendar: 'Calendar', board: 'Hub' };

const rgb = (t: [number, number, number]) => `rgb(${t[0]},${t[1]},${t[2]})`;
const transparentOf = (c: string) => c.replace(/[\d.]+\)$/, '0)');

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // Follow the minute; the sky moves too slowly for anything finer to show.
    const tick = () => setNow(new Date());
    const id = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return now;
}

function useHeaderBackground(): { prefs: HeaderBackground; photoUrl: string | null } {
  const [prefs, setPrefs] = useState(loadHeaderBackground);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const refresh = async () => {
      const next = loadHeaderBackground();
      setPrefs(next);
      if (next.mode !== 'photo') {
        if (url) URL.revokeObjectURL(url);
        url = null;
        setPhotoUrl(null);
        return;
      }
      const blob = await loadHeaderPhoto();
      if (cancelled) return;
      if (url) URL.revokeObjectURL(url);
      url = blob ? URL.createObjectURL(blob) : null;
      setPhotoUrl(url);
    };
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(HEADER_BACKGROUND_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(HEADER_BACKGROUND_EVENT, onChange);
      if (url) URL.revokeObjectURL(url);
    };
  }, []);
  return { prefs, photoUrl };
}

function PlanetMark({ index, phase, x, top, opacity = 1 }: { index: number; phase: number; x: number; top: number; opacity?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = 34;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    drawPlanet(ctx, size / 2, size / 2, 7, index, phase);
  }, [index, phase]);
  return <canvas ref={ref} className="sky-planet" style={{ left: x - size / 2, top: `calc(var(--sky-top) + ${top - size / 2}px)`, width: size, height: size, opacity }} aria-hidden />;
}

type Pts = [number, number][];

function ridgesFor(width: number, lift: number): Pts[] {
  const valley = width * 0.54;
  return RIDGES.map((r) => ridgeLine(r.seed, width, r.base - lift, r.amp, valley, r.rough));
}

/** A range's height at x (scene coordinates). */
function ridgeYAt(pts: Pts, x: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (x >= x0 && x <= x1) return y0 + ((y1 - y0) * (x - x0)) / Math.max(1e-6, x1 - x0);
  }
  return pts.length ? pts[pts.length - 1][1] : Infinity;
}

interface SunPlace {
  x: number;
  y: number;
  r: number;
  state: ReturnType<typeof sunState>;
}

function sunPlacement(width: number, hour: number, day: SunDay): SunPlace {
  const state = sunState(hour, day);
  const x = width * 0.54 + state.dx * width;
  // Height on screen eases off as the sun climbs: low suns sit on the ridges, a
  // high noon sun stays in the open sky under the top row.
  const y = 134 - 70 * (1 - Math.exp(-Math.max(-3, state.rise) / 45));
  const r = 10 + (8.5 - 10) * state.elevation;
  return { x, y, r, state };
}

/**
 * Today's path across the sky (scene coordinates) for the time-lapse, and
 * where it comes out of the ranges in the morning and goes into them at night.
 */
function sunPathFor(width: number, day: SunDay, ridges: Pts[]): { d: string; rise: [number, number]; set: [number, number] } {
  const pts: [number, number][] = [];
  for (let h = day.sunrise - 0.5; h <= day.sunset + 0.5; h += 0.1) {
    const at = sunPlacement(width, h, day);
    pts.push([at.x, at.y]);
  }
  const above = ([x, y]: [number, number]) => y < Math.min(...ridges.map((r) => ridgeYAt(r, x)));
  const rise = pts.find(above) ?? pts[0];
  const set = [...pts].reverse().find(above) ?? pts[pts.length - 1];
  return { d: 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L'), rise, set };
}

/** Seeded 0–1 values, so the rays are the same on every draw. */
function seededList(seed: number, n: number): number[] {
  let v = seed;
  return Array.from({ length: n }, () => {
    v = (v * 16807) % 2147483647;
    return v / 2147483647;
  });
}
const RAY_JITTER = seededList(97, 48);

/**
 * The glare of a high sun, as a lens sees it: a soft veil of light and fine
 * diffraction rays. Drawn over the ranges and behind the words, screen-blended
 * so it only ever adds light.
 */
function SunLens({ x, y, intensity, warm }: { x: number; y: number; /** 0 none … about 0.55 at a high noon sun. */ intensity: number; warm: number }) {
  // A low sun shines golden; a high one white.
  const light = (a: number) => {
    const w = Math.min(1, Math.max(0, warm));
    return `rgba(255,${Math.round(254 - 70 * w)},${Math.round(250 - 140 * w)},${a})`;
  };
  const rays = useMemo(() => {
    // Many fine rays of uneven length, a few strong ones: a real starburst, not a drawn star.
    const out: { pts: string; opacity: number }[] = [];
    const count = 24;
    for (let i = 0; i < count; i++) {
      const j = RAY_JITTER[i];
      const angle = (Math.PI * 2 * i) / count + (j - 0.5) * 0.22;
      const strong = i % 6 === 0;
      const length = strong ? 60 + RAY_JITTER[i + 24] * 25 : 16 + RAY_JITTER[i + 24] * 30;
      const half = strong ? 1.5 : 0.55 + j * 0.6;
      const px = -Math.sin(angle) * half;
      const py = Math.cos(angle) * half;
      const sx = x + Math.cos(angle) * 6;
      const sy = y + Math.sin(angle) * 6;
      const tx = x + Math.cos(angle) * length;
      const ty = y + Math.sin(angle) * length;
      out.push({
        pts: `${(sx + px).toFixed(1)},${(sy + py).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)} ${(sx - px).toFixed(1)},${(sy - py).toFixed(1)}`,
        opacity: strong ? 1 : 0.35 + RAY_JITTER[(i * 7) % 48] * 0.5,
      });
    }
    return out;
  }, [x, y]);
  return (
    <g className="sky-lens" aria-hidden opacity={Math.min(1, intensity).toFixed(3)}>
      <defs>
        <radialGradient id="sky-veil"><stop offset="0" stopColor={light(0.62)} /><stop offset=".22" stopColor={light(0.26)} /><stop offset=".55" stopColor={light(0.07)} /><stop offset="1" stopColor={light(0)} /></radialGradient>
        <radialGradient id="sky-ray" gradientUnits="userSpaceOnUse" cx={x} cy={y} r={90}><stop offset="0" stopColor={light(0.95)} /><stop offset=".25" stopColor={light(0.45)} /><stop offset="1" stopColor={light(0)} /></radialGradient>
        <filter id="sky-lens-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation=".7" /></filter>
      </defs>
      <ellipse cx={x} cy={y} rx={240} ry={170} fill="url(#sky-veil)" />
      <g filter="url(#sky-lens-soft)" opacity={0.35}>
        {rays.map((ray, i) => (
          <g key={i} opacity={ray.opacity}>
            <polygon points={ray.pts} fill="url(#sky-ray)" className={i % 3 === 0 ? 'sky-ray-a' : i % 3 === 1 ? 'sky-ray-b' : undefined} />
          </g>
        ))}
      </g>
    </g>
  );
}

/** The scene: sky, sun or stars, the mountains. Coordinates as in OFFSET. */
function SkyArt({ width, height, hour, day, weather, stars, lines, dust, night, ridges, place, sunPathD, quoteShade, quiet }: {
  width: number;
  height: number;
  hour: number;
  /** The real sun's day at the chosen place (sunPath.ts). */
  day: SunDay;
  weather: Weather;
  stars: HeaderStar[];
  lines: [HeaderStar, HeaderStar][];
  dust: { x: number; y: number; opacity: number }[];
  night: number;
  ridges: Pts[];
  place: SunPlace;
  /** Today's path of the sun, drawn after the time-lapse. */
  sunPathD?: string | null;
  /** A calm band of mist behind the quote, at the foot of the scene. */
  quoteShade?: boolean;
  /** Where words sit (scene coordinates): the bright ridge lines fade out there. */
  quiet?: { x: number; y: number; w: number; h: number }[];
}) {
  const colors = useMemo(() => weatherColors(skyColors(hour, day), weather, night), [hour, day, weather, night]);
  // Behind cloud the sun is a dim glow and only a few stars show; in rain neither does.
  const sunShows = weather === 'clear' ? 1 : weather === 'cloudy' ? 0.3 : 0;
  const starsShow = weather === 'clear' ? 1 : weather === 'cloudy' ? 0.3 : 0;
  const sun = place.state;
  const sunX = place.x;
  const sunY = place.y;
  // The sun's glare follows its height through the day: none at rising and
  // setting, a soft veil with faint rays as it climbs, most at noon.
  const lens = weather === 'clear' ? 0.55 * Math.pow(Math.min(1, Math.max(0, (sun.elevation - 0.25) / 0.75)), 1.5) : 0;
  const sunR = place.r;
  // High in the sky the sun is white with a soft daylight bloom; low, warm with a corona.
  const daylight = Math.min(1, Math.max(0, (sun.elevation - 0.15) / 0.5));
  const warmth = Math.pow(sun.elevation, 0.5);
  const glow = mixColor('#ff9258', '#fff6e2', sun.elevation).replace(/,1\)$/, '');
  const discCore = mixColor('#ffe2bd', '#ffffff', warmth);
  const discRim = mixColor('#ff9c5c', '#fff3dc', warmth);
  const low = 1 - sun.elevation;
  const top = -OFFSET - 40;
  const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const fill = (pts: [number, number][]) => `M0 ${height + 40} L` + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ` L${width} ${height + 40} Z`;

  return (
    <svg className="sky-art" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id="sky-grad" gradientUnits="userSpaceOnUse" x1="0" y1={OFFSET - 22} x2="0" y2={height}>
          <stop offset="0" stopColor={mixColor(colors.sky[0], '#02060f', 0.3)} />
          {colors.sky.map((c, i) => <stop key={i} offset={[0.14, 0.4, 0.72, 1][i]} stopColor={c} />)}
        </linearGradient>
        <radialGradient id="sky-sunglow"><stop offset="0" stopColor={`${glow},.13)`} /><stop offset=".4" stopColor={`${glow},.05)`} /><stop offset="1" stopColor={`${glow},0)`} /></radialGradient>
        <radialGradient id="sky-horizon"><stop offset="0" stopColor="rgba(255,160,100,.42)" /><stop offset=".5" stopColor="rgba(255,140,90,.1)" /><stop offset="1" stopColor="rgba(255,140,90,0)" /></radialGradient>
        <radialGradient id="sky-corona"><stop offset=".3" stopColor={`${glow},.75)`} /><stop offset=".42" stopColor={`${glow},.32)`} /><stop offset=".62" stopColor={`${glow},.08)`} /><stop offset="1" stopColor={`${glow},0)`} /></radialGradient>
        <radialGradient id="sky-disc"><stop offset="0" stopColor={discCore} /><stop offset=".62" stopColor={discCore} /><stop offset=".87" stopColor={discRim} /><stop offset="1" stopColor={transparentOf(discRim)} /></radialGradient>
        <radialGradient id="sky-bloom"><stop offset="0" stopColor="rgba(255,255,250,.7)" /><stop offset=".1" stopColor="rgba(250,252,255,.4)" /><stop offset=".28" stopColor="rgba(240,248,255,.15)" /><stop offset=".55" stopColor="rgba(240,248,255,.04)" /><stop offset="1" stopColor="rgba(240,248,255,0)" /></radialGradient>
        <radialGradient id="sky-starbloom"><stop offset="0" stopColor="rgba(220,230,255,.5)" /><stop offset="1" stopColor="rgba(220,230,255,0)" /></radialGradient>
        {colors.layers.map(([a, b], i) => (
          <linearGradient key={i} id={`sky-l${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        ))}
        <linearGradient id="sky-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={transparentOf(colors.mist)} /><stop offset="1" stopColor={colors.mist} /></linearGradient>
        <linearGradient id="sky-textshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(0,0,0,.32)" /><stop offset=".5" stopColor="rgba(0,0,0,0)" /></linearGradient>
        <linearGradient id="sky-quoteshade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="rgba(4,14,26,0)" /><stop offset=".45" stopColor="rgba(4,14,26,.22)" /><stop offset="1" stopColor="rgba(4,12,22,.4)" /></linearGradient>
        <filter id="sky-maskblur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9" /></filter>
        <mask id="sky-rimmask" maskUnits="userSpaceOnUse" x="0" y={top} width={width} height={height - top}>
          <rect x="0" y={top} width={width} height={height - top} fill="white" />
          <g filter="url(#sky-maskblur)">{(quiet ?? []).map((q, i) => <rect key={i} x={q.x} y={q.y} width={q.w} height={q.h} rx="10" fill="black" />)}</g>
        </mask>
        <filter id="sky-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect x="0" y={top} width={width} height={height - top} fill="url(#sky-grad)" />
      {night > 0.01 && starsShow > 0 && (
        <g opacity={night * starsShow}>
          {dust.map((d, i) => <circle key={`d${i}`} cx={d.x} cy={d.y} r={0.38} fill="#fff" opacity={d.opacity} />)}
          {lines.map(([a, b], i) => <line key={`c${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(236,214,170,.42)" strokeWidth={0.7} strokeLinecap="round" />)}
          {stars.map((s, i) => (
            <g key={`s${i}`}>
              {s.r > 0.8 && <circle cx={s.x} cy={s.y} r={s.r * 3.6} fill="url(#sky-starbloom)" opacity={s.opacity * 0.7} />}
              <circle cx={s.x} cy={s.y} r={s.r} fill={rgb(s.tint)} opacity={s.opacity} />
            </g>
          ))}
        </g>
      )}
      {sun.visible && sunShows > 0 && (
        <g className="sky-fold-sink" style={{ ['--sink' as string]: '0.2' }} opacity={sunShows}>
          <ellipse cx={sunX} cy={sunY} rx={190} ry={120} fill="url(#sky-sunglow)" />
          {low > 0.35 && <ellipse cx={sunX} cy={sunY + 10} rx={260} ry={30} fill="url(#sky-horizon)" opacity={(low - 0.35) / 0.65} />}
          {daylight > 0 && <ellipse cx={sunX} cy={sunY} rx={150} ry={100} fill="url(#sky-bloom)" opacity={daylight} />}
          {daylight < 1 && <circle cx={sunX} cy={sunY} r={sunR * 2.6} fill="url(#sky-corona)" opacity={1 - daylight * 0.9} />}
          <ellipse cx={sunX} cy={sunY} rx={sunR * 1.15} ry={sunR * 1.15 * (0.9 + 0.1 * sun.elevation)} fill="url(#sky-disc)" />
        </g>
      )}
      {sunPathD && <path d={sunPathD} className="sky-sunpath" fill="none" stroke="rgba(255,255,255,.7)" strokeWidth={1.3} strokeDasharray="0.5 5" strokeLinecap="round" />}
      {ridges.map((pts, i) => (
        <g key={`r${i}`} className="sky-fold-sink" style={{ ['--sink' as string]: String(RIDGES[i].sink) }}>
          <path d={fill(pts)} fill={`url(#sky-l${i})`} />
          <path d={path(pts)} fill="none" stroke={colors.rim} strokeWidth={i === 0 ? 0.9 : 0.6} opacity={[1, 0.7, 0.45, 0.25][i]} mask="url(#sky-rimmask)" />
          {i < 3 && (
            <rect x="0" y={Math.min(...pts.map((p) => p[1])) + 6} width={width} height={30 - i * 6} fill="url(#sky-haze)" filter="url(#sky-soft)" />
          )}
        </g>
      ))}
      {sun.visible && lens > 0.005 && <SunLens x={sunX} y={sunY} intensity={lens} warm={1 - sun.elevation} />}
      {quoteShade && <rect x="0" y={height - 92} width={width} height={92} fill="url(#sky-quoteshade)" />}
      <rect x="0" y={top} width={width} height={height - top} fill="url(#sky-textshade)" opacity={1 - night} />
    </svg>
  );
}

/**
 * The header of every tab in the Liquid Glass look: a small landscape whose
 * sky follows the hour (src/lib/headerSky.ts), with the YouDO mark, the date,
 * a greeting by name on Today, a countdown to the nearest goal deadline (a
 * tap shows the next) and the day's quote. Tonight's stars are today's earned
 * stars. It is a card under the status bar and scrolls away with the page
 * (the mountains sink as it goes). Settings → Appearance can swap the sky for
 * the user's own photo.
 */
export default function SkyHeader({ view, name, quote, goals, focusMs, barHours, onOpenGuide }: Props) {
  const now = useNow();
  const hour = hourOf(now);
  const dateKey = todayISO();
  const [placeId, setPlaceId] = useState(loadSkyPlace);
  useEffect(() => {
    const onPlace = () => setPlaceId(loadSkyPlace());
    window.addEventListener(SKY_PLACE_EVENT, onPlace);
    return () => window.removeEventListener(SKY_PLACE_EVENT, onPlace);
  }, []);
  const [dayWeather, setDayWeather] = useState<Weather>(() => loadDayWeather(dateKey));
  const [weatherOn, setWeatherOn] = useState(weatherButtonEnabled);
  const [weatherFlash, setWeatherFlash] = useState<string | null>(null);
  const [inviteDone, setInviteDone] = useState(skyInviteDone);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The time-lapse a tap on the sun plays: the scene's hour while it runs, then today's path.
  const [replayHour, setReplayHour] = useState<number | null>(null);
  const [pathShown, setPathShown] = useState(false);
  const replayFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(replayFrame.current), []);
  useEffect(() => {
    if (!pathShown) return;
    const id = window.setTimeout(() => setPathShown(false), PATH_MS);
    return () => window.clearTimeout(id);
  }, [pathShown]);
  useEffect(() => {
    const onWeather = () => {
      setDayWeather(loadDayWeather(dateKey));
      setWeatherOn(weatherButtonEnabled());
    };
    const onPlace = () => setInviteDone(skyInviteDone());
    onWeather();
    window.addEventListener(SKY_WEATHER_EVENT, onWeather);
    window.addEventListener(SKY_PLACE_EVENT, onPlace);
    return () => {
      window.removeEventListener(SKY_WEATHER_EVENT, onWeather);
      window.removeEventListener(SKY_PLACE_EVENT, onPlace);
    };
  }, [dateKey]);
  useEffect(() => {
    if (!weatherFlash) return;
    const id = window.setTimeout(() => setWeatherFlash(null), 1600);
    return () => window.clearTimeout(id);
  }, [weatherFlash]);
  const utcOffset = -now.getTimezoneOffset() / 60;
  const day = useMemo(() => sunDayForPlace(placeId, dateKey, utcOffset), [placeId, dateKey, utcOffset]);
  const deadlines: DeadlineGoal[] = useMemo(() => upcomingDeadlines(goals, dateKey), [goals, dateKey]);
  const subtitle =
    view === 'goals'
      ? `${goals.length} ${goals.length === 1 ? 'goal' : 'goals'}${deadlines.length ? ` · ${deadlines.length} with a deadline` : ''}`
      : view === 'calendar'
        ? now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : view === 'board'
          ? 'Focus together'
          : undefined;
  const today = view === 'tasks';
  const height = today ? HEIGHT.today : HEIGHT.tab;
  const lift = today ? TODAY_LIFT : TAB_LIFT;
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(412);
  const [goalIndex, setGoalIndex] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteExtra, setQuoteExtra] = useState(0);
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const [quoteLong, setQuoteLong] = useState(false);
  const { prefs, photoUrl } = useHeaderBackground();
  const photo = prefs.mode === 'photo' && photoUrl ? photoUrl : null;
  const night = nightness(hour, day);
  const weather: Weather = weatherOn && !photo ? dayWeather : 'clear';
  // While the time-lapse runs the scene shows its hour; everything else keeps the real one.
  const sceneHour = replayHour ?? hour;
  const sceneNight = replayHour === null ? night : nightness(sceneHour, day);
  const skyNow = useMemo(() => weatherColors(skyColors(sceneHour, day), weather, sceneNight), [sceneHour, day, weather, sceneNight]);
  const [folded, setFolded] = useState(false);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Folding: as the page scrolls the header away its mountains sink and the
  // words fade. Written straight to a CSS variable, so scrolling never
  // re-renders the scene.
  useEffect(() => {
    let frame = 0;
    const span = Math.max(FOLD_SPAN, height - 40);
    // The page scrolls inside #root (see index.css), not the window; any
    // scroll that carries the header is the one that folds it.
    let scroller: Element | null = null;
    const scrolled = () => (scroller ? scroller.scrollTop : window.scrollY);
    const apply = () => {
      frame = 0;
      const fold = Math.min(1, Math.max(0, scrolled() / span));
      rootRef.current?.style.setProperty('--fold', fold.toFixed(3));
      setFolded(fold > 0.8);
      if (fold > 0.2) setQuoteOpen(false);
    };
    const onScroll = (event: Event) => {
      const source = event.target;
      if (source instanceof Element) {
        if (!source.contains(rootRef.current)) return;
        scroller = source;
      } else {
        scroller = null;
      }
      if (!frame) frame = requestAnimationFrame(apply);
    };
    apply();
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(frame);
    };
  }, [height]);

  useEffect(() => setGoalIndex(0), [deadlines.length]);

  // A long quote: two lines until tapped; open, it folds back by itself.
  useLayoutEffect(() => {
    const p = quoteRef.current;
    if (!p) return;
    setQuoteLong(p.scrollHeight > p.clientHeight + 2 || quoteOpen);
    if (quoteOpen) {
      const twoLines = parseFloat(getComputedStyle(p).lineHeight) * 2;
      setQuoteExtra(Math.max(0, p.scrollHeight - twoLines));
    } else {
      setQuoteExtra(0);
    }
  }, [quoteOpen, quote?.text, width]);

  useEffect(() => {
    if (!quoteOpen) return;
    const id = window.setTimeout(() => setQuoteOpen(false), QUOTE_OPEN_MS);
    return () => window.clearTimeout(id);
  }, [quoteOpen]);

  const progress = skyProgress(focusMs, barHours);
  const nameBox = { right: today ? 175 : 210, top: 62, bottom: 122 };
  const nearText = (x: number, y: number) =>
    (x < nameBox.right && y > nameBox.top && y < nameBox.bottom) ||
    (today && deadlines.length > 0 && x > width - 132 && y > 62 && y < 130) ||
    (x < 135 && y > 28 && y < 56) ||
    (x > width - 126 && y > 28 && y < 56);
  const { stars, lines } = useMemo(() => {
    const list = headerStars(dateKey, width, progress.lit, nearText);
    const valley = width * 0.54;
    const joined = headerConstellation(list, progress.constellationSize, (s) => !nearText(s.x, s.y) && Math.hypot(s.x - valley, s.y - 74) > 16 && s.y > 30 && s.y < 104);
    return { stars: list, lines: joined };
    // nearText depends only on these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, width, progress.lit, progress.constellationSize, today, deadlines.length]);
  const dust = useMemo(() => dustStars(dateKey, width), [dateKey, width]);
  const sunHeight = Math.max(0, sunAltitude(day, hour));
  const ridges = useMemo(() => ridgesFor(width, lift), [width, lift]);
  const place = useMemo(() => sunPlacement(width, sceneHour, day), [width, sceneHour, day]);
  const sunNow = useMemo(() => sunPlacement(width, hour, day), [width, hour, day]);
  const sunPath = useMemo(() => sunPathFor(width, day, ridges), [width, day, ridges]);
  const sunTappable = !photo && weather !== 'rainy' && sunNow.state.visible && replayHour === null;
  const daylightLeft = Math.max(0, day.sunset - hour);
  const playDay = () => {
    hapticTick();
    setPathShown(false);
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPathShown(true);
      return;
    }
    const from = day.sunrise - 0.9;
    const to = hour;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / REPLAY_MS);
      const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      if (k < 1) {
        setReplayHour(from + (to - from) * eased);
        replayFrame.current = requestAnimationFrame(step);
      } else {
        setReplayHour(null);
        setPathShown(true);
        hapticTick();
      }
    };
    replayFrame.current = requestAnimationFrame(step);
  };
  /** Scene coordinates to the header's own, for words over the scene. */
  const sceneTop = (y: number) => `calc(var(--sky-top) + ${y + quoteExtra - OFFSET}px)`;
  const planetIndex = weekdayOf(dateKey);
  const showPlanet = night > 0.05 && planetIndex !== 0 && ambientPlanetEnabled();
  const phase = useMemo(() => moonPhase(dateKey), [dateKey]);

  const deadline = deadlines.length ? deadlines[goalIndex % deadlines.length] : null;
  const showInvite = !photo && placeId === 'auto' && !inviteDone && isIndiaTimeZone(deviceTimeZone());
  const WeatherIcon = weather === 'cloudy' ? Cloud : weather === 'rainy' ? CloudRain : night > 0.5 ? Moon : Sun;
  const weatherName = weather === 'cloudy' ? 'Cloudy' : weather === 'rainy' ? 'Rainy' : 'Clear';
  const dateText = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const hello = greeting(hour);
  const title = today ? name ?? 'Today' : TITLES[view];
  const kicker = today ? (name ? hello : hello.replace(/,$/, '')) : null;
  const fullHeight = height + quoteExtra;
  // The name (and on Today the countdown) sit here, in scene coordinates.
  const quietZones = [
    { x: 6, y: OFFSET - quoteExtra + 30, w: today ? 200 : 230, h: today ? 58 : 66 },
    ...(today && deadline ? [{ x: width - 178, y: OFFSET - quoteExtra + 30, w: 172, h: 72 }] : []),
  ];

  const scene = () =>
    photo ? (
      <img
        className="sky-photo"
        src={photo}
        alt=""
        style={{ objectPosition: `${prefs.x}% ${prefs.y}%`, opacity: prefs.opacity }}
      />
    ) : (
      <>
        <div className="sky-art-wrap" style={{ height: height + OFFSET }}>
          <SkyArt width={width} height={height + OFFSET} hour={hour} day={day} weather={weather} stars={stars} lines={lines} dust={dust} night={sceneNight} ridges={ridges} place={place} sunPathD={pathShown ? sunPath.d : null} quoteShade={today && Boolean(quote)} quiet={quietZones} />
          <SkyWeather weather={weather} dateKey={dateKey} width={width} height={height + OFFSET} night={night} sunLow={1 - Math.min(1, Math.max(0, sunHeight / 45))} still={folded} />
        </div>
        {showPlanet && weather !== 'rainy' && <PlanetMark index={planetIndex} phase={phase} x={width * 0.54} top={74 - OFFSET + quoteExtra} opacity={weather === 'cloudy' ? 0.35 : 1} />}
      </>
    );

  const countdown = deadline && today && (
    <button
      type="button"
      className="sky-count"
      onClick={() => deadlines.length > 1 && setGoalIndex((i) => (i + 1) % deadlines.length)}
      aria-label={`${deadline.days} days to ${deadline.title}${deadlines.length > 1 ? '. Tap for the next goal' : ''}`}
    >
      <span className="sky-count-n">{deadline.days}</span>
      <span className="sky-count-l">{deadline.days === 1 ? 'day' : 'days'} to <b>{deadline.title}</b></span>
      {deadlines.length > 1 && (
        <span className="sky-dots" aria-hidden>
          {deadlines.map((g, i) => <i key={g.id} className={i === goalIndex % deadlines.length ? 'on' : ''} />)}
        </span>
      )}
    </button>
  );

  return (
    <>
      <header
        ref={rootRef}
        className={`sky-header ${photo ? 'has-photo' : ''}`}
        style={{ height: `calc(var(--sky-top) + ${fullHeight}px)`, ['--sky-bg' as string]: photo ? '#000' : skyNow.sky[0] }}
      >
        <div className="sky-scene">{scene()}</div>
        {sunTappable && (
          <button
            type="button"
            className="sky-sun-tap"
            style={{ left: sunNow.x - 24, top: sceneTop(sunNow.y - 24) }}
            onClick={playDay}
            aria-label="Play today's sky, from sunrise to now"
          />
        )}
        {pathShown && (
          <div className="sky-path-words" aria-live="polite">
            {/* One line across the middle, between the name and the quote, wherever the sun is. */}
            <span className="sky-path-left" style={{ left: '50%', top: sceneTop(PATH_LINE_Y) }}>
              <span>Rose {formatClock(day.sunrise)}</span>
              <b>
                {Math.floor(Math.round(daylightLeft * 60) / 60)}h {String(Math.round(daylightLeft * 60) % 60).padStart(2, '0')}m of daylight left
              </b>
              <span>Sets {formatClock(day.sunset)}</span>
            </span>
          </div>
        )}
        <div className="sky-content">
          <div className="sky-top">
            <button type="button" className="sky-mark" onClick={onOpenGuide} aria-label="Open YouDO guide" title="Guide">
              {/* The box is cut to the Y's strokes, so "ouDO" sits right beside it. */}
              <svg width="20" height="21" viewBox="3.7 3.2 16.6 17.6" aria-hidden>
                <path d="M5 4.5L12 13.25V19.5" stroke="var(--primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M19 4.5L12 13.25L8.9 9.6" stroke="var(--accent-tick, var(--secondary))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span className="sky-mark-ou">ou</span>DO
            </button>
            <div className="sky-top-right">
              {showInvite && (
                <button type="button" className="sky-invite" onClick={() => setPickerOpen(true)}>
                  <MapPin size={10} strokeWidth={2.4} aria-hidden /> Set sky
                </button>
              )}
              {weatherFlash ? <span className="sky-weather-name">{weatherFlash}</span> : <span className="sky-date">{dateText}</span>}
              {weatherOn && !photo && (
                <button
                  type="button"
                  className="sky-weather-btn"
                  onClick={() => {
                    const next = nextWeather(dayWeather);
                    saveDayWeather(dateKey, next);
                    setWeatherFlash(next === 'cloudy' ? 'Cloudy' : next === 'rainy' ? 'Rainy' : 'Clear');
                  }}
                  aria-label={`Today's weather: ${weatherName}. Tap to change`}
                >
                  <WeatherIcon key={weather + (night > 0.5 ? 'n' : 'd')} size={15} strokeWidth={2.2} aria-hidden />
                </button>
              )}
            </div>
          </div>
          <div className="sky-mid">
            <div className="sky-hello">
              {kicker && <small>{kicker}</small>}
              <h1>{title}</h1>
              {!today && subtitle && <span className="sky-sub">{subtitle}</span>}
            </div>
            {countdown}
          </div>
          {today && quote && (
            <div className={`sky-quote ${quoteOpen ? 'is-open' : ''}`}>
              <p ref={quoteRef}>
                {quote.text}
                {quote.author && quote.author !== 'Unknown' && <cite>{quote.author}</cite>}
              </p>
              {quoteLong && (
                <button type="button" className="sky-more" onClick={() => setQuoteOpen((open) => !open)} aria-expanded={quoteOpen}>
                  {quoteOpen ? 'less' : 'more'}
                </button>
              )}
            </div>
          )}
        </div>
      </header>
      <Overlay open={pickerOpen} onClose={() => setPickerOpen(false)} align="bottom">
        <div className="sky-picker">
          <h2>Where is your sky?</h2>
          <p>Pick your state for the real sunrise and sunset. It's worked out on the phone; no location access.</p>
          <div className="sky-picker-list">
            {SKY_PLACES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  saveSkyPlace(p.id);
                  setSkyInviteDone();
                  setPickerOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sky-picker-later"
            onClick={() => {
              setSkyInviteDone();
              setPickerOpen(false);
            }}
          >
            Not now (it stays in Settings → Appearance)
          </button>
        </div>
      </Overlay>
    </>
  );
}
