import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { registerOverlayCloser } from '../lib/overlayNavigation';

type Align = 'center' | 'bottom' | 'full';
const layers: HTMLDivElement[] = [];
let unlockedOverflow = '';

interface OverlayProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  align?: Align;
  scrim?: boolean;
}

function overlayHost(): HTMLElement {
  return document.getElementById('overlay-root') ?? document.body;
}

export default function Overlay({
  open,
  onClose,
  children,
  align = 'center',
  scrim = true,
}: OverlayProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) return;
    const layer = layerRef.current;
    if (!layer) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!layers.length) unlockedOverflow = document.body.style.overflow;
    layers.push(layer);
    const unregisterClose = registerOverlayCloser(() => closeRef.current?.());
    layer.style.zIndex = String(1000 + layers.length);
    document.body.style.overflow = 'hidden';
    if (!layer.contains(document.activeElement)) layer.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (layers[layers.length - 1] !== layer) return;
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopImmediatePropagation(); closeRef.current?.();
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(layer.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], summary, [tabindex="0"]'))
          .filter((element) => element.getClientRects().length && !element.closest('[hidden], [inert]'));
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first) { e.preventDefault(); layer.focus(); }
        else if (e.shiftKey && (document.activeElement === first || document.activeElement === layer)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || document.activeElement === layer)) { e.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      const wasTop = layers[layers.length - 1] === layer;
      unregisterClose();
      const index = layers.indexOf(layer);
      if (index >= 0) layers.splice(index, 1);
      if (!layers.length) document.body.style.overflow = unlockedOverflow;
      window.removeEventListener('keydown', onKey);
      if (wasTop && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  // Chromium often skips backdrop-filter on the first portal paint until a later
  // compositor update (e.g. a button re-render). Re-apply the filter on the next frame.
  useLayoutEffect(() => {
    if (!open || !scrim) return;
    const el = layerRef.current;
    if (!el) return;
    el.style.setProperty('backdrop-filter', 'none');
    el.style.setProperty('-webkit-backdrop-filter', 'none');
    const id = requestAnimationFrame(() => {
      el.style.removeProperty('backdrop-filter');
      el.style.removeProperty('-webkit-backdrop-filter');
    });
    return () => cancelAnimationFrame(id);
  }, [open, scrim]);

  if (!open) return null;

  const rootClass = [
    'overlay-layer',
    align === 'bottom' ? 'overlay-layer-bottom' : align === 'full' ? 'overlay-layer-full' : 'overlay-layer-center',
    scrim ? 'overlay-layer-scrim' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return createPortal(
    <div
      ref={layerRef}
      className={rootClass}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      onClick={scrim ? onClose : undefined}
    >
      <div className="overlay-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    overlayHost(),
  );
}
