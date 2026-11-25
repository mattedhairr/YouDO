import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';
import { baseScale, clampCrop, cropSource, MAX_ZOOM, renderPhoto, type CropState } from '../lib/profilePhoto';
import './photoCrop.css';

/**
 * Move and zoom: the chosen picture under a round frame. Drag to move, pinch
 * or slide to zoom; the frame always stays covered. "Use photo" hands back the
 * cropped, shrunk picture.
 */
export default function PhotoCropSheet({ file, onCancel, onUse }: {
  file: File;
  onCancel: () => void;
  onUse: (photo: Blob) => Promise<void>;
}) {
  // Made and freed in one effect, so a re-run never frees an address still in use.
  const [url, setUrl] = useState('');
  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [frame] = useState(() => Math.max(180, Math.min(300, window.innerWidth - 64)));
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);

  useEffect(() => {
    if (!url) return;
    let live = true;
    const next = new Image();
    next.onload = () => { if (live) { setImage(next); setError(''); } };
    next.onerror = () => { if (live) setError('This picture can’t be opened. Try another one.'); };
    next.src = url;
    return () => { live = false; };
  }, [url]);

  const width = image?.naturalWidth ?? 1;
  const height = image?.naturalHeight ?? 1;
  const fit = (state: CropState) => clampCrop(state, width, height, frame);
  const scale = baseScale(width, height, frame) * crop.zoom;

  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const onPointerDown = (event: React.PointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) pinch.current = { distance: spread(), zoom: crop.zoom };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    const last = pointers.current.get(event.pointerId);
    if (!last) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    if (pointers.current.size >= 2 && pinch.current && pinch.current.distance > 0) {
      const zoom = pinch.current.zoom * (spread() / pinch.current.distance);
      setCrop((current) => fit({ ...current, zoom }));
    } else if (pointers.current.size === 1) {
      setCrop((current) => fit({ ...current, x: current.x + point.x - last.x, y: current.y + point.y - last.y }));
    }
  };
  const onPointerEnd = (event: React.PointerEvent) => {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
  };

  const use = async () => {
    if (!image || busy) return;
    setBusy(true);
    setError('');
    try {
      await onUse(await renderPhoto(image, cropSource(crop, width, height, frame)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not use this photo.');
      setBusy(false);
    }
  };

  return createPortal(
    <div className="photo-crop" role="dialog" aria-modal="true" aria-labelledby="photo-crop-title">
      <div className="photo-crop-bar">
        <button type="button" onClick={onCancel} disabled={busy}>Cancel</button>
        <strong id="photo-crop-title">Move and zoom</strong>
        <button type="button" className="is-strong" onClick={() => void use()} disabled={!image || busy}>
          {busy ? <Loader2 size={16} className="animate-spin" aria-label="Saving" /> : 'Use photo'}
        </button>
      </div>
      <div
        className="photo-crop-stage"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {image && url && (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ width: width * scale, height: height * scale, transform: `translate(-50%, -50%) translate(${crop.x}px, ${crop.y}px)` }}
          />
        )}
        <div className="photo-crop-frame" style={{ width: frame, height: frame }} aria-hidden />
      </div>
      <div className="photo-crop-foot">
        <label className="photo-crop-zoom">
          <span aria-hidden>−</span>
          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.01}
            value={crop.zoom}
            onChange={(event) => setCrop((current) => fit({ ...current, zoom: Number(event.target.value) }))}
            aria-label="Zoom"
            disabled={!image}
          />
          <span aria-hidden>+</span>
        </label>
        {error ? <p className="photo-crop-error" role="alert">{error}</p>
          : <p>Drag to move, pinch or slide to zoom. Saved small (about 30 KB); anyone signed in can see it.</p>}
      </div>
    </div>,
    document.body,
  );
}
