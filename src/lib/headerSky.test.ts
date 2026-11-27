import { describe, expect, it } from 'vitest';
import { SKY_STARS } from './focusSky';
import { sunDay } from './sunPath';
import { SCENES } from './headerScenes';
import { dustStars, greeting, headerConstellation, headerStars, lensFlare, mixColor, nightness, skyColors, softStops, sunState, upcomingDeadlines } from './headerSky';

const channels = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
// Delhi on 20 Nov 2026: sunrise 6:47, sunset 17:25 (timeanddate.com).
const DAY = sunDay('2026-11-20', 28.61, 77.21, 5.5);
const SKIES = SCENES.himalaya.palettes;

describe('the header sky through the day', () => {
  it('changes smoothly: no jump between one minute and the next', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const a = skyColors(m / 60, DAY, SKIES);
      const b = skyColors((m + 1) / 60, DAY, SKIES);
      a.sky.forEach((c, i) => {
        const x = channels(c);
        const y = channels(b.sky[i]);
        for (let k = 0; k < 3; k++) expect(Math.abs(x[k] - y[k])).toBeLessThan(6);
      });
    }
  });

  it('is the same sky at midnight from both sides, and wraps past 24h', () => {
    expect(skyColors(0, DAY, SKIES)).toEqual(skyColors(24, DAY, SKIES));
    expect(skyColors(25, DAY, SKIES)).toEqual(skyColors(1, DAY, SKIES));
  });

  it('shows stars only at night, easing in after sunset and out before sunrise', () => {
    expect(nightness(12, DAY)).toBe(0);
    expect(nightness(23, DAY)).toBe(1);
    expect(nightness(2, DAY)).toBe(1);
    const dusk = nightness(DAY.sunset + 0.6, DAY);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(nightness(DAY.sunrise - 0.5, DAY)).toBeGreaterThan(0);
    expect(nightness(DAY.sunrise + 0.3, DAY)).toBe(0);
  });

  it('turns to dusk colours after the real sunset, not at a fixed hour', () => {
    // In June, Delhi's sun sets near 19:20: the sky at 18:30 is still day there, but dusk in November.
    const june = sunDay('2026-06-21', 28.61, 77.21, 5.5);
    expect(nightness(18.5, june)).toBe(0);
    expect(nightness(18.5, DAY)).toBeGreaterThan(0.3);
  });

  it('has the sun up by day only, rising and setting in the valley at the real times', () => {
    expect(sunState(3, DAY).visible).toBe(false);
    expect(sunState(22, DAY).visible).toBe(false);
    expect(sunState(DAY.sunset + 0.5, DAY).visible).toBe(false); // November: down by 6 pm
    const noon = sunState(DAY.noon, DAY);
    expect(noon.visible).toBe(true);
    expect(Math.abs(noon.dx)).toBeLessThan(0.01);
    const morning = sunState(DAY.sunrise + 0.2, DAY);
    expect(morning.visible).toBe(true);
    expect(morning.elevation).toBeLessThan(0.1);
    expect(morning.dx).toBeLessThan(0);
    expect(sunState(DAY.sunset - 0.2, DAY).dx).toBeGreaterThan(0);
  });

  it('crosses most of the header, quicker round noon, one way all day (also a long summer day in Chennai)', () => {
    for (const day of [DAY, sunDay('2026-06-21', 13.08, 80.27, 5.5), sunDay('2026-06-21', 28.61, 77.21, 5.5)]) {
      const rise = sunState(day.sunrise, day).dx;
      const set = sunState(day.sunset, day).dx;
      expect(rise).toBeLessThan(-0.28);
      expect(set).toBeGreaterThan(0.28);
      let last = -Infinity;
      for (let h = day.sunrise; h <= day.sunset; h += 0.1) {
        const dx = sunState(h, day).dx;
        expect(dx).toBeGreaterThanOrEqual(last);
        last = dx;
      }
      const step = (h: number) => sunState(h + 0.5, day).dx - sunState(h, day).dx;
      expect(step(day.noon - 0.25)).toBeGreaterThan(step(day.sunrise));
    }
  });

  it('climbs with the real altitude: mid-morning well below noon, a winter noon lower than a summer one', () => {
    const at930 = sunState(9.5, DAY);
    const noon = sunState(DAY.noon, DAY);
    expect(at930.rise).toBeLessThan(noon.rise * 0.75);
    const june = sunDay('2026-06-21', 28.61, 77.21, 5.5);
    expect(sunState(june.noon, june).rise).toBeGreaterThan(noon.rise + 30);
  });

  it('greets by the hour, and night owls with "Still at it"', () => {
    expect(greeting(8)).toBe('Good morning,');
    expect(greeting(13)).toBe('Good afternoon,');
    expect(greeting(19)).toBe('Good evening,');
    expect(greeting(23.5)).toBe('Still at it,');
    expect(greeting(2)).toBe('Still at it,');
  });

  it('mixes colours', () => {
    expect(mixColor('#000000', '#ffffff', 0.5)).toBe('rgba(128,128,128,1)');
    expect(mixColor('rgba(0,0,0,0)', 'rgba(255,255,255,1)', 1)).toBe('rgba(255,255,255,1)');
  });
});

