import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Trash2 } from 'lucide-react';
import { ACCENT_COLORS, ACCENT_SWATCHES, resolveAccent, type AccentColor, type CustomAccent, type Rgb } from '../lib/accentColors';
import { accentFromColor, photoColors } from '../lib/photoAccent';
import { SCENES, sceneShape, SCENE_OF_ACCENT, type SceneMark, type ScenePalette } from '../lib/headerScenes';
import { mixColor } from '../lib/headerSky';
import {
  HEADER_BACKGROUND_EVENT,
  loadHeaderBackground,
  loadHeaderPhoto,
  preparePhoto,
  removeHeaderPhoto,
  saveHeaderBackground,
  saveHeaderPhoto,
} from '../lib/headerBackground';
import type { Theme } from '../hooks/useTheme';
import SkyOptions from './SkyOptions';

/** Late-afternoon light: between a scene's day and its golden evening. */
function afternoon(day: ScenePalette, evening: ScenePalette): ScenePalette {
  const t = 0.45;
  return {
    sky: day.sky.map((c, i) => mixColor(c, evening.sky[i], t)),
    layers: day.layers.map(([a, b], i) => [mixColor(a, evening.layers[i][0], t), mixColor(b, evening.layers[i][1], t)]),
    rim: mixColor(day.rim, evening.rim, t),
    mist: mixColor(day.mist, evening.mist, t),
    snow: day.snow && evening.snow ? mixColor(day.snow, evening.snow, t) : undefined,
  };
}

