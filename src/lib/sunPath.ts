/**
 * The real sun for the sky header: sunrise, solar noon, sunset and the sun's
 * height, from the date and a place (latitude and longitude), with the
 * NOAA solar formulas. Pure arithmetic: no location access and no network.
 * The place comes from Settings → Appearance → Sky location (skyPlaces.ts).
 */

const RAD = Math.PI / 180;

export interface SunDay {
  /** Local clock hours (19.5 is 7:30 pm). */
  sunrise: number;
  noon: number;
  sunset: number;
  /** For the sun's height through the day. */
  latitude: number;
  declination: number;
}

/** Day of the year (1 = 1 January) of a "YYYY-MM-DD" date. */
function dayOfYear(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return Math.round((Date.UTC(y, (m || 1) - 1, d || 1) - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
}

/**
 * The sun's day at a place. `utcOffsetHours` is the clock's offset (India:
 * 5.5). Near the poles, where the sun may not rise or set, the times are
 * clamped to a plausible day.
 */
export function sunDay(dateKey: string, latitude: number, longitude: number, utcOffsetHours: number): SunDay {
  const g = ((2 * Math.PI) / 365) * (dayOfYear(dateKey) - 1);
  const eqTime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const declination =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const noonMinutes = 720 - 4 * longitude - eqTime + utcOffsetHours * 60;
  const lat = latitude * RAD;
  const cosH = Math.cos(90.833 * RAD) / (Math.cos(lat) * Math.cos(declination)) - Math.tan(lat) * Math.tan(declination);
  const halfDayDeg = Math.acos(Math.max(-1, Math.min(1, cosH))) / RAD;
  // Hours from noon to sunrise and to sunset (4 minutes per degree), kept to a plausible day.
  const half = Math.max(2, Math.min(10, (4 * halfDayDeg) / 60));
  const noon = noonMinutes / 60;
  return { sunrise: noon - half, noon, sunset: noon + half, latitude, declination };
}

/** The sun's compass direction in degrees (90 east, 180 south, 270 west) at `hour` on that day. */
export function sunAzimuth(day: SunDay, hour: number): number {
  const h = 15 * (hour - day.noon) * RAD;
  const lat = day.latitude * RAD;
  const az = Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(lat) - Math.tan(day.declination) * Math.cos(lat)) / RAD + 180;
  return ((az % 360) + 360) % 360;
}

/**
 * How far either side of the valley the sun rises and sets, as a fraction of
 * the header's width: about a third in India's winter, wider in summer, when
 * the real sun rises further round to the north-east.
 */
export function sunSwing(day: SunDay): number {
  const spread = Math.abs(180 - sunAzimuth(day, day.sunrise));
  return Math.min(0.4, Math.max(0.3, 0.33 + (0.07 * (spread - 67)) / 50));
}

/** The sun's height above the horizon, in degrees, at `hour` on that day. */
export function sunAltitude(day: SunDay, hour: number): number {
  const hourAngle = 15 * (hour - day.noon) * RAD;
  const lat = day.latitude * RAD;
  const s = Math.sin(lat) * Math.sin(day.declination) + Math.cos(lat) * Math.cos(day.declination) * Math.cos(hourAngle);
  return Math.asin(Math.max(-1, Math.min(1, s))) / RAD;
}
