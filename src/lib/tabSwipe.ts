/**
 * Sideways swipes in the main app (App.tsx loads this after the first
 * screen). One rule everywhere:
 * - Inside something (a branch in Goals), a swipe right goes back one step;
 *   a swipe left does nothing. It never changes tabs.
 * - On a tab's main screen, a swipe moves to the next or previous tab, in the
 *   bottom bar's order, without wrapping around.
 * The page follows the finger and the destination's name peeks in from the
 * side; releasing past a third of the screen (or with a quick flick) goes
 * there, anything less springs back. Swipes never start inside an overlay
 * (rooms, chats, sheets), on anything that moves sideways itself, near the
 * screen's edges (the system's back gesture), or after a long press (a
 * row being dragged).
 */

import { hapticTick } from './haptics';

export type SwipeMode = 'tabs' | 'back';
export type SwipeTarget = { kind: 'tab'; index: number } | { kind: 'back' } | null;

/** Where a swipe of `dx` (positive: finger moving right) leads. */
export function swipeTarget(mode: SwipeMode, dx: number, index: number, count: number): SwipeTarget {
  if (dx === 0) return null;
  if (mode === 'back') return dx > 0 ? { kind: 'back' } : null;
  const next = dx < 0 ? index + 1 : index - 1;
  return next >= 0 && next < count ? { kind: 'tab', index: next } : null;
}

/** Released here, does the swipe go through? A third of the screen, or a quick flick. */
export function swipeCommits(dx: number, width: number, velocity: number): boolean {
  const distance = Math.abs(dx);
  return distance >= width / 3 || (distance >= 48 && Math.abs(velocity) >= 0.45);
}

/** Is this the start of a sideways swipe, rather than a scroll or a long press? */
export function isSidewaysStart(dx: number, dy: number, elapsedMs: number): boolean | null {
  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return null; // not decided yet
  if (elapsedMs > 350) return false; // after a long press: a drag of something else
  return Math.abs(dx) > Math.abs(dy) * 1.3;
}

/** How far the page moves under the finger: weighted, and a short stretch where there is nowhere to go. */
export function followOffset(dx: number, hasTarget: boolean): number {
  if (!hasTarget) return Math.sign(dx) * Math.min(28, Math.abs(dx) * 0.15);
  return dx * 0.55;
}

/** 0–1: how close the swipe is to going through. */
export function swipeProgress(dx: number, width: number): number {
  return Math.min(1, Math.abs(dx) / (width / 3));
}

export interface TabSwipeOptions {
  /** False while App's own sheets or screens are open. */
  enabled: () => boolean;
  mode: () => SwipeMode;
  index: () => number;
  labels: string[];
  onTab: (index: number) => void;
  onBack: () => void;
}

const EDGE = 22;
const IGNORE = 'input, textarea, select, [contenteditable="true"], .no-swipe, .glass-nav, .dragging-card, .overlay-layer, [data-no-swipe]';

function scrollsSideways(el: Element | null, stop: Element): boolean {
  for (let node = el; node && node !== stop; node = node.parentElement) {
    if (node instanceof HTMLElement && node.scrollWidth > node.clientWidth + 2) {
      const { overflowX } = getComputedStyle(node);
      if (overflowX === 'auto' || overflowX === 'scroll') return true;
    }
  }
  return false;
}

