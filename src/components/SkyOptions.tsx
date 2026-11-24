import { useState } from 'react';
import { automaticPlace, deviceTimeZone, formatClock, loadSkyPlace, saveSkyPlace, setSkyInviteDone, SKY_PLACES, standardOffsetHours, sunDayForPlace } from '../lib/skyPlaces';
import { setWeatherButton, weatherButtonEnabled } from '../lib/weather';
import { todayISO } from '../lib/dates';
import Toggle from './Toggle';

/**
 * The scene's sky in Settings → Appearance → Scene and colour: where it is
 * (for the real sunrise and sunset, worked out on the phone) and the header's
 * weather button. Not shown while the header is the user's own photo.
 */
export default function SkyOptions() {
  const [placeId, setPlaceId] = useState(loadSkyPlace);
  const [weatherButton, setWeatherButtonState] = useState(weatherButtonEnabled);
  const today = sunDayForPlace(placeId, todayISO(), -new Date().getTimezoneOffset() / 60);
  const zone = deviceTimeZone();
  const auto = automaticPlace(zone, standardOffsetHours(new Date().getFullYear()));
  const autoLabel = auto.city ? `Automatic · ${auto.city}` : zone === 'Asia/Kolkata' || zone === 'Asia/Calcutta' ? 'Automatic · central India' : 'Automatic (from the phone’s time zone)';
  return (
    <div className="space-y-3 border-t border-subtle pt-3">
      <label className="block">
        <span className="block text-[10.5px] font-semibold text-content-secondary">Sunrise and sunset for</span>
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
    </div>
  );
}