/** A scene's land in late-afternoon light, drawn small for its card (no stars or weather). */
function ScenePreview({ accent }: { accent: AccentColor }) {
  const id = SCENE_OF_ACCENT[accent];
  const shape = useMemo(() => sceneShape(id, 412, 14), [id]);
  const c = useMemo(() => afternoon(SCENES[id].palettes.day, SCENES[id].palettes.evening), [id]);
  const fill = (pts: [number, number][]) => `M0 230 L${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')} L412 230 Z`;
  const paint = (m: SceneMark, k: number) => {
    if (m.paint === 'haze' || m.paint === 'face-l' || m.paint === 'face-r' || m.dusk) return null;
    const color = m.paint === 'snow' ? c.snow ?? '#fff'
      : m.paint === 'land' ? c.layers[m.layer][0]
        : m.paint === 'wheat' ? mixColor(c.layers[1][0], '#fff1cf', 0.22)
          : m.paint === 'foam' ? mixColor(c.sky[3], '#ffffff', 0.55)
            : m.paint === 'shine' ? c.rim
              : mixColor(c.layers[m.layer][1], '#000000', m.paint === 'edge' ? 0.45 : 0.3);
    const clip = m.clip ? `url(#sp-${id}-${m.layer})` : undefined;
    return m.stroke
      ? <path key={k} d={m.d} clipPath={clip} fill="none" stroke={color} strokeWidth={m.stroke} opacity={m.opacity ?? 1} />
      : <path key={k} d={m.d} clipPath={clip} fill={color} opacity={m.opacity ?? 1} />;
  };
  return (
    <svg viewBox="0 42 412 120" preserveAspectRatio="xMidYMid slice" className="block h-full w-full" aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          {c.sky.map((s, i) => <stop key={i} offset={[0, 0.4, 0.72, 1][i]} stopColor={s} />)}
        </linearGradient>
        {shape.ranges.map((_, i) => (
          <linearGradient key={i} id={`sp-${id}-l${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.layers[i][0]} /><stop offset="1" stopColor={c.layers[i][1]} /></linearGradient>
        ))}
        {shape.ranges.map((pts, i) => <clipPath key={`c${i}`} id={`sp-${id}-${i}`}><path d={fill(pts)} /></clipPath>)}
      </defs>
      <rect x="0" y="0" width="412" height="230" fill={`url(#sp-${id}-sky)`} />
      <circle cx={412 * shape.sun.valley} cy={shape.sun.base - 6} r={9} fill="#ffe2bd" />
      {shape.ranges.map((pts, i) => (
        <g key={i}>
          <path d={fill(pts)} fill={`url(#sp-${id}-l${i})`} />
          {shape.marks.filter((m) => m.layer === i).map(paint)}
        </g>
      ))}
    </svg>
  );
}

/** Draws the photo into a canvas, cropped as the header shows it, and gives its pixels. */
function usePhotoCanvas(): { url: string | null; draw: (canvas: HTMLCanvasElement | null) => void; pixels: () => Uint8ClampedArray | null } {
  const [url, setUrl] = useState<string | null>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const [, setReady] = useState(0);
  useEffect(() => {
    let current: string | null = null;
    let cancelled = false;
    const refresh = async () => {
      const blob = await loadHeaderPhoto();
      if (cancelled) return;
      if (current) URL.revokeObjectURL(current);
      current = blob ? URL.createObjectURL(blob) : null;
      setUrl(current);
      if (!current) {
        image.current = null;
        return;
      }
      const img = new Image();
      img.onload = () => {
        if (cancelled) return;
        image.current = img;
        setReady((n) => n + 1);
      };
      img.src = current;
    };
    void refresh();
    const onChange = () => void refresh();
    window.addEventListener(HEADER_BACKGROUND_EVENT, onChange);
    return () => {
      cancelled = true;
      window.removeEventListener(HEADER_BACKGROUND_EVENT, onChange);
      if (current) URL.revokeObjectURL(current);
    };
  }, []);
  const draw = (canvas: HTMLCanvasElement | null) => {
    const img = image.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx || !img) return;
    const prefs = loadHeaderBackground();
    const { width: w, height: h } = canvas;
    const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.naturalWidth - sw) * (prefs.x / 100);
    const sy = (img.naturalHeight - sh) * (prefs.y / 100);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  };
  const pixels = () => {
    const img = image.current;
    if (!img) return null;
    const small = document.createElement('canvas');
    small.width = 96;
    small.height = Math.max(1, Math.round((96 * img.naturalHeight) / img.naturalWidth));
    const ctx = small.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, small.width, small.height);
    return ctx.getImageData(0, 0, small.width, small.height).data;
  };
  return { url, draw, pixels };
}

/**
 * Settings → Appearance → Scene and colour: one choice sets both the header's
 * landscape and the app's accent, so they always match (headerScenes.ts). The
 * fourth choice is the user's own photo, with a colour picked from it.
 */
export default function ScenePicker({ theme, setTheme }: { theme: Theme; setTheme: (update: (prev: Theme) => Theme) => void }) {
  const current = resolveAccent(theme);
  const { url, draw, pixels } = usePhotoCanvas();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [suggested, setSuggested] = useState<CustomAccent[]>([]);
  const newPhoto = useRef(false);
  const [prefs, setPrefs] = useState(loadHeaderBackground);
  useEffect(() => {
    const onChange = () => setPrefs(loadHeaderBackground());
    window.addEventListener(HEADER_BACKGROUND_EVENT, onChange);
    return () => window.removeEventListener(HEADER_BACKGROUND_EVENT, onChange);
  }, []);

  const photoChosen = current === 'custom' && prefs.mode === 'photo' && Boolean(url);
  const applyColor = (accent: CustomAccent) => setTheme((prev) => ({ ...prev, accent: 'custom', custom: accent }));

  // Once the photo is ready: draw it, and suggest its colours.
  useEffect(() => {
    if (!photoChosen) return;
    const id = window.setTimeout(() => {
      draw(canvasRef.current);
      const data = pixels();
      if (data) setSuggested(photoColors(data).map(accentFromColor));
    }, 60);
    return () => window.clearTimeout(id);
    // draw and pixels read the latest photo each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoChosen, url, prefs.x, prefs.y]);

  const pickPreset = (accent: AccentColor) => {
    setTheme((prev) => ({ ...prev, accent }));
    if (prefs.mode === 'photo') saveHeaderBackground({ ...prefs, mode: 'sky' });
  };

  const choosePhoto = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await saveHeaderPhoto(await preparePhoto(file));
      newPhoto.current = true;
      saveHeaderBackground({ ...loadHeaderBackground(), mode: 'photo' });
      // The first colour follows once the photo has loaded (see below).
      setTheme((prev) => ({ ...prev, accent: 'custom', custom: prev.custom ?? { dark: '#C9A46E', light: '#8C6A3A' } }));
    } catch {
      setError('That file could not be used as a photo. Try a JPG or PNG.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // A newly chosen photo takes its most colourful colour.
  useEffect(() => {
    if (!newPhoto.current || !suggested.length) return;
    newPhoto.current = false;
    applyColor(suggested[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggested]);

  const pickPhotoCard = () => {
    if (!url) {
      fileRef.current?.click();
      return;
    }
    saveHeaderBackground({ ...prefs, mode: 'photo' });
    if (theme.custom) setTheme((prev) => ({ ...prev, accent: 'custom' }));
    else {
      const data = pixels();
      const first = data ? photoColors(data, 1)[0] : undefined;
      applyColor(first ? accentFromColor(first) : { dark: '#C9A46E', light: '#8C6A3A' });
    }
  };

  // Where the photo sits in the header, and how strongly it shows.
  const sliders: { key: 'x' | 'y' | 'opacity'; label: string; min: number; max: number; value: number; show: string }[] = [
    { key: 'x', label: 'Horizontal', min: 0, max: 100, value: prefs.x, show: `${Math.round(prefs.x)}%` },
    { key: 'y', label: 'Vertical', min: 0, max: 100, value: prefs.y, show: `${Math.round(prefs.y)}%` },
    { key: 'opacity', label: 'Opacity', min: 20, max: 100, value: Math.round(prefs.opacity * 100), show: `${Math.round(prefs.opacity * 100)}%` },
  ];

  /** Back to the default scene and its colour. */
  const removePhoto = async () => {
    await removeHeaderPhoto();
    saveHeaderBackground({ ...loadHeaderBackground(), mode: 'sky' });
    setTheme((prev) => ({ ...prev, accent: 'sand' }));
  };

  const tapPhoto = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { willReadFrequently: true });
    if (!canvas || !ctx) return;
    const box = canvas.getBoundingClientRect();
    const x = Math.round(((event.clientX - box.left) / box.width) * canvas.width);
    const y = Math.round(((event.clientY - box.top) / box.height) * canvas.height);
    const d = ctx.getImageData(Math.max(0, x - 1), Math.max(0, y - 1), 3, 3).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < d.length; i += 4) {
      r += d[i];
      g += d[i + 1];
      b += d[i + 2];
    }
    const rgb: Rgb = [r / 9, g / 9, b / 9];
    applyColor(accentFromColor(rgb));
  };

  const card = 'relative overflow-hidden rounded-2xl border-2 bg-surface text-left transition';
  return (
    <div className="settings-data-row p-4 space-y-3">
      <div>
        <h3 className="text-xs font-semibold text-content-primary">Scene and colour</h3>
        <p className="text-[10.5px] text-content-secondary font-medium">One choice sets the header’s landscape and the app’s colour, so they always match.</p>
      </div>
      <div role="radiogroup" aria-label="Scene and colour" className="grid grid-cols-2 gap-2">
        {ACCENT_COLORS.map((accent) => {
          const scene = SCENES[SCENE_OF_ACCENT[accent]];
          const swatch = ACCENT_SWATCHES[accent];
          const on = current === accent;
          return (
            <button key={accent} type="button" role="radio" aria-checked={on} onClick={() => pickPreset(accent)}
              className={card} style={{ borderColor: on ? 'var(--primary)' : 'transparent' }}>
              <span className="block h-16 overflow-hidden"><ScenePreview accent={accent} /></span>
              <span className="flex items-center gap-2 px-2.5 py-2">
                <i className="h-3 w-3 shrink-0 rounded-full" style={{ background: theme.darkMode ? swatch.dark : swatch.light }} />
                <span className="min-w-0">
                  <b className="block truncate text-[12px] text-content-primary">{scene.name}</b>
                  <span className="block text-[10.5px] text-content-secondary">{swatch.label}</span>
                </span>
              </span>
              {on && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-on-primary"><Check size={12} strokeWidth={3} /></span>}
            </button>
          );
        })}
        <button type="button" role="radio" aria-checked={photoChosen} onClick={pickPhotoCard} disabled={busy}
          className={card} style={{ borderColor: photoChosen ? 'var(--primary)' : 'transparent' }}>
          <span className="grid h-16 place-items-center overflow-hidden bg-[repeating-linear-gradient(135deg,var(--bg-fill)_0_8px,transparent_8px_16px)] text-[11px] font-semibold text-content-secondary">
            {url ? <img src={url} alt="" className="h-full w-full max-w-none object-cover" style={{ objectPosition: `${prefs.x}% ${prefs.y}%` }} /> : <span className="inline-flex items-center gap-1"><ImagePlus size={13} /> Choose a photo</span>}
          </span>
          <span className="flex items-center gap-2 px-2.5 py-2">
            <i className="h-3 w-3 shrink-0 rounded-full" style={{ background: theme.custom ? (theme.darkMode ? theme.custom.dark : theme.custom.light) : 'conic-gradient(#e58c7a,#c9a46e,#8fb394,#8da6c9,#b39ac8,#e58c7a)' }} />
            <span className="min-w-0">
              <b className="block truncate text-[12px] text-content-primary">Your photo</b>
              <span className="block text-[10.5px] text-content-secondary">A colour from it</span>
            </span>
          </span>
          {photoChosen && <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-primary text-on-primary"><Check size={12} strokeWidth={3} /></span>}
        </button>
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void choosePhoto(e.target.files?.[0])} />

      {photoChosen && (
        <div className="space-y-2">
          <canvas ref={canvasRef} width={720} height={200} onPointerUp={tapPhoto}
            className="block h-24 w-full cursor-crosshair rounded-xl bg-black" style={{ opacity: Math.max(0.6, prefs.opacity) }} aria-label="Your photo: tap anywhere to take its colour" role="img" />
          <p className="text-[10.5px] font-semibold text-content-secondary">Colours from your photo, or tap anywhere on it</p>
          <div className="flex gap-2" role="radiogroup" aria-label="Colours from your photo">
            {suggested.map((s) => {
              const on = theme.custom?.dark === s.dark;
              return (
                <button key={s.dark} type="button" role="radio" aria-checked={on} aria-label={`Colour ${s.dark}`} onClick={() => applyColor(s)}
                  className="h-9 flex-1 rounded-xl border-2 transition" style={{ background: theme.darkMode ? s.dark : s.light, borderColor: on ? 'var(--text-primary)' : 'transparent' }} />
              );
            })}
          </div>
          <p className="text-[10.5px] text-content-muted">YouDO softens it for dark mode and deepens it for light mode, so text stays readable. Worked out on this phone; nothing is uploaded.</p>
          {sliders.map((sl) => (
            <label key={sl.key} className="block">
              <span className="flex justify-between text-[10.5px] font-semibold text-content-secondary">
                {sl.label}
                <span className="tabular-nums text-content-muted">{sl.show}</span>
              </span>
              <input
                type="range"
                min={sl.min}
                max={sl.max}
                step={1}
                value={sl.value}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  saveHeaderBackground({ ...prefs, ...(sl.key === 'opacity' ? { opacity: v / 100 } : { [sl.key]: v }) });
                }}
                className="mt-1 w-full accent-[var(--primary)]"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => fileRef.current?.click()}
              className="flex-1 min-h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface text-[11.5px] font-semibold text-content-primary disabled:opacity-50">
              <ImagePlus size={14} /> Change photo
            </button>
            <button type="button" onClick={() => void removePhoto()}
              className="min-h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface text-[11.5px] font-semibold text-error">
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </div>
      )}
      {prefs.mode !== 'photo' && <SkyOptions />}
      {busy && <p className="text-[10.5px] text-content-muted">Preparing the photo…</p>}
      {error && <p className="text-[10.5px] text-error">{error}</p>}
    </div>
  );
}