/** Attaches the swipe to `frame` (the app's page) and returns a function that removes it. */
export function attachTabSwipe(frame: HTMLElement, options: TabSwipeOptions): () => void {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let start: { x: number; y: number; t: number } | null = null;
  let sideways: boolean | null = null;
  let last = { x: 0, t: 0, v: 0 };
  let dx = 0;
  let target: SwipeTarget = null;
  let crossed = false;
  let page: HTMLElement | null = null;
  let peek: HTMLDivElement | null = null;

  const showPeek = (progress: number, toRight: boolean) => {
    if (!target) {
      peek?.remove();
      peek = null;
      return;
    }
    if (!peek) {
      peek = document.createElement('div');
      peek.setAttribute('aria-hidden', 'true');
      Object.assign(peek.style, {
        position: 'fixed',
        top: '46%',
        zIndex: '60',
        padding: '8px 14px',
        borderRadius: '999px',
        background: 'color-mix(in srgb, var(--bg-surface) 88%, transparent)',
        boxShadow: '0 6px 22px rgba(0,0,0,.28), inset 0 0 0 1px color-mix(in srgb, var(--primary) 30%, transparent)',
        backdropFilter: 'blur(12px)',
        color: 'var(--text-primary)',
        font: '600 13px var(--font-sans)',
        pointerEvents: 'none',
        transition: 'transform .18s cubic-bezier(.2,.8,.2,1)',
      });
      document.body.appendChild(peek);
    }
    // The name enters from the side the page is heading to.
    const label = target.kind === 'back' ? 'Back' : options.labels[target.index];
    peek.textContent = toRight ? `‹  ${label}` : `${label}  ›`;
    peek.style.left = toRight ? '14px' : '';
    peek.style.right = toRight ? '' : '14px';
    peek.style.opacity = String(Math.min(1, progress * 1.6));
    const shift = (1 - progress) * 18 * (toRight ? -1 : 1);
    peek.style.transform = `translateX(${shift}px) scale(${progress >= 1 ? 1.06 : 1})`;
    peek.style.color = progress >= 1 ? 'var(--primary)' : 'var(--text-primary)';
  };

  const settle = (commit: boolean) => {
    const el = page;
    const pill = peek;
    page = null;
    peek = null;
    const destination = target;
    target = null;
    if (pill) {
      pill.style.transition = 'opacity .18s ease';
      pill.style.opacity = '0';
      window.setTimeout(() => pill.remove(), 200);
    }
    if (!el) {
      if (commit && destination) go(destination);
      return;
    }
    if (commit && destination) {
      // Slide on out the way the finger went, then the new screen slides in.
      el.style.transition = 'transform .14s ease-in, opacity .14s ease-in';
      el.style.transform = `translate3d(${Math.sign(dx) * window.innerWidth * 0.32}px,0,0)`;
      el.style.opacity = '0';
      window.setTimeout(() => {
        go(destination);
        el.style.transition = 'none';
        el.style.transform = '';
        el.style.opacity = '';
        el.style.willChange = '';
      }, 140);
    } else {
      el.style.transition = 'transform .32s cubic-bezier(.2,.9,.25,1.15), opacity .32s ease';
      el.style.transform = '';
      el.style.opacity = '';
      window.setTimeout(() => {
        el.style.transition = '';
        el.style.willChange = '';
      }, 340);
    }
  };

  const go = (destination: NonNullable<SwipeTarget>) => {
    if (destination.kind === 'back') options.onBack();
    else options.onTab(destination.index);
  };

  const onStart = (e: TouchEvent) => {
    start = null;
    if (e.touches.length !== 1 || !options.enabled()) return;
    if (document.querySelector('.overlay-layer')) return;
    const touch = e.touches[0];
    if (touch.clientX < EDGE || touch.clientX > window.innerWidth - EDGE) return;
    const el = e.target as Element | null;
    if (!el || el.closest(IGNORE) || el.closest('input[type="range"]')) return;
    if (scrollsSideways(el, frame)) return;
    start = { x: touch.clientX, y: touch.clientY, t: performance.now() };
    sideways = null;
    dx = 0;
    crossed = false;
    last = { x: touch.clientX, t: start.t, v: 0 };
  };

  const onMove = (e: TouchEvent) => {
    if (!start) return;
    const touch = e.touches[0];
    const now = performance.now();
    dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (sideways === null) {
      sideways = isSidewaysStart(dx, dy, now - start.t);
      if (sideways === false) {
        start = null;
        return;
      }
      if (sideways === null) return;
      page = frame.querySelector('main');
      if (page && !reduceMotion) {
        page.style.transition = 'none';
        page.style.willChange = 'transform, opacity';
      }
    }
    // A sideways swipe: the page follows the finger. The listener is passive
    // (it never holds up scrolling); the browser locks a sideways drag to the
    // horizontal on its own, so the list stays put.
    const dt = Math.max(1, now - last.t);
    last = { x: touch.clientX, t: now, v: (touch.clientX - last.x) / dt };
    target = swipeTarget(options.mode(), dx, options.index(), options.labels.length);
    const width = window.innerWidth;
    const progress = swipeProgress(dx, width);
    if (page && !reduceMotion) {
      const x = followOffset(dx, Boolean(target));
      page.style.transform = `translate3d(${x}px,0,0)`;
      page.style.opacity = target ? String(1 - progress * 0.22) : '';
    }
    showPeek(progress, dx > 0);
    if (target && progress >= 1 && !crossed) {
      crossed = true;
      hapticTick();
    } else if (progress < 1) {
      crossed = false;
    }
  };

  const onEnd = () => {
    if (!start) return;
    start = null;
    if (!sideways) return;
    sideways = null;
    settle(Boolean(target) && swipeCommits(dx, window.innerWidth, last.v));
  };

  const onCancel = () => {
    if (!start) return;
    start = null;
    sideways = null;
    settle(false);
  };

  frame.addEventListener('touchstart', onStart, { passive: true });
  // Passive: a blocking touchmove on the whole app makes every scroll wait
  // for JavaScript, which stutters whenever the app is busy drawing.
  frame.addEventListener('touchmove', onMove, { passive: true });
  frame.addEventListener('touchend', onEnd, { passive: true });
  frame.addEventListener('touchcancel', onCancel, { passive: true });
  return () => {
    frame.removeEventListener('touchstart', onStart);
    frame.removeEventListener('touchmove', onMove);
    frame.removeEventListener('touchend', onEnd);
    frame.removeEventListener('touchcancel', onCancel);
    peek?.remove();
  };
}
