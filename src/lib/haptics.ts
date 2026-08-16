import { Haptics, ImpactStyle } from '@capacitor/haptics';

// Read setting from local storage directly for safe synchronous access
function isHapticsEnabled(): boolean {
  try {
    const val = localStorage.getItem('youdo_haptics_enabled');
    // Default to true if not set
    if (val === null) return true;
    return JSON.parse(val) === true;
  } catch {
    return true;
  }
}

/** 
 * Light tick
 * Logical Reasoning: A minimal, frictionless confirmation for micro-interactions 
 * like checking off a small step. It feels like snapping a tiny switch.
 */
export async function hapticTick() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {}
}

/** 
 * Medium tap
 * Logical Reasoning: A standard structural confirmation. Used for opening/closing sheets 
 * or making solid UI selections. It gives a feeling of physical depth to the screen.
 */
export async function hapticTap() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (e) {}
}

/** 
 * Start Session (Engine Rev / Heartbeat)
 * Logical Reasoning: Starting a focus session should feel like starting an engine 
 * or a heartbeat to build momentum. A crescendo from Light to Heavy prepares the mind.
 */
export async function hapticSessionStart() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {}), 80);
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 180);
  } catch (e) {}
}

/** 
 * Pause Session (Brake)
 * Logical Reasoning: Pausing a session should feel like tapping the brakes. 
 * A crisp, singular Heavy impact to sharply halt the momentum.
 */
export async function hapticSessionPause() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch (e) {}
}

/** 
 * Task Complete (Reward / Ta-da)
 * Logical Reasoning: Completing a task should feel rewarding. 
 * A Heavy impact followed by a delayed Light impact mimics a "Ta-da!" rhythm.
 */
export async function hapticSuccess() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    setTimeout(() => {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }, 150);
  } catch (e) {}
}

/** 
 * Goal Complete (Grand Finale)
 * Logical Reasoning: Finishing an entire goal is a huge milestone. 
 * A rapid sequence of impacts creates a celebratory flutter or crescendo.
 */
export async function hapticGoalComplete() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 100);
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {}), 220);
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 400);
  } catch (e) {}
}

/** 
 * Warning / Delete (Stutter)
 * Logical Reasoning: Deleting something should feel jarring to ensure the user 
 * is aware of the destructive action. Two quick Medium impacts create a "stutter" feel.
 */
export async function hapticWarn() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
    setTimeout(() => {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }, 100);
  } catch (e) {}
}

/** 
 * Ambient Mode Open (Zen ripples)
 * Logical Reasoning: Ambient mode is for zen focus. We want smooth, gentle ripples.
 * Three spaced-out Light impacts feel like ripples in a pond.
 */
export async function hapticAmbient() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 200);
    setTimeout(() => Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}), 450);
  } catch (e) {}
}
