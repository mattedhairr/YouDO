import { STORAGE_KEYS } from './storageKeys';
import { sunDay, type SunDay } from './sunPath';
import { TZ_ALIASES, TZ_COORDINATES } from './tzCoordinates';

/**
 * Settings → Appearance → Sky location: where the header's sun rises and
 * sets. India shares one clock but spans two hours of sunrise east to west,
 * and its north has much shorter winter days than its south, so a state is
 * worth picking. Each place is its capital or main city; nothing else about
 * the user's location is used or needed. "auto" goes by the phone's time
 * zone: anywhere else in the world its main city is close enough (a phone on
 * "Europe/London" gets London's sun); India's one zone spans the country, so
 * there it means central India until a state is chosen.
 */
export interface SkyPlace {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const SKY_PLACES: SkyPlace[] = [
  { id: 'an', name: 'Andaman and Nicobar Islands', lat: 11.62, lon: 92.73 },
  { id: 'ap', name: 'Andhra Pradesh', lat: 16.51, lon: 80.52 },
  { id: 'ar', name: 'Arunachal Pradesh', lat: 27.1, lon: 93.62 },
  { id: 'as', name: 'Assam', lat: 26.14, lon: 91.74 },
  { id: 'br', name: 'Bihar', lat: 25.59, lon: 85.14 },
  { id: 'ch', name: 'Chandigarh', lat: 30.73, lon: 76.78 },
  { id: 'cg', name: 'Chhattisgarh', lat: 21.25, lon: 81.63 },
  { id: 'dd', name: 'Dadra and Nagar Haveli and Daman and Diu', lat: 20.42, lon: 72.83 },
  { id: 'dl', name: 'Delhi', lat: 28.61, lon: 77.21 },
  { id: 'ga', name: 'Goa', lat: 15.49, lon: 73.83 },
  { id: 'gj', name: 'Gujarat', lat: 23.02, lon: 72.57 },
  { id: 'hr', name: 'Haryana', lat: 28.89, lon: 76.61 },
  { id: 'hp', name: 'Himachal Pradesh', lat: 31.1, lon: 77.17 },
  { id: 'jk', name: 'Jammu and Kashmir', lat: 34.08, lon: 74.8 },
  { id: 'jh', name: 'Jharkhand', lat: 23.34, lon: 85.31 },
  { id: 'ka', name: 'Karnataka', lat: 12.97, lon: 77.59 },
  { id: 'kl', name: 'Kerala', lat: 9.93, lon: 76.27 },
  { id: 'la', name: 'Ladakh', lat: 34.15, lon: 77.58 },
  { id: 'ld', name: 'Lakshadweep', lat: 10.57, lon: 72.64 },
  { id: 'mp', name: 'Madhya Pradesh', lat: 23.26, lon: 77.41 },
  { id: 'mh', name: 'Maharashtra', lat: 19.08, lon: 72.88 },
  { id: 'mn', name: 'Manipur', lat: 24.82, lon: 93.94 },
  { id: 'ml', name: 'Meghalaya', lat: 25.58, lon: 91.89 },
  { id: 'mz', name: 'Mizoram', lat: 23.73, lon: 92.72 },
  { id: 'nl', name: 'Nagaland', lat: 25.67, lon: 94.11 },
  { id: 'od', name: 'Odisha', lat: 20.3, lon: 85.82 },
  { id: 'py', name: 'Puducherry', lat: 11.94, lon: 79.81 },
  { id: 'pb', name: 'Punjab', lat: 30.9, lon: 75.86 },
  { id: 'rj', name: 'Rajasthan', lat: 26.91, lon: 75.79 },
  { id: 'sk', name: 'Sikkim', lat: 27.33, lon: 88.61 },
  { id: 'tn', name: 'Tamil Nadu', lat: 13.08, lon: 80.27 },
  { id: 'ts', name: 'Telangana', lat: 17.39, lon: 78.49 },
  { id: 'tr', name: 'Tripura', lat: 23.83, lon: 91.28 },
  { id: 'up', name: 'Uttar Pradesh', lat: 26.85, lon: 80.95 },
  { id: 'uk', name: 'Uttarakhand', lat: 30.32, lon: 78.03 },
  { id: 'wb', name: 'West Bengal', lat: 22.57, lon: 88.36 },
];

/** A change, so an open header follows the setting at once. */
export const SKY_PLACE_EVENT = 'youdo-sky-place';

export function loadSkyPlace(): string {
  try {
    const id = localStorage.getItem(STORAGE_KEYS.skyPlace);
    return id && SKY_PLACES.some((p) => p.id === id) ? id : 'auto';
  } catch {
    return 'auto';
  }
}

export function saveSkyPlace(id: string): void {
  const value = SKY_PLACES.some((p) => p.id === id) ? id : 'auto';
  try {
    localStorage.setItem(STORAGE_KEYS.skyPlace, value);
  } catch {
    /* Restricted storage: the header still follows the change for this visit. */
  }
  window.dispatchEvent(new CustomEvent(SKY_PLACE_EVENT));
}

const INDIA_ZONES = new Set(['Asia/Kolkata', 'Asia/Calcutta']);
/** Central India: the middle of the country's one time zone. */
const CENTRAL_INDIA: [number, number] = [23.5, 82.5];

/** The phone's time zone name, such as "Europe/London" (empty if unknown). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

/** Is the phone's zone India's, where only a chosen state gives an exact sky? */
export function isIndiaTimeZone(timeZone: string): boolean {
  return INDIA_ZONES.has(timeZone);
}

/**
 * Where "automatic" puts the sun: the time zone's main city; central India for
 * India's zone; otherwise, for a zone not in the table, the middle of its
 * standard (winter) offset at a mid latitude. `standardOffsetHours` leaves out
 * summer time, so the noon sun is not an hour off in summer.
 */
export function automaticPlace(timeZone: string, standardOffsetHours: number): { lat: number; lon: number; city: string | null } {
  if (isIndiaTimeZone(timeZone)) return { lat: CENTRAL_INDIA[0], lon: CENTRAL_INDIA[1], city: null };
  const zone = TZ_COORDINATES[timeZone] ? timeZone : TZ_ALIASES[timeZone];
  const coords = zone ? TZ_COORDINATES[zone] : undefined;
  if (zone && coords) return { lat: coords[0], lon: coords[1], city: zone.split('/').pop()!.replace(/_/g, ' ') };
  return { lat: 23.5, lon: standardOffsetHours * 15, city: null };
}

/** The clock's offset without summer time: the smaller of January's and July's. */
export function standardOffsetHours(year: number): number {
  const jan = -new Date(year, 0, 1).getTimezoneOffset();
  const jul = -new Date(year, 6, 1).getTimezoneOffset();
  return Math.min(jan, jul) / 60;
}

/**
 * The sun's day for a place id on a date. `utcOffsetHours` is the phone's
 * clock offset now (India: 5.5; with summer time where it applies). "auto"
 * (or an unknown id) goes by `timeZone` (automaticPlace).
 */
export function sunDayForPlace(placeId: string, dateKey: string, utcOffsetHours: number, timeZone = deviceTimeZone()): SunDay {
  const place = SKY_PLACES.find((p) => p.id === placeId);
  if (place) return sunDay(dateKey, place.lat, place.lon, utcOffsetHours);
  const auto = automaticPlace(timeZone, standardOffsetHours(Number(dateKey.slice(0, 4)) || new Date().getFullYear()));
  return sunDay(dateKey, auto.lat, auto.lon, utcOffsetHours);
}

/** "6:47 am"-style, for the setting's preview line. */
export function formatClock(hours: number): string {
  const total = Math.round(((hours % 24) + 24) % 24 * 60);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h < 12 ? 'am' : 'pm';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** The header's one-time invite to set the sky's place (India): done after a choice or "Not now". */
export function skyInviteDone(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.skyPlaceInviteDone) === 'true';
  } catch {
    return true;
  }
}

export function setSkyInviteDone(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.skyPlaceInviteDone, 'true');
  } catch {
    /* Restricted storage: it may ask again next time. */
  }
  window.dispatchEvent(new CustomEvent(SKY_PLACE_EVENT));
}
