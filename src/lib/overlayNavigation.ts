// Shared with Android Back routing. A blocking dialog consumes Back even when
// it has no dismiss action (for example a required recovery decision).
const closers: { key: object; close: () => void; screen: boolean }[] = [];

/** screen: the layer of a full screen App routes Back to itself (Settings, Admin Hub, Studio). */
export function registerOverlayCloser(close: () => void, screen = false): () => void {
  const entry = { key: {}, close, screen };
  closers.push(entry);
  return () => {
    const index = closers.indexOf(entry);
    if (index >= 0) closers.splice(index, 1);
  };
}

export function closeTopOverlay(): boolean {
  const top = closers[closers.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

/** A popup is open on top of such a screen, so Back belongs to the popup. */
export function popupIsOnTop(): boolean {
  const top = closers[closers.length - 1];
  return Boolean(top && !top.screen);
}