describe('deadlines on the counter', () => {
  const goals = [
    { id: 'm', title: 'Mains', endDate: '2027-09-17' },
    { id: 'p', title: 'Prelims', endDate: '2027-05-24' },
    { id: 'e', title: 'Essay test', endDate: '2026-12-30' },
    { id: 'old', title: 'Last year', endDate: '2026-01-01' },
    { id: 'none', title: 'No date' },
    { id: 'done', title: 'Finished', endDate: '2027-01-01', completed: true },
  ];

  it('lists upcoming ones nearest first, leaving out past, undated and finished goals', () => {
    const list = upcomingDeadlines(goals, '2026-11-19');
    expect(list.map((g) => g.id)).toEqual(['e', 'p', 'm']);
    expect(list[0].days).toBe(41);
  });

  it('counts a deadline today as 0 days', () => {
    expect(upcomingDeadlines([{ id: 't', title: 'Today', endDate: '2026-11-19' }], '2026-11-19')[0].days).toBe(0);
  });
});

describe('the earned stars', () => {
  const free = () => false;

  it('are the ambient sky’s 36, lit by the same count, inside the band', () => {
    const all = headerStars('2026-11-19', 412, SKY_STARS, free);
    expect(all).toHaveLength(SKY_STARS);
    expect(headerStars('2026-11-19', 412, 4, free)).toHaveLength(4);
    expect(headerStars('2026-11-19', 412, 0, free)).toHaveLength(0);
    for (const s of all) {
      expect(s.x).toBeGreaterThanOrEqual(6);
      expect(s.x).toBeLessThanOrEqual(406);
      expect(s.y).toBeGreaterThanOrEqual(20);
      expect(s.y).toBeLessThanOrEqual(110);
      expect(s.opacity).toBeGreaterThan(0.3);
      expect(s.opacity).toBeLessThanOrEqual(1);
    }
  });

  it('are mostly faint pinpoints, a few brighter', () => {
    const all = headerStars('2026-11-19', 412, SKY_STARS, free);
    const bright = all.filter((s) => s.r > 0.9).length;
    expect(bright).toBeLessThan(all.length / 3);
  });

  it('light up in the same order as more focus comes in, and differ by day', () => {
    const few = headerStars('2026-11-19', 412, 10, free);
    const more = headerStars('2026-11-19', 412, 20, free);
    expect(more.slice(0, 10)).toEqual(few);
    expect(headerStars('2026-11-20', 412, 10, free)).not.toEqual(few);
  });

  it('stay faint behind the words', () => {
    const everywhere = () => true;
    for (const s of headerStars('2026-11-19', 412, SKY_STARS, everywhere)) expect(s.r).toBeLessThanOrEqual(0.4 + 0.4 * 0.85 + 1e-9);
  });
});

describe('the constellation at the bar', () => {
  it('joins 7 stars as a compact tree, and they always show', () => {
    const stars = headerStars('2026-11-19', 412, SKY_STARS, () => false);
    const lines = headerConstellation(stars, 7, () => true);
    const members = stars.filter((s) => s.member);
    expect(members).toHaveLength(7);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines.length).toBeGreaterThan(0);
    for (const [a, b] of lines) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThanOrEqual(74);
    for (const m of members) expect(m.opacity).toBeGreaterThanOrEqual(0.76);
  });

  it('draws nothing before the bar or without enough free stars', () => {
    const stars = headerStars('2026-11-19', 412, SKY_STARS, () => false);
    expect(headerConstellation(stars, 0, () => true)).toEqual([]);
    expect(headerConstellation(stars, 7, () => false)).toEqual([]);
  });
});

describe('the faint background stars', () => {
  it('are fixed for a day and spread over the band', () => {
    const a = dustStars('2026-11-19', 412);
    expect(a).toEqual(dustStars('2026-11-19', 412));
    expect(a).toHaveLength(28);
    for (const d of a) expect(d.opacity).toBeLessThanOrEqual(0.22);
  });
});

describe('soft glows', () => {
  it('fall smoothly from the peak to exactly nothing at the edge', () => {
    const stops = softStops(0.8, 0.35);
    expect(stops[0]).toEqual([0, 0.8]);
    expect(stops[stops.length - 1]).toEqual([1, 0]);
    for (let i = 1; i < stops.length; i++) {
      expect(stops[i][0]).toBeGreaterThan(stops[i - 1][0]);
      expect(stops[i][1]).toBeLessThanOrEqual(stops[i - 1][1]);
    }
  });
});

describe('the lens flare', () => {
  it('shows only around solar noon', () => {
    expect(lensFlare(DAY.noon, DAY)).toBeGreaterThan(0.9);
    expect(lensFlare(DAY.noon + 0.6, DAY)).toBeGreaterThan(0);
    expect(lensFlare(DAY.noon + 0.6, DAY)).toBeLessThan(lensFlare(DAY.noon, DAY));
    expect(lensFlare(DAY.noon - 1.5, DAY)).toBe(0);
    expect(lensFlare(DAY.sunrise + 1, DAY)).toBe(0);
    expect(lensFlare(DAY.sunset - 1, DAY)).toBe(0);
  });

  it('never shows where the sun stays low all day', () => {
    // Helsinki in December: the sun barely clears the horizon.
    const winter = sunDay('2026-12-21', 60.17, 24.94, 2);
    expect(lensFlare(winter.noon, winter)).toBe(0);
  });
});
