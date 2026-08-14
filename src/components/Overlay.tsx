import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Align = 'center' | 'bottom' | 'full';

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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

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

  const stack = overlayHost().querySelectorAll('.overlay-layer').length;
  const zLayer = 1000 + stack;

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
      style={{ zIndex: zLayer }}
      onClick={scrim ? onClose : undefined}
    >
      <div className="overlay-content" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>,
    overlayHost(),
  );
}
