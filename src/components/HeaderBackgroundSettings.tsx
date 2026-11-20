import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Mountain, Trash2 } from 'lucide-react';
import {
  HEADER_BACKGROUND_EVENT,
  loadHeaderBackground,
  loadHeaderPhoto,
  preparePhoto,
  removeHeaderPhoto,
  saveHeaderBackground,
  saveHeaderPhoto,
  type HeaderBackground,
} from '../lib/headerBackground';
import { automaticPlace, deviceTimeZone, formatClock, loadSkyPlace, saveSkyPlace, setSkyInviteDone, SKY_PLACES, standardOffsetHours, sunDayForPlace } from '../lib/skyPlaces';
import { setWeatherButton, weatherButtonEnabled } from '../lib/weather';
import Toggle from './Toggle';
import { todayISO } from '../lib/dates';

/**
 * Settings → Appearance → Header background: the dynamic sky, or the user's
 * own photo with where it sits (two sliders) and how strong it shows (a
 * third). Kept on this device only (src/lib/headerBackground.ts).
 */
export default function HeaderBackgroundSettings() {
  const [prefs, setPrefs] = useState<HeaderBackground>(loadHeaderBackground);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [placeId, setPlaceId] = useState(loadSkyPlace);
  const today = sunDayForPlace(placeId, todayISO(), -new Date().getTimezoneOffset() / 60);
  const zone = deviceTimeZone();
  const auto = automaticPlace(zone, standardOffsetHours(new Date().getFullYear()));
  const autoLabel = auto.city ? `Automatic · ${auto.city}` : zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta' ? 'Automatic · central India' : 'Automatic (from the phone’s time zone)';
  const [weatherButton, setWeatherButtonState] = useState(weatherButtonEnabled);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    const refresh = async () => {
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

  const update = (patch: Partial<HeaderBackground>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    saveHeaderBackground(next);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await saveHeaderPhoto(await preparePhoto(file));
      update({ mode: 'photo' });
    } catch {
      setError('That file could not be used as a photo. Try a JPG or PNG.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const remove = async () => {
    await removeHeaderPhoto();
    update({ mode: 'sky' });
  };

  const photoMode = prefs.mode === 'photo';
  const sliders: { key: 'x' | 'y' | 'opacity'; label: string; min: number; max: number; value: number; show: string }[] = [
    { key: 'x', label: 'Horizontal', min: 0, max: 100, value: prefs.x, show: `${Math.round(prefs.x)}%` },
    { key: 'y', label: 'Vertical', min: 0, max: 100, value: prefs.y, show: `${Math.round(prefs.y)}%` },
    { key: 'opacity', label: 'Opacity', min: 20, max: 100, value: Math.round(prefs.opacity * 100), show: `${Math.round(prefs.opacity * 100)}%` },
  ];

  return (
    <div className="settings-data-row p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
          <Mountain size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xs font-semibold text-content-primary">Header background</h3>
          <p className="text-[10.5px] text-content-secondary font-medium">
            {photoMode ? 'Your own photo at the top of every tab. It stays on this device.' : 'A sky that follows the time of day, with tonight’s earned stars.'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface p-1" role="radiogroup" aria-label="Header background">
        {(['sky', 'photo'] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={prefs.mode === mode}
            onClick={() => (mode === 'photo' && !photoUrl ? fileRef.current?.click() : update({ mode }))}
            className={`min-h-9 rounded-lg text-[11.5px] font-semibold transition ${prefs.mode === mode ? 'bg-primary text-on-primary shadow' : 'text-content-secondary'}`}
          >
            {mode === 'sky' ? 'Dynamic sky' : 'Your photo'}
          </button>
        ))}
      </div>

      {!photoMode && (
        <label className="block">
          <span className="block text-[10.5px] font-semibold text-content-secondary">Sky location</span>
          <select
            value={placeId}
            onChange={(e) => {
              setPlaceId(e.target.value);
              saveSkyPlace(e.target.value);
              setSkyInviteDone();
            }}
            className="mt-1 w-full min-h-10 rounded-xl border border-subtle bg-surface px-3 text-[12.5px] font-semibold text-content-primary"
          >
            <option value="auto">{autoLabel}</option>
            {SKY_PLACES.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <span className="mt-1.5 block text-[10.5px] text-content-muted">
            Today: sunrise {formatClock(today.sunrise)} · sunset {formatClock(today.sunset)}. Worked out on the phone; no location access.
            {placeId === 'auto' && !auto.city && ' Pick your state for the exact times.'}
          </span>
        </label>
      )}

      {!photoMode && (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-[11.5px] font-semibold text-content-primary">Weather button</h4>
            <p className="text-[10.5px] text-content-secondary">A button in the header sets today’s sky: clear, cloudy or rainy.</p>
          </div>
          <Toggle
            checked={weatherButton}
            onChange={() => {
              setWeatherButtonState(!weatherButton);
              setWeatherButton(!weatherButton);
            }}
            label="Weather button"
          />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />

      {photoMode && photoUrl && (
        <>
          <div className="relative h-24 overflow-hidden rounded-xl bg-black" aria-hidden>
            <img
              src={photoUrl}
              alt=""
              className="absolute inset-0 h-full w-full max-w-none object-cover"
              style={{ objectPosition: `${prefs.x}% ${prefs.y}%`, opacity: prefs.opacity }}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" />
            <span className="absolute left-3 bottom-2.5 text-lg font-bold text-white [text-shadow:0_1px_8px_rgba(0,0,0,.5)]">Today</span>
          </div>
          {sliders.map((s) => (
            <label key={s.key} className="block">
              <span className="flex justify-between text-[10.5px] font-semibold text-content-secondary">
                {s.label}
                <span className="tabular-nums text-content-muted">{s.show}</span>
              </span>
              <input
                type="range"
                min={s.min}
                max={s.max}
                step={1}
                value={s.value}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  update(s.key === 'opacity' ? { opacity: v / 100 } : { [s.key]: v });
                }}
                className="mt-1 w-full accent-[var(--primary)]"
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className="flex-1 min-h-9 inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface text-[11.5px] font-semibold text-content-primary disabled:opacity-50"
            >
              <ImagePlus size={14} /> Change photo
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              className="min-h-9 px-3 inline-flex items-center justify-center gap-1.5 rounded-xl bg-surface text-[11.5px] font-semibold text-error"
            >
              <Trash2 size={14} /> Remove
            </button>
          </div>
        </>
      )}
      {busy && <p className="text-[10.5px] text-content-muted">Preparing the photo…</p>}
      {error && <p className="text-[10.5px] text-error">{error}</p>}
    </div>
  );
}
