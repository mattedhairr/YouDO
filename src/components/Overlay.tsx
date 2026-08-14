import { useEffect, type ReactNode } from 'react';
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

  if (!open) return null;

  const stack = overlayHost().querySelectorAll('.overlay-layer').length;
  const zScrim = 1000 + stack * 2;
  const zLayer = 1001 + stack * 2;

  const rootClass =
    align === 'bottom'
      ? 'overlay-layer overlay-layer-bottom'
      : align === 'full'
        ? 'overlay-layer overlay-layer-full'
        : 'overlay-layer overlay-layer-center';

  return createPortal(
    <>
      {scrim && (
        <div
          className="overlay-scrim"
          style={{ zIndex: zScrim }}
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <div className={rootClass} role="dialog" aria-modal="true" style={{ zIndex: zLayer }}>
        <div className="overlay-content">{children}</div>
      </div>
    </>,
    overlayHost(),
  );
}
