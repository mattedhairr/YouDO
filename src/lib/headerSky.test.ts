import { describe, expect, it } from 'vitest';
import { SKY_STARS } from './focusSky';
import { dustStars, greeting, headerConstellation, headerStars, mixColor, nightness, ridgeLine, skyColors, sunState, upcomingDeadlines } from './headerSky';

const channels = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);

describe('the header sky through the day', () => {
  it('changes smoothly: no jump between one minute and the next', () => {
    for (let m = 0; m < 24 * 60; m++) {
      const a = skyColors(m / 60);
      const b = skyColors((m + 1) / 60);
      a.sky.forEach((c, i) => {
        const x = channels(c);
        const y = channels(b.sky[i]);
        for (let k = 0; k < 3; k++) expect(Math.abs(x[k] - y[k])).toBeLessThan(6);
      });
    }
  });

  it('is the same sky at midnight from both sides, and wraps past 24h', () => {
    expect(skyColors(0)).toEqual(skyColors(24));
    expect(skyColors(25)).toEqual(skyColors(1));
  });

  it('shows stars only at night, easing in at dusk and out at dawn', () => {
    expect(nightness(12)).toBe(0);
    expect(nightness(23)).toBe(1);
    expect(nightness(2)).toBe(1);
    const dusk = nightness(19.5);
    expect(dusk).toBeGreaterThan(0);
    expect(dusk).toBeLessThan(1);
    expect(nightness(6)).toBeGreaterThan(0);
    expect(nightness(7)).toBe(0);
  });

  it('has the sun up by day only, rising and setting in the valley', () => {
    expect(sunState(3).visible).toBe(false);
    expect(sunState(22).visible).toBe(false);
    const noon = sunState(12.4);
    expect(noon.visible).toBe(true);
    expect(noon.elevation).toBeGreaterThan(0.99);
    expect(Math.abs(noon.dx)).toBeLessThan(0.01);
    expect(sunState(6.3).elevation).toBeLessThan(0.1);
    expect(sunState(6.3).dx).toBeLessThan(0);
    expect(sunState(18.5).dx).toBeGreaterThan(0);
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

describe('the mountains', () => {
  it('are fixed, and low in the valley, higher toward the sides', () => {
    const a = ridgeLine(3, 412, 132, 72, 222);
    expect(ridgeLine(3, 412, 132, 72, 222)).toEqual(a);
    expect(a).toHaveLength(65);
    const heightAt = (x: number) => a.reduce((best, p) => (Math.abs(p[0] - x) < Math.abs(best[0] - x) ? p : best))[1];
    // y grows downward: the valley sits lower (larger y) than the far sides on average.
    const sides = (heightAt(0) + heightAt(412)) / 2;
    expect(heightAt(222)).toBeGreaterThan(sides);
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
    expect(a).toHaveLength(110);
    for (const d of a) expect(d.opacity).toBeLessThanOrEqual(0.3);
  });
});
