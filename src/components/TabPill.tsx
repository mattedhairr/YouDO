import { useEffect, useLayoutEffect, useRef } from 'react';
import { motionAllowed } from '../hooks/useUiPrefs';
import { StretchModel, springStep, stepLift } from '../lib/liquidMotion';
import { useLiquidLens } from '../lib/liquidLens';

/** How far the glass bends what is under it, in px, and its white wash. */
const GLASS_BEND = 14;
const GLASS_TINT = '7%';

/*
 * The pill's motion — the travel spring, the held lift, the glass hand-off
 * and the drag, with their constants — follows
 * liquid_glass_easy's LiquidGlassAnimatedNavBar and LiquidGlassLensMotion
 * (pub.dev/packages/liquid_glass_easy 4.3.4, Copyright (c) 2025 Ahmed Gamil,
 * MIT License), by way of the same port in BitChord's tab bar. The stretch
 * is YouDO's own (see StretchModel).
 */

/**
 * The tab bar's travelling selection pill, the way iOS 26 moves it.
 *
 * A tap, holding a press down, or sliding along the bar all lift the pill
 * into the bubble: it inflates past the bar on two
 * under-damped springs, one per axis, so it overshoots its raised size and
 * rebounds — and it stays up for the whole journey. The travel is its own
 * spring. Only once the pill has landed ([HANDOVER_START] of the way there)
 * is the lift released, so it deflates where it stands, dipping a little
 * under its resting size and coming back. A drag is the same lift held open
 * by a finger: the pill's centre chases the finger, and on release it lands
 * on the tab nearest its centre. While it is held the bar itself swells and
 * leans after it.
 *
 * Along the way the pill's drawn position is sampled every frame
 * ([StretchModel]): it stretches wide and flat with its speed, one smooth
 * swell per trip, whichever way it is going and under a finger alike.
 *
 * The glass is a third, much faster spring, so the pill reads as glass almost
 * as soon as it is touched, and sheds it from the landing while the size is
 * still settling — the rim first, the refraction after.
 *
 * The accent colour rides with the pill rather than jumping to the chosen
 * tab: each tab takes the accent in proportion to how much of the pill is
 * over it, through the `--pill-mix` it is given every frame.
 *
 * Render it as the first child of the tab row: the pill finds the row through
 * its own parent, which — unlike a ref handed down from the row — is already
 * there when the pill's layout effects run.
 */

// Softer than BitChord's 280 / 31.4, which read as too quick here; the same
// 0.94 damping ratio, so it lands just as firmly.
const TRAVEL_STIFFNESS = 180;
const TRAVEL_DAMPING = 2 * 0.94 * Math.sqrt(TRAVEL_STIFFNESS);
/** Damping 0.6 across, 0.7 down, so the width overshoots a shade further. */
const LIFT_STIFFNESS = 250;
const LIFT_DAMPING_X = 19;
const LIFT_DAMPING_Y = 22.1;
/** Critically damped and four times as stiff: the glass is on long before the size settles. */
const MATERIAL_STIFFNESS = 1000;
const MATERIAL_DAMPING = 63.3;
const HANDOVER_START = 0.92;
const HANDOVER_TAU = 0.09;
const GLASS_RETURN_TAU = 0.05;
/**
 * Under a finger the pill's centre is pulled toward it by a spring, so its
 * speed builds and eases continuously instead of jumping with each move of
 * the finger, and it never outruns DRAG_MAX_SPEED pill widths per second.
 */
const DRAG_STIFFNESS = 260;
const DRAG_DAMPING = 2 * 0.9 * Math.sqrt(DRAG_STIFFNESS);
const DRAG_MAX_SPEED = 10;
/** How much taller than the whole bar the lifted pill stands, in px. */
const PILL_GROW_HEIGHT = 9;
/** How far a released pill's momentum carries before it picks a tab: scroll-like deceleration. */
const FLING_DECELERATION = 0.98;
/** How long a press is held before the bubble comes up, in ms. */
const HOLD_DELAY = 220;
/** Sideways travel before a press becomes a drag of the pill. */
const DRAG_SLOP = 8;
/** The bar while the pill is dragged: how far it leans after it, and how much it swells. */
const BAR_LEAN = 4;
const BAR_SWELL = 0.012;
const BAR_STIFFNESS = 400;
const BAR_DAMPING = 2 * 0.6 * Math.sqrt(BAR_STIFFNESS);
/** Lens: depth of the refracting rim in px (the amount is the Refraction slider). */
const LENS_HEIGHT = 12;

