import { describe, expect, it } from 'vitest';
import { sunAltitude, sunDay } from './sunPath';

const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const near = (actual: number, h: number, m: number, slackMin = 4) =>
  expect(Math.abs(actual - (h + m / 60)) * 60, `got ${hm(actual)}, want ${h}:${String(m).padStart(2, '0')}`).toBeLessThanOrEqual(slackMin);

describe('sunrise and sunset from the date and place', () => {
  it('matches published times for Indian cities (timeanddate.com, IST, 20 Nov 2026)', () => {
    const delhi = sunDay('2026-11-20', 28.61, 77.21, 5.5);
    near(delhi.sunrise, 6, 47);
    near(delhi.sunset, 17, 25);
    const kolkata = sunDay('2026-11-20', 22.57, 88.36, 5.5);
    near(kolkata.sunrise, 5, 52);
    near(kolkata.sunset, 16, 51);
    const chennai = sunDay('2026-11-20', 13.08, 80.27, 5.5);
    near(chennai.sunrise, 6, 9);
    near(chennai.sunset, 17, 39);
    const mumbai = sunDay('2026-11-20', 19.08, 72.88, 5.5);
    near(mumbai.sunrise, 6, 48);
    near(mumbai.sunset, 17, 59);
  });

  it('follows the seasons: long June days and short December ones in the north', () => {
    const june = sunDay('2026-06-21', 28.61, 77.21, 5.5);
    const december = sunDay('2026-12-21', 28.61, 77.21, 5.5);
    expect(june.sunset - june.sunrise).toBeGreaterThan(13.5);
    expect(december.sunset - december.sunrise).toBeLessThan(10.5);
  });

  it('puts the east ahead of the west on the same clock', () => {
    const east = sunDay('2026-11-20', 27.1, 93.62, 5.5); // Itanagar
    const west = sunDay('2026-11-20', 23.02, 72.57, 5.5); // Ahmedabad
    expect(west.noon - east.noon).toBeGreaterThan(1.2);
  });
});

describe('the sun’s height', () => {
  it('is highest at noon, lower in the morning, below the horizon at night', () => {
    const delhi = sunDay('2026-11-20', 28.61, 77.21, 5.5);
    const noon = sunAltitude(delhi, delhi.noon);
    expect(noon).toBeGreaterThan(38);
    expect(noon).toBeLessThan(44); // a low winter sun in Delhi
    expect(sunAltitude(delhi, 9.5)).toBeLessThan(noon * 0.75);
    expect(sunAltitude(delhi, 22)).toBeLessThan(0);
    expect(Math.abs(sunAltitude(delhi, delhi.sunrise))).toBeLessThan(1.5);
  });

  it('stands far higher at noon in summer', () => {
    const june = sunDay('2026-06-21', 28.61, 77.21, 5.5);
    expect(sunAltitude(june, june.noon)).toBeGreaterThan(80);
  });
});
