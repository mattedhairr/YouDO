import { describe, expect, it } from 'vitest';
import { followOffset, isSidewaysStart, swipeCommits, swipeProgress, swipeTarget } from './tabSwipe';

describe('where a swipe leads', () => {
  it('moves between tabs in order on a main screen, without wrapping around', () => {
    // Finger moving left (dx < 0) goes to the next tab; right, to the previous one.
    expect(swipeTarget('tabs', -80, 0, 4)).toEqual({ kind: 'tab', index: 1 });
    expect(swipeTarget('tabs', 80, 2, 4)).toEqual({ kind: 'tab', index: 1 });
    expect(swipeTarget('tabs', 80, 0, 4)).toBeNull(); // Today: nothing before it
    expect(swipeTarget('tabs', -80, 3, 4)).toBeNull(); // Hub: nothing after it
  });

  it('inside something, goes back with a swipe right and never changes tabs', () => {
    expect(swipeTarget('back', 80, 1, 4)).toEqual({ kind: 'back' });
    expect(swipeTarget('back', -80, 1, 4)).toBeNull();
  });

  it('goes nowhere without movement', () => {
    expect(swipeTarget('tabs', 0, 1, 4)).toBeNull();
  });
});

describe('when a swipe goes through', () => {
  it('needs a third of the screen, or a quick flick', () => {
    expect(swipeCommits(140, 400, 0.1)).toBe(true);
    expect(swipeCommits(-140, 400, 0.1)).toBe(true);
    expect(swipeCommits(100, 400, 0.1)).toBe(false); // too short and slow: springs back
    expect(swipeCommits(70, 400, 0.8)).toBe(true); // a flick
    expect(swipeCommits(30, 400, 2)).toBe(false); // a twitch is not a flick
  });
});

describe('telling a swipe from a scroll or a drag', () => {
  it('waits for a clear direction', () => {
    expect(isSidewaysStart(4, 3, 50)).toBeNull();
    expect(isSidewaysStart(20, 4, 60)).toBe(true);
    expect(isSidewaysStart(12, 11, 60)).toBe(false); // diagonal: the page scrolls
    expect(isSidewaysStart(4, 20, 60)).toBe(false);
  });

  it('ignores movement after a long press (a row being dragged)', () => {
    expect(isSidewaysStart(30, 0, 500)).toBe(false);
  });
});

describe('how the page follows the finger', () => {
  it('follows with weight where there is somewhere to go, and only stretches a little where there is not', () => {
    expect(followOffset(100, true)).toBeCloseTo(55);
    expect(followOffset(-100, true)).toBeCloseTo(-55);
    expect(followOffset(400, false)).toBe(28);
    expect(followOffset(-400, false)).toBe(-28);
  });

  it('reports progress up to the point of going through', () => {
    expect(swipeProgress(0, 300)).toBe(0);
    expect(swipeProgress(50, 300)).toBeCloseTo(0.5);
    expect(swipeProgress(-500, 300)).toBe(1);
  });
});
