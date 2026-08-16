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

/** Light tick, e.g. checking off a single step */
export async function hapticTick() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch (e) {
    // Ignore on unsupported platforms (e.g. web browser without vibration API)
  }
}

/** Medium tap, e.g. starting or pausing a timer */
export async function hapticTap() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch (e) {}
}

/** Heavy buzz, e.g. finishing a task or goal */
export async function hapticSuccess() {
  if (!isHapticsEnabled()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
    // Add a tiny delay and a light tick for a "ta-da" feel
    setTimeout(() => {
      Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    }, 150);
  } catch (e) {}
}

/** Warning/Error buzz, e.g. deleting something */
export async function hapticWarn() {
  if (!isHapticsEnabled()) return;
  try {
    // Simulate a double-buzz for warning
    await Haptics.impact({ style: ImpactStyle.Medium });
    setTimeout(() => {
      Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    }, 100);
  } catch (e) {}
}
