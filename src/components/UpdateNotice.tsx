import { useEffect, useState } from 'react';
import { Browser } from '@capacitor/browser';
import { ArrowUpRight, Download, X } from 'lucide-react';
import { checkForAppUpdate, dismissAppUpdate, type AppRelease } from '../lib/appUpdate';

export default function UpdateNotice({ suppressed }: { suppressed: boolean }) {
  const [release, setRelease] = useState<AppRelease | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void checkForAppUpdate({ signal: controller.signal }).then(setRelease);
    return () => controller.abort();
  }, []);

  if (!release || suppressed) return null;

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

  return (
    <aside
      className="fixed left-1/2 -translate-x-1/2 bottom-[calc(6.4rem+env(safe-area-inset-bottom))] z-[900] w-[calc(100%-2rem)] max-w-sm rounded-[18px] border border-primary/30 bg-elevated p-4 shadow-elevated fade-in"
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
    </aside>
  );
}
