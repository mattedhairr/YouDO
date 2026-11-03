/**
 * Device Back inside a screen that has its own inner page or panel: the screen
 * steps back itself before App closes it or changes tab. One slot per screen,
 * because App asks each screen only while that screen is the one showing.
 */
type Slot = 'admin' | 'hub' | 'ambient';
const steps = new Map<Slot, () => void>();

/** While set, Back runs this instead of leaving the screen; null when there is nothing to step back from. */
export function setBackStep(slot: Slot, step: (() => void) | null): void {
  if (step) steps.set(slot, step);
  else steps.delete(slot);
}

/** True when the screen handled Back itself (and must stay open). */
export function runBackStep(slot: Slot): boolean {
  const step = steps.get(slot);
  if (!step) return false;
  step();
  return true;
}

/** Sent to Blueprint Studio by Back, Escape and its own arrow: it decides whether closing is safe. */
export const BLUEPRINT_BACK_EVENT = 'youdo:blueprint-back-request';
