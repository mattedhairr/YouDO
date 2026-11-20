import { describe, expect, it } from 'vitest';
import { goalStart, heightAt, summitScene, trailFraction, walkTrail } from './summit';

describe('the summit landscape', () => {
  for (const [width, today, height] of [[412, true, 246], [360, true, 246], [412, false, 160]] as const) {
    it(`has one clear peak, its snow and a trail to it (${width}px, ${today ? 'Today' : 'a tab'})`, () => {
      const scene = summitScene(width, height, today);
      const [far, mid, near, front] = scene.ranges;
      const [px, py] = scene.peak;
      // The peak is the highest point of every range, and inside the header.
      for (const r of scene.ranges) for (const [, y] of r) expect(y).toBeGreaterThanOrEqual(py - 0.01);
      expect(py).toBeGreaterThan(0);
      // Ranges get nearer (lower on screen) in order, at the peak.
      expect(heightAt(far, px)).toBeLessThan(heightAt(mid, px));
      expect(heightAt(mid, 40)).toBeLessThan(heightAt(front, 40) + 1);
      expect(heightAt(near, 40)).toBeLessThan(heightAt(front, 40));
      // On Today the peak and its flag stay left of the countdown.
      if (today) expect(px + 16).toBeLessThan(width - 110);
      // Snow hugs the summit.
      expect(scene.snow.length).toBeGreaterThan(4);
      for (const [x, y] of scene.snow) {
        expect(Math.abs(x - px)).toBeLessThan(42);
        expect(y).toBeLessThan(py + 30);
      }
      // The trail ends on the summit and starts low on the left.
      const end = scene.trail[scene.trail.length - 1];
      expect(Math.hypot(end[0] - px, end[1] - py)).toBeLessThan(2);
      expect(scene.trail[0][0]).toBeLessThan(width * 0.1);
      expect(scene.trail[0][1]).toBeGreaterThan(py + 20);
    });
  }

  it('is the same on every draw', () => {
    expect(summitScene(412, 246, true)).toEqual(summitScene(412, 246, true));
  });
});

describe('the trail through time', () => {
  it('runs from the goal’s start to its deadline', () => {
    expect(trailFraction('2026-06-18', '2026-12-31', '2026-06-18')).toBe(0);
    expect(trailFraction('2026-06-18', '2026-12-31', '2026-11-20')).toBeCloseTo(155 / 196, 5);
    expect(trailFraction('2026-06-18', '2026-12-31', '2026-12-31')).toBe(1);
  });

  it('stays on the trail before the start, after the deadline, and for odd dates', () => {
    expect(trailFraction('2026-06-18', '2026-12-31', '2026-01-01')).toBe(0);
    expect(trailFraction('2026-06-18', '2026-12-31', '2027-02-01')).toBe(1);
    expect(trailFraction('2026-12-31', '2026-12-31', '2026-12-31')).toBe(1);
    expect(trailFraction('2027-01-10', '2026-12-31', '2026-12-01')).toBe(1);
    expect(trailFraction(null, '2026-12-31', '2026-12-01')).toBe(0);
  });

  it('starts from the start date, or else the day the goal was made', () => {
    expect(goalStart({ startDate: '2026-07-01', createdAt: new Date(2026, 5, 18, 10).getTime() })).toBe('2026-07-01');
    expect(goalStart({ createdAt: new Date(2026, 5, 18, 23, 30).getTime() })).toBe('2026-06-18');
    expect(goalStart({ startDate: 'soon' })).toBeNull();
    expect(goalStart({})).toBeNull();
    // A missing or broken creation time (1970) is not a start: the trail would look all walked.
    expect(goalStart({ createdAt: 1 })).toBeNull();
    expect(goalStart({ startDate: '1970-01-01' })).toBeNull();
  });

  it('walks the trail by its length', () => {
    const trail: [number, number][] = [[0, 0], [10, 0], [10, 10]];
    expect(walkTrail(trail, 0).at).toEqual([0, 0]);
    expect(walkTrail(trail, 0.25).at).toEqual([5, 0]);
    expect(walkTrail(trail, 0.75).at).toEqual([10, 5]);
    expect(walkTrail(trail, 1).at).toEqual([10, 10]);
    expect(walkTrail(trail, 0.75).walked).toEqual([[0, 0], [10, 0], [10, 5]]);
  });
});
