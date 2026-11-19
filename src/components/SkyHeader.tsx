import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { drawPlanet } from '../lib/planetArt';
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
const BAR = 38;
const FOLD_SHOW = 0.55;
const RIDGES = [
  { seed: 3, base: 132, amp: 72, rough: 0.55, sink: 0.35 },
  { seed: 14, base: 148, amp: 54, rough: 0.55, sink: 0.6 },
  { seed: 22, base: 166, amp: 36, rough: 0.55, sink: 0.85 },
  { seed: 31, base: 182, amp: 20, rough: 0.45, sink: 1 },
];
const TAB_LIFT = 14;
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

function PlanetMark({ index, phase, x, top }: { index: number; phase: number; x: number; top: number }) {
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
  return <canvas ref={ref} className="sky-planet" style={{ left: x - size / 2, top: `calc(var(--sky-top) + ${top - size / 2}px)`, width: size, height: size }} aria-hidden />;
}

/** The scene: sky, sun or stars, the mountains. Coordinates as in OFFSET. */
function SkyArt({ width, height, hour, stars, lines, dust, night, lift, folded }: {
  width: number;
  height: number;
  hour: number;
  stars: HeaderStar[];
  lines: [HeaderStar, HeaderStar][];
  dust: { x: number; y: number; opacity: number }[];
  night: number;
  lift: number;
  /** The slim bar shows the sky only: its ranges stay far below. */
  folded?: boolean;
}) {
  const colors = useMemo(() => skyColors(hour), [hour]);
  const valley = width * 0.54;
  const ridges = useMemo(() => RIDGES.map((r) => ridgeLine(r.seed, width, r.base - lift, r.amp, valley, r.rough)), [width, valley, lift]);
  const sun = sunState(hour);
  const sunX = valley + sun.dx * width;
  const sunY = 134 - sun.rise;
  const sunR = 10 + (7.5 - 10) * sun.elevation;
  const warmth = Math.pow(sun.elevation, 0.5);
  const glow = mixColor('#ff9258', '#fff6e2', sun.elevation).replace(/,1\)$/, '');
  const discCore = mixColor('#ffe2bd', '#ffffff', warmth);
  const discRim = mixColor('#ff9c5c', '#fff3dc', warmth);
  const low = 1 - sun.elevation;
  const top = folded ? -120 : -OFFSET - 40;
  const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
  const fill = (pts: [number, number][]) => `M0 ${height + 40} L` + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L') + ` L${width} ${height + 40} Z`;

  return (
    <svg className="sky-art" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden>
      <defs>
        <linearGradient id="sky-grad" x1="0" y1="0" x2="0" y2="1">
          {colors.sky.map((c, i) => <stop key={i} offset={[0, 0.4, 0.74, 1][i]} stopColor={c} />)}
        </linearGradient>
        <radialGradient id="sky-sunglow"><stop offset="0" stopColor={`${glow},.13)`} /><stop offset=".4" stopColor={`${glow},.05)`} /><stop offset="1" stopColor={`${glow},0)`} /></radialGradient>
        <radialGradient id="sky-horizon"><stop offset="0" stopColor="rgba(255,160,100,.42)" /><stop offset=".5" stopColor="rgba(255,140,90,.1)" /><stop offset="1" stopColor="rgba(255,140,90,0)" /></radialGradient>
        <radialGradient id="sky-corona"><stop offset=".3" stopColor={`${glow},.75)`} /><stop offset=".42" stopColor={`${glow},.32)`} /><stop offset=".62" stopColor={`${glow},.08)`} /><stop offset="1" stopColor={`${glow},0)`} /></radialGradient>
        <radialGradient id="sky-disc"><stop offset="0" stopColor={discCore} /><stop offset=".72" stopColor={discCore} /><stop offset="1" stopColor={discRim} /></radialGradient>
        <radialGradient id="sky-starbloom"><stop offset="0" stopColor="rgba(220,230,255,.5)" /><stop offset="1" stopColor="rgba(220,230,255,0)" /></radialGradient>
        {colors.layers.map(([a, b], i) => (
          <linearGradient key={i} id={`sky-l${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={a} /><stop offset="1" stopColor={b} /></linearGradient>
        ))}
        <linearGradient id="sky-haze" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={transparentOf(colors.mist)} /><stop offset="1" stopColor={colors.mist} /></linearGradient>
        <linearGradient id="sky-textshade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="rgba(0,0,0,.32)" /><stop offset=".5" stopColor="rgba(0,0,0,0)" /></linearGradient>
        <filter id="sky-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      <rect x="0" y={top} width={width} height={height - top} fill="url(#sky-grad)" />
      {night > 0.01 && (
        <g opacity={night}>
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
      {sun.visible && !folded && (
        <g className="sky-fold-sink" style={{ ['--sink' as string]: '0.2' }}>
          <ellipse cx={sunX} cy={sunY} rx={190} ry={120} fill="url(#sky-sunglow)" />
          {low > 0.35 && <ellipse cx={sunX} cy={sunY + 10} rx={260} ry={30} fill="url(#sky-horizon)" opacity={(low - 0.35) / 0.65} />}
          <circle cx={sunX} cy={sunY} r={sunR * 2.6} fill="url(#sky-corona)" />
          <ellipse cx={sunX} cy={sunY} rx={sunR} ry={sunR * (0.9 + 0.1 * sun.elevation)} fill="url(#sky-disc)" />
        </g>
      )}
      {!folded && ridges.map((pts, i) => (
        <g key={`r${i}`} className="sky-fold-sink" style={{ ['--sink' as string]: String(RIDGES[i].sink) }}>
          <path d={fill(pts)} fill={`url(#sky-l${i})`} />
          <path d={path(pts)} fill="none" stroke={colors.rim} strokeWidth={i === 0 ? 0.9 : 0.6} opacity={[1, 0.7, 0.45, 0.25][i]} />
          {i < 3 && (
            <rect x="0" y={Math.min(...pts.map((p) => p[1])) + 6} width={width} height={30 - i * 6} fill="url(#sky-haze)" filter="url(#sky-soft)" />
          )}
        </g>
      ))}
      <rect x="0" y={top} width={width} height={height - top} fill="url(#sky-textshade)" opacity={1 - night} />
    </svg>
  );
}

/**
 * The header of every tab in the Liquid Glass look: a small landscape whose
 * sky follows the hour (src/lib/headerSky.ts), with the YouDO mark, the date,
 * a greeting by name on Today, a countdown to the nearest goal deadline (a
 * tap shows the next) and the day's quote. Tonight's stars are today's earned
 * stars. Scrolling down folds it into a slim sky bar at the top. Settings →
 * Appearance can swap the sky for the user's own photo.
 */
export default function SkyHeader({ view, name, quote, goals, focusMs, barHours, onOpenGuide }: Props) {
  const now = useNow();
  const hour = hourOf(now);
  const dateKey = todayISO();
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
  const lift = today ? 0 : TAB_LIFT;
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(412);
  const [goalIndex, setGoalIndex] = useState(0);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteExtra, setQuoteExtra] = useState(0);
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const [quoteLong, setQuoteLong] = useState(false);
  const { prefs, photoUrl } = useHeaderBackground();
  const photo = prefs.mode === 'photo' && photoUrl ? photoUrl : null;

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Folding: the page scrolls the header away while its mountains sink, and
  // a slim sky bar fades in at the top. Written straight to CSS variables, so
  // scrolling never re-renders the scene.
  useEffect(() => {
    let frame = 0;
    const span = height - BAR;
    // The page scrolls inside #root (see index.css), not the window; any
    // scroll that carries the header is the one that folds it.
    let scroller: Element | null = null;
    const scrolled = () => (scroller ? scroller.scrollTop : window.scrollY);
    const apply = () => {
      frame = 0;
      const fold = Math.min(1, Math.max(0, scrolled() / span));
      rootRef.current?.style.setProperty('--fold', fold.toFixed(3));
      const bar = barRef.current;
      if (bar) {
        bar.style.setProperty('--fold', fold.toFixed(3));
        bar.dataset.shown = String(fold > FOLD_SHOW);
      }
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

  const night = nightness(hour);
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
  const planetIndex = weekdayOf(dateKey);
  const showPlanet = night > 0.05 && planetIndex !== 0 && ambientPlanetEnabled();
  const phase = useMemo(() => moonPhase(dateKey), [dateKey]);

  const deadline = deadlines.length ? deadlines[goalIndex % deadlines.length] : null;
  const dateText = now.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  const hello = greeting(hour);
  const title = today ? name ?? 'Today' : TITLES[view];
  const kicker = today ? (name ? hello : hello.replace(/,$/, '')) : null;
  const fullHeight = height + quoteExtra;

  const scene = (folded: boolean) =>
    photo ? (
      <img
        className="sky-photo"
        src={photo}
        alt=""
        style={{ objectPosition: `${prefs.x}% ${prefs.y}%`, opacity: prefs.opacity }}
      />
    ) : (
      <>
        <div className="sky-art-wrap" style={{ height: folded ? BAR + OFFSET + 30 : height + OFFSET }}>
          <SkyArt width={width} height={folded ? BAR + OFFSET + 30 : height + OFFSET} hour={hour} stars={stars} lines={lines} dust={dust} night={night} lift={lift} folded={folded} />
        </div>
        {!folded && showPlanet && <PlanetMark index={planetIndex} phase={phase} x={width * 0.54} top={74 - OFFSET + quoteExtra} />}
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
        style={{ height: `calc(var(--sky-top) + ${fullHeight}px)`, ['--sky-bg' as string]: photo ? '#000' : skyColors(hour).sky[0] }}
      >
        <div className="sky-scene">{scene(false)}</div>
        <div className="sky-content">
          <div className="sky-top">
            <button type="button" className="sky-mark" onClick={onOpenGuide} aria-label="Open YouDO guide" title="Guide">
              <svg width="21" height="21" viewBox="3 3 18 18" aria-hidden>
                <path d="M5 4.5L12 13.25V19.5" stroke="var(--primary)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M19 4.5L12 13.25L8.9 9.6" stroke="var(--accent-tick, var(--secondary))" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
              <span className="sky-mark-ou">ou</span>DO
            </button>
            <span className="sky-date">{dateText}</span>
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
      <div ref={barRef} className={`sky-bar ${photo ? 'has-photo' : ''}`} data-shown="false" style={{ ['--sky-bg' as string]: photo ? '#000' : skyColors(hour).sky[0] }} aria-hidden={false}>
        <div className="sky-scene">{scene(true)}</div>
        <div className="sky-bar-content">
          <span className="sky-bar-title">
            {today ? name ?? 'Today' : TITLES[view]}
            <small>{dateText}</small>
          </span>
          {today && deadline && (
            <span className="sky-bar-pill"><b>{deadline.days}</b> {deadline.days === 1 ? 'day' : 'days'} · {deadline.title}</span>
          )}
        </div>
      </div>
    </>
  );
}
