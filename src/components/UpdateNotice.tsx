import { useEffect, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { checkForAppUpdate, dismissAppUpdate, highlightParts, isApkHighlight, type AppRelease } from '../lib/appUpdate';
import UpdateAction from './UpdateAction';
import { subscribeWebUpdate, webUpdateReady } from '../lib/webUpdate';
import './updateInstaller.css';

/** What's-new lines shown before "Full notes". */
const NOTES_SHOWN = 4;

export default function UpdateNotice({ suppressed }: { suppressed: boolean }) {
  const [release, setRelease] = useState<AppRelease | null>(null);
  const [textEntryActive, setTextEntryActive] = useState(false);
  const webReady = useSyncExternalStore(subscribeWebUpdate, webUpdateReady);
  const [webDismissed, setWebDismissed] = useState(false);
  const [allNotes, setAllNotes] = useState(false);

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

  if ((!release && (!webReady || webDismissed)) || suppressed || textEntryActive) return null;

  const dismiss = () => {
    if (release) dismissAppUpdate(release.version);
    setWebDismissed(true);
    setRelease(null);
  };

  const items = (release?.highlights ?? []).filter((line) => !isApkHighlight(line)).map(highlightParts);
  const shown = allNotes ? items : items.slice(0, NOTES_SHOWN);
  const size = release?.apk?.size;

  return createPortal(
    <aside className="update-notice update-notice-glass fade-in" aria-label="YouDO update available">
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" className="update-notice-icon" />
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-primary">{webReady ? 'Update ready' : 'New version'}</p>
          <h2 className="mt-0.5 text-[18px] font-bold leading-tight text-content-primary">{webReady ? 'A newer YouDO website' : `YouDO ${release?.version}`}</h2>
          {!webReady && size ? <p className="mt-0.5 text-[12px] text-content-secondary">{(size / 1048576).toFixed(1)} MB · from GitHub</p> : null}
        </div>
        <button type="button" onClick={dismiss} className="update-notice-close" aria-label="Remind me later">
          <X size={15} />
        </button>
      </div>
      {shown.length > 0 && (
        <ul className="update-notice-highlights mt-3 space-y-1" aria-label="What's new in this update" tabIndex={0}>
          {shown.map((item) => (
            <li key={item.title + item.text} className="flex gap-2.5 px-1 py-1.5">
              <span className="update-notice-dot" aria-hidden />
              <span className="min-w-0 flex-1">
                {item.title && <b className="block text-[13.5px] font-semibold text-content-primary">{item.title}</b>}
                <span className={`block text-[12px] leading-snug text-content-secondary ${allNotes ? '' : 'truncate'}`}>{item.text}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!allNotes && items.length > 0 && (
        <button type="button" onClick={() => setAllNotes(true)} className="mt-1 ml-[27px] w-fit text-[12.5px] font-semibold text-primary">
          {items.length > NOTES_SHOWN ? `+ ${items.length - NOTES_SHOWN} more · Full notes` : 'Full notes'}
        </button>
      )}
      <div className="mt-3.5 grid grid-cols-[auto_1fr] gap-2">
        <button type="button" onClick={dismiss} className="update-notice-later">
          Later
        </button>
        <UpdateAction release={release} big />
      </div>
    </aside>,
    document.body,
  );
}