interface Geometry {
  centers: number[];
  step: number;
  width: number;
  height: number;
  top: number;
  /** Lifted size over rest size; the same on both axes, so the cell keeps its proportions. */
  grow: number;
}

function measure(row: HTMLElement): Geometry | null {
  const items = Array.from(row.querySelectorAll<HTMLElement>(':scope > .tab-bar-item'));
  if (items.length === 0 || items[0].offsetHeight === 0) return null;
  const centers = items.map((el) => el.offsetLeft + el.offsetWidth / 2);
  const width = items[0].offsetWidth;
  const height = items[0].offsetHeight;
  // Lifted, the pill stands PILL_GROW_HEIGHT taller than the whole bar.
  const bar = row.parentElement;
  const barStyle = bar ? getComputedStyle(bar) : null;
  const padding = barStyle ? parseFloat(barStyle.paddingTop) + parseFloat(barStyle.paddingBottom) : 0;
  const liftedHeight = row.offsetHeight + (Number.isFinite(padding) ? padding : 0) + PILL_GROW_HEIGHT;
  return {
    centers,
    step: centers.length > 1 ? centers[1] - centers[0] : width,
    width,
    height,
    top: items[0].offsetTop,
    grow: liftedHeight / height,
  };
}

/** Where a pill let go at `velocity` px/s would come to rest, the way scroll deceleration projects it. */
const project = (velocity: number) => ((velocity / 1000) * FLING_DECELERATION) / (1 - FLING_DECELERATION);

/** The rim and its shadow are gone by the time the hand-off is 55% through. */
const rimOf = (presence: number) => Math.max(0, Math.min(1, (presence - 0.45) / 0.55));

interface Props {
  activeIndex: number;
  onSelect: (index: number) => void;
}

