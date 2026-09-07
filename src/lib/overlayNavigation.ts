// Shared with Android Back routing. A blocking dialog consumes Back even when
// it has no dismiss action (for example a required recovery decision).
const closers: { key: object; close: () => void }[] = [];

export function registerOverlayCloser(close: () => void): () => void {
  const entry = { key: {}, close };
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
