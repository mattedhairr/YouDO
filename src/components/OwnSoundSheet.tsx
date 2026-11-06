import { useEffect, useState } from 'react';
import { Play, Square, Trash2 } from 'lucide-react';
import Overlay from './Overlay';
import { focusSoundPlayer, type PreparedOwnSound } from '../lib/focusSoundPlayer';
import { OWN_SOUND_NAME_MAX, cleanSoundName, type OwnSound } from '../lib/ownSounds';
import { addOwnSound, formatSoundLength, removeOwnSound, renameOwnSound } from '../lib/ownSoundFiles';
import './focusSounds.css';

type Props =
  | { mode: 'add'; prepared: PreparedOwnSound; onDone: (added: OwnSound | null) => void; onClose: () => void }
  | { mode: 'edit'; sound: OwnSound; onDone: (removed: boolean) => void; onClose: () => void };

/** Name a sound and hear how it repeats before adding it; later, rename or remove it. */
export default function OwnSoundSheet(props: Props) {
  const initial = props.mode === 'add' ? props.prepared.name : props.sound.name;
  const [name, setName] = useState(initial);
  const [hearing, setHearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  // Closing the sheet ends its preview.
  useEffect(() => () => focusSoundPlayer.endPreview(), []);
  useEffect(() => {
    if (!hearing) return;
    const id = window.setInterval(() => {
      if (!focusSoundPlayer.previewing) setHearing(false);
    }, 400);
    return () => window.clearInterval(id);
  }, [hearing]);

  const length = props.mode === 'add'
    ? props.prepared.fit.end - props.prepared.fit.start
    : props.sound.end - props.sound.start;

  const hear = () => {
    if (hearing) {
      focusSoundPlayer.endPreview();
      setHearing(false);
      return;
    }
    let started: boolean;
    if (props.mode === 'add') {
      started = focusSoundPlayer.previewJoin(props.prepared.buffer, props.prepared.fit);
    } else {
      started = focusSoundPlayer.canPreview;
      if (started) focusSoundPlayer.preview(props.sound.id);
    }
    if (started) setHearing(true);
    else setError('A session is playing sound. Hear it after the session ends.');
  };

  const save = async () => {
    const clean = cleanSoundName(name);
    if (!clean) {
      setError('Give the sound a name.');
      return;
    }
    focusSoundPlayer.endPreview();
    if (props.mode === 'edit') {
      renameOwnSound(props.sound.id, clean);
      props.onDone(false);
      return;
    }
    setBusy(true);
    const added = await addOwnSound(props.prepared.file, clean, props.prepared.duration, props.prepared.fit);
    setBusy(false);
    if (!added) {
      setError('The phone has no room to keep this sound. Free some space and try again.');
      return;
    }
    props.onDone(added);
  };

  const remove = async () => {
    if (props.mode !== 'edit') return;
    focusSoundPlayer.forget(props.sound.id);
    setBusy(true);
    await removeOwnSound(props.sound.id);
    setBusy(false);
    props.onDone(true);
  };

  return (
    <Overlay open onClose={props.onClose} align="bottom">
      <div
        className="ios-sheet sheet-up own-sound-sheet w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-3"
        role="dialog"
        aria-modal="true"
        aria-labelledby="own-sound-title"
      >
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70" />
        <div>
          <h3 id="own-sound-title" className="text-[15px] font-bold text-content-primary">
            {props.mode === 'add' ? 'Add your sound' : 'Your sound'}
          </h3>
          <p className="text-[11.5px] font-medium text-content-muted mt-0.5">
            Name it the way you'll recognise it in the list.
          </p>
        </div>
        <input
          type="text"
          value={name}
          maxLength={OWN_SOUND_NAME_MAX}
          onChange={(e) => { setName(e.target.value); setError(''); }}
          aria-label="Sound name"
          className="h-11 rounded-xl border border-subtle bg-surface px-3 text-[13.5px] text-content-primary outline-none focus:border-primary"
        />
        <button
          type="button"
          onClick={hear}
          className="flex items-center gap-2.5 rounded-xl border border-subtle bg-surface px-3 py-2.5 text-left text-[11.5px] font-medium text-content-secondary"
          aria-pressed={hearing}
        >
          <span className="size-7 shrink-0 rounded-full bg-primary text-on-primary grid place-items-center">
            {hearing ? <Square size={10} className="fill-current" /> : <Play size={11} className="fill-current ml-px" />}
          </span>
          <span>
            {props.mode === 'add'
              ? <>Hear the repeat · {formatSoundLength(length)} · blends its end into its start</>
              : <>Preview · {formatSoundLength(length)} · on this phone only</>}
          </span>
        </button>
        {error && <p className="text-[11.5px] font-medium text-error" role="alert">{error}</p>}

        {confirmRemove ? (
          <div className="flex flex-col gap-2 rounded-2xl border border-error/30 bg-error-soft p-3">
            <p className="text-[12px] font-medium text-content-primary">Remove "{initial}" from this phone?</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmRemove(false)} className="flex-1 h-10 rounded-xl border border-subtle bg-surface text-[13px] font-semibold text-content-secondary">
                Keep it
              </button>
              <button type="button" disabled={busy} onClick={() => void remove()} className="flex-1 h-10 rounded-xl bg-error text-white text-[13px] font-bold disabled:opacity-60">
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2 mt-1">
            {props.mode === 'edit' ? (
              <button
                type="button"
                onClick={() => setConfirmRemove(true)}
                className="h-11 px-4 rounded-2xl border border-subtle bg-surface text-error grid place-items-center"
                aria-label="Remove this sound"
              >
                <Trash2 size={16} />
              </button>
            ) : (
              <button type="button" onClick={props.onClose} className="flex-1 h-11 rounded-2xl border border-subtle bg-surface text-[13.5px] font-semibold text-content-secondary">
                Cancel
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="flex-1 h-11 rounded-2xl bg-primary text-on-primary text-[13.5px] font-bold disabled:opacity-60"
            >
              {props.mode === 'add' ? (busy ? 'Adding…' : 'Add sound') : 'Save'}
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