export default function TabPill({ activeIndex, onSelect }: Props) {
  const pillRef = useRef<HTMLSpanElement>(null);
  const lensRef = useRef<HTMLSpanElement>(null);
  const lens = useLiquidLens();

  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const engine = useRef({
    geo: null as Geometry | null,
    index: -1,
    // Travel, in px from the row's left edge.
    travelPos: 0,
    travelVel: 0,
    travelTarget: 0,
    travelFrom: 0,
    travelActive: false,
    lifted: false,
    liftX: 0,
    liftXVel: 0,
    liftY: 0,
    liftYVel: 0,
    material: 0,
    materialVel: 0,
    dragging: false,
    dragTarget: 0,
    dragFollow: 0,
    /** The pill's own speed under the finger, px/s, handed to the travel on release. */
    dragVel: 0,
    handover: 1,
    squash: 0,
    model: new StretchModel(),
    barLean: 0,
    barLeanVel: 0,
    barLeanTarget: 0,
    barSwell: 0,
    barSwellVel: 0,
    frame: 0,
    last: 0,
  });

  const position = () => {
    const e = engine.current;
    return e.dragging ? e.dragFollow : e.travelPos;
  };

  const draw = () => {
    const e = engine.current;
    const geo = e.geo;
    const pill = pillRef.current;
    const glass = lensRef.current;
    if (!geo || !pill || !glass) return;
    const visible = e.index >= 0 || e.dragging;
    const x = position();
    const sx = (1 + (geo.grow - 1) * e.liftX) * (1 + e.squash);
    const sy = (1 + (geo.grow - 1) * e.liftY) * (1 - e.squash);
    const transform = `translate3d(${(x - geo.width / 2).toFixed(2)}px, ${geo.top}px, 0) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
    const material = Math.max(0, Math.min(1, e.material));
    const presence = Math.max(0, Math.min(1, 1 - e.handover));

    // Flat: a fill under the tabs that fades out as the material comes on.
    pill.style.transform = transform;
    pill.style.opacity = visible ? String(1 - material) : '0';
    // Glass: refraction by the material, held while the pill is up and eased
    // out from the landing, with a rim that goes first.
    glass.style.transform = transform;
    glass.style.opacity = visible ? presence.toFixed(3) : '0';
    glass.style.visibility = visible && presence > 0.002 ? 'visible' : 'hidden';
    glass.style.setProperty('--rim', (material * rimOf(presence)).toFixed(3));
    lens.setBend(GLASS_BEND * material);

    // The accent follows the pill: full on the tab under it, fading to
    // nothing a tab's width away.
    const items = pill.parentElement?.querySelectorAll<HTMLElement>(':scope > .tab-bar-item');
    items?.forEach((item, i) => {
      const c = geo.centers[i];
      const mix = visible && c !== undefined ? Math.max(0, 1 - Math.abs(x - c) / geo.width) : 0;
      item.style.setProperty('--pill-mix', mix.toFixed(3));
    });

    // The bar leans after a dragged pill and swells while it is held.
    const bar = pill.parentElement?.parentElement;
    if (bar) {
      if (e.barLean === 0 && e.barSwell === 0) {
        bar.style.removeProperty('translate');
        bar.style.removeProperty('scale');
      } else {
        bar.style.translate = `${e.barLean.toFixed(2)}px 0`;
        bar.style.scale = (1 + BAR_SWELL * e.barSwell).toFixed(4);
      }
    }
  };

  const travelProgress = () => {
    const e = engine.current;
    const span = Math.abs(e.travelTarget - e.travelFrom);
    if (span < 1e-6) return 1;
    return Math.max(0, Math.min(1, 1 - Math.abs(e.travelTarget - e.travelPos) / span));
  };

  /** One frame of everything. False once all of it has settled. */
  const step = (dt: number): boolean => {
    const e = engine.current;
    const unit = e.geo?.step || 1;

    // 1) Travel.
    let travelSettled = true;
    if (e.travelActive) {
      [e.travelPos, e.travelVel] = springStep(e.travelPos, e.travelVel, e.travelTarget, dt, TRAVEL_STIFFNESS, TRAVEL_DAMPING);
      travelSettled = Math.abs(e.travelPos - e.travelTarget) < 0.003 * unit && Math.abs(e.travelVel) < 0.05 * unit;
      if (travelSettled) {
        e.travelPos = e.travelTarget;
        e.travelVel = 0;
      }
    }

    // 2) Under a finger, the centre is sprung toward it, its speed capped in
    //    pill widths: how far it moves is the pill's, not the finger's.
    if (e.dragging) {
      [e.dragFollow, e.dragVel] = springStep(e.dragFollow, e.dragVel, e.dragTarget, dt, DRAG_STIFFNESS, DRAG_DAMPING);
      const cap = DRAG_MAX_SPEED * (e.geo?.width ?? 80);
      e.dragVel = Math.max(-cap, Math.min(cap, e.dragVel));
    }

    // 3) The lift, held for the journey and released on landing.
    if (!e.dragging && (travelSettled || travelProgress() >= HANDOVER_START)) e.lifted = false;
    const liftTarget = e.lifted ? 1 : 0;
    [e.liftX, e.liftXVel] = stepLift(e.liftX, e.liftXVel, liftTarget, dt, LIFT_STIFFNESS, LIFT_DAMPING_X);
    [e.liftY, e.liftYVel] = stepLift(e.liftY, e.liftYVel, liftTarget, dt, LIFT_STIFFNESS, LIFT_DAMPING_Y);
    [e.material, e.materialVel] = stepLift(e.material, e.materialVel, liftTarget, dt, MATERIAL_STIFFNESS, MATERIAL_DAMPING);
    const liftSettled = !e.lifted && e.liftX === 0 && e.liftY === 0 && e.material === 0;

    // 4) The deflation outlives the spring that carried the pill there.
    if (e.travelActive && travelSettled && liftSettled && !e.dragging) e.travelActive = false;

    // 5) Sample the pill where it is drawn this frame.
    // The stretch belongs to the bubble: a tapped selection slides flat.
    e.squash = e.model.track(position(), dt) * Math.max(0, Math.min(1, e.material));

    // 6) The hand-off rides the same landing as the deflation.
    const handoverTarget = e.lifted ? 0 : 1;
    const tau = handoverTarget > e.handover ? HANDOVER_TAU : GLASS_RETURN_TAU;
    e.handover += (handoverTarget - e.handover) * (1 - Math.exp(-dt / tau));
    if (Math.abs(handoverTarget - e.handover) < 0.002) e.handover = handoverTarget;

    // 7) The bar follows the drag: held against the finger's lean, sprung home after.
    if (e.dragging) {
      e.barLean = e.barLeanTarget;
      e.barLeanVel = 0;
    } else {
      [e.barLean, e.barLeanVel] = stepLift(e.barLean, e.barLeanVel, 0, dt, BAR_STIFFNESS, BAR_DAMPING);
      if (Math.abs(e.barLean) < 0.01 && Math.abs(e.barLeanVel) < 0.1) {
        e.barLean = 0;
        e.barLeanVel = 0;
      }
    }
    [e.barSwell, e.barSwellVel] = stepLift(e.barSwell, e.barSwellVel, e.dragging ? 1 : 0, dt, BAR_STIFFNESS, BAR_DAMPING);

    const settled =
      !e.travelActive &&
      !e.dragging &&
      liftSettled &&
      Math.abs(e.squash) < 0.0005 &&
      e.handover >= 1 &&
      e.barLean === 0 &&
      e.barSwell === 0;
    if (settled) {
      e.model.reset();
      e.squash = 0;
    }
    draw();
    return !settled;
  };

  const start = () => {
    const e = engine.current;
    if (e.frame) return;
    e.last = -1;
    const tick = (time: number) => {
      const now = time / 1000;
      const dt = e.last < 0 ? 0 : Math.min(0.05, now - e.last);
      e.last = now;
      e.frame = step(dt) ? requestAnimationFrame(tick) : 0;
    };
    e.frame = requestAnimationFrame(tick);
  };

  /** Place the pill on tab `index` at rest, with no travel and no lift. */
  const snapTo = (index: number) => {
    const e = engine.current;
    if (e.frame) cancelAnimationFrame(e.frame);
    const c = e.geo?.centers[index] ?? 0;
    Object.assign(e, {
      frame: 0,
      index,
      travelPos: c, travelTarget: c, travelFrom: c, travelVel: 0, travelActive: false,
      dragging: false, lifted: false,
      liftX: 0, liftXVel: 0, liftY: 0, liftYVel: 0, material: 0, materialVel: 0,
      handover: 1, squash: 0,
      barLean: 0, barLeanVel: 0, barSwell: 0, barSwellVel: 0,
    });
    e.model.reset();
    draw();
  };

  /**
   * A tab was tapped: the pill lifts into the glass bubble, travels there
   * from wherever it is, and comes down on landing, as it does after a slide.
   */
  const animateTo = (index: number) => {
    const e = engine.current;
    if (!e.geo) return;
    e.index = index;
    e.lifted = true;
    e.travelActive = true;
    // Re-aim from wherever the pill is; the spring keeps its velocity.
    e.travelFrom = e.travelPos;
    e.travelTarget = e.geo.centers[index];
    start();
  };

  const refreshLens = () => {
    const geo = engine.current.geo;
    if (geo) lens.setSize(geo.width, geo.height, LENS_HEIGHT);
  };

  // Geometry: measured on mount and whenever the row resizes. While idle the
  // pill is simply put back on its tab; mid-flight the travel re-aims.
  useLayoutEffect(() => {
    const row = pillRef.current?.parentElement;
    if (!row) return;
    const e = engine.current;
    const remeasure = () => {
      const geo = measure(row);
      if (!geo) return;
      e.geo = geo;
      refreshLens();
      for (const el of [pillRef.current, lensRef.current]) {
        if (!el) continue;
        el.style.width = `${geo.width}px`;
        el.style.height = `${geo.height}px`;
      }
      if (e.index >= 0) {
        if (!e.frame) snapTo(e.index);
        else if (!e.dragging) e.travelTarget = geo.centers[e.index];
      }
      draw();
    };
    remeasure();
    const observer = new ResizeObserver(remeasure);
    observer.observe(row);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new active tab: travel there, lifted, unless motion is reduced or the
  // pill had nowhere to come from.
  useLayoutEffect(() => {
    const e = engine.current;
    if (!e.geo) {
      const row = pillRef.current?.parentElement;
      e.geo = row ? measure(row) : null;
    }
    const previous = e.index;
    if (activeIndex === previous) return;
    if (activeIndex < 0 || !e.geo || e.dragging) {
      e.index = activeIndex;
      draw();
      return;
    }
    if (previous < 0 || !motionAllowed()) snapTo(activeIndex);
    else animateTo(activeIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Dragging the pill: its centre chases the finger along the row, held to
  // the first and last tabs however far the finger goes, so turning back
  // answers at once rather than first unwinding the distance past the edge.
  useEffect(() => {
    const row = pillRef.current?.parentElement;
    if (!row) return;
    const e = engine.current;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let anchor = 0;

    const suppressClick = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
    };
    /** The finger in the row's own px. */
    const rawX = (event: PointerEvent) => {
      const rect = row.getBoundingClientRect();
      return ((event.clientX - rect.left) / rect.width) * row.offsetWidth;
    };
    /**
     * Where the pill's centre should be for this finger: where it was picked
     * up plus how far the finger has moved on screen since, kept between the
     * first and last tab. Screen movement, not the finger's place in the row:
     * the row itself swells and leans under the finger while it is held, and
     * measuring against it fed that motion back into the pill.
     */
    const fingerX = (event: PointerEvent, geo: Geometry) =>
      Math.max(geo.centers[0], Math.min(geo.centers[geo.centers.length - 1], pickBase + (event.clientX - pickClientX)));
    /** The pill's centre at pick-up (or the finger, if it was on another tab), and the finger then. */
    let pickBase = 0;
    let pickClientX = 0;

    let holdTimer = 0;
    let lastEvent: PointerEvent | null = null;
    const clearHold = () => {
      if (holdTimer) window.clearTimeout(holdTimer);
      holdTimer = 0;
    };

    /** A finger has picked the pill up: it lifts into the bubble and follows. */
    const pickUp = (event: PointerEvent) => {
      if (!e.geo) return;
      clearHold();
      e.dragging = true;
      e.travelActive = false;
      e.lifted = true;
      e.dragFollow = e.travelPos;
      e.dragVel = e.travelVel;
      e.travelVel = 0;
      anchor = e.index;
      // Grabbed on the pill, it stays where it is and moves only as the finger
      // does; grabbed on another tab, it glides over to the finger.
      const finger = rawX(event);
      pickBase = Math.abs(finger - e.travelPos) <= e.geo.width / 2 ? e.travelPos : finger;
      pickClientX = event.clientX;
      e.dragTarget = fingerX(event, e.geo);
      // The bar starts upright: no lean left over from the last drag.
      e.barLeanTarget = 0;
      try {
        row.setPointerCapture(event.pointerId);
      } catch { /* The pointer already left. */ }
      start();
    };

    const down = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || !e.geo || e.index < 0) return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      lastEvent = event;
      clearHold();
      // Held down, the bubble comes up under the finger.
      if (motionAllowed()) {
        holdTimer = window.setTimeout(() => {
          holdTimer = 0;
          if (pointerId !== null && !e.dragging && lastEvent) pickUp(lastEvent);
        }, HOLD_DELAY);
      }
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId || !e.geo) return;
      lastEvent = event;
      const geo = e.geo;
      if (!e.dragging) {
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        if (Math.abs(dy) > DRAG_SLOP && Math.abs(dy) > Math.abs(dx)) {
          // A vertical swipe (the Hub tab's Public / Private): not ours.
          clearHold();
          pointerId = null;
          return;
        }
        // Sliding sideways picks it up at once, without waiting for the hold.
        if (Math.abs(dx) < DRAG_SLOP || !motionAllowed()) return;
        pickUp(event);
      }
      e.dragTarget = fingerX(event, geo);
      const pull = e.dragTarget - geo.centers[anchor];
      e.barLeanTarget = BAR_LEAN * Math.tanh(pull / (BAR_LEAN * 4));
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      clearHold();
      if (!e.dragging || !e.geo) return;
      if (row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
      window.addEventListener('click', suppressClick, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener('click', suppressClick, true), 400);

      // The pill's centre decides, carried forward by its momentum: a quick
      // flick lands where the pill was heading, not on a tab it had already
      // passed while it trailed the finger.
      const geo = e.geo;
      const from = e.dragFollow;
      const velocity = event.type === 'pointercancel' ? 0 : e.dragVel;
      const landing = from + project(velocity);
      let next = anchor;
      if (event.type !== 'pointercancel') {
        next = 0;
        geo.centers.forEach((c, i) => {
          if (Math.abs(c - landing) < Math.abs(geo.centers[next] - landing)) next = i;
        });
      }
      // It stays lifted through the snap and comes down on landing, exactly
      // as a tap's does.
      e.dragging = false;
      e.index = next;
      e.travelActive = true;
      e.travelPos = from;
      // Keep the pill's speed through the hand-off, so letting go is not a stop.
      e.travelVel = velocity;
      e.travelFrom = from;
      e.travelTarget = geo.centers[next];
      start();
      if (next !== anchor) onSelectRef.current(next);
    };

    row.addEventListener('pointerdown', down);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
    return () => {
      row.removeEventListener('pointerdown', down);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', up);
      window.removeEventListener('click', suppressClick, true);
      clearHold();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const pill = pillRef.current;
    const e = engine.current;
    return () => {
      if (e.frame) cancelAnimationFrame(e.frame);
      const bar = pill?.parentElement?.parentElement;
      bar?.style.removeProperty('translate');
      bar?.style.removeProperty('scale');
    };
  }, []);

  return (
    <>
      <span ref={pillRef} className="tab-pill" aria-hidden="true" />
      <span
        ref={lensRef}
        className="tab-pill-lens"
        aria-hidden="true"
        style={{
          backdropFilter: `url(#${lens.id}) saturate(1.5) brightness(1.06)`,
          WebkitBackdropFilter: 'blur(1px) saturate(1.5)',
          ['--glass-tint' as string]: GLASS_TINT,
        }}
      />
      {lens.filter}
    </>
  );
}
