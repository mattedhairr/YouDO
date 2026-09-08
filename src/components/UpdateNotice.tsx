import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Browser } from '@capacitor/browser';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { checkForAppUpdate, dismissAppUpdate, type AppRelease } from '../lib/appUpdate';

export default function UpdateNotice({ suppressed }: { suppressed: boolean }) {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [textEntryActive, setTextEntryActive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void checkForAppUpdate({ signal: controller.signal }).then(setRelease);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const isTextEntry = (target: EventTarget | null) => target instanceof HTMLElement
      && (target.matches('input, textarea, select, [contenteditable="true"]'));
    const onFocusIn = (event: FocusEvent) => setTextEntryActive(isTextEntry(event.target));
    const onFocusOut = () => requestAnimationFrame(() => setTextEntryActive(isTextEntry(document.activeElement)));
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    return () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
    };
  }, []);

  if (!release || suppressed || textEntryActive) return null;

  const dismiss = () => {
    dismissAppUpdate(release.version);
    setRelease(null);
  };

  const openRelease = async () => {
    try {
      await Browser.open({ url: release.url, toolbarColor: '#171612' });
    } catch {
      window.open(release.url, '_blank', 'noopener,noreferrer');
    }
    dismiss();
  };

  return createPortal(
    <aside
      className="update-notice rounded-[18px] border border-primary/30 bg-elevated p-4 shadow-elevated fade-in"
      aria-label={`YouDO ${release.version} update available`}
    >
      <div className="flex items-start gap-3">
        <div className="size-10 shrink-0 rounded-[12px] border border-primary/20 bg-primary-soft text-primary grid place-items-center">
          <Download size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-primary">Update available</p>
          <h2 className="mt-0.5 text-[15px] font-semibold text-content-primary">YouDO v{release.version}</h2>
        </div>
        <button type="button" onClick={dismiss} className="size-9 -mr-1 -mt-1 rounded-full grid place-items-center text-content-muted hover:bg-surface" aria-label="Remind me later">
          <X size={17} />
        </button>
      </div>
      {release.highlights.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-l border-primary/25 pl-3">
          {release.highlights.map((highlight) => (
            <li key={highlight} className="text-[11px] leading-relaxed text-content-secondary">{highlight}</li>
          ))}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button type="button" onClick={openRelease} className="h-10 rounded-[11px] bg-primary text-on-primary text-[12px] font-semibold flex items-center justify-center gap-1.5">
          View update <ArrowUpRight size={14} />
        </button>
        <button type="button" onClick={dismiss} className="h-10 px-4 rounded-[11px] border border-subtle text-[11px] font-semibold text-content-secondary">
          Later
        </button>
      </div>
    </aside>,
    document.body,
  );
}
