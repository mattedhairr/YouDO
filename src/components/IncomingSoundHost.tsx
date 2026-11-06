import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import Overlay from './Overlay';
import OwnSoundSheet from './OwnSoundSheet';
import { readFocusSoundPrefs, saveFocusSoundPrefs } from '../lib/focusSounds';
import { prepareOwnSound, type PreparedOwnSound } from '../lib/focusSoundPlayer';
import { YouDoFocusSound } from '../lib/focusSoundKeepAlive';

const REASONS: Record<string, string> = {
  'too-big': 'That file is too big. Pick one under 60 MB.',
  unreadable: 'YouDO could not read that file. Try saving it to the phone first.',
};

/**
 * Android: an audio file opened with or shared to YouDO. It is copied into the
 * app (natively), then offered here for Your sounds, the same as adding it
 * from Settings. Loaded only on Android, after the first screen.
 */
export default function IncomingSoundHost() {
  const [prepared, setPrepared] = useState<PreparedOwnSound | null>(null);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('YouDoFocusSound')) return;
    let live = true;
    let busy = false;
    const check = async () => {
      if (busy) return;
      busy = true;
      try {
        const { path, name } = await YouDoFocusSound.takeIncomingSound();
        if (path === undefined) return;
        if (!path) {
          if (live) setProblem(REASONS[name ?? ''] ?? REASONS.unreadable);
          return;
        }
        const response = await fetch(Capacitor.convertFileSrc(path));
        const blob = await response.blob();
        void YouDoFocusSound.clearIncomingSound().catch(() => undefined);
        const result = await prepareOwnSound(blob, name || 'My sound');
        if (!live) return;
        if ('error' in result) setProblem(result.error);
        else setPrepared(result);
      } catch {
        if (live) setProblem(REASONS.unreadable);
      } finally {
        busy = false;
      }
    };
    void check();
    const listener = YouDoFocusSound.addListener('incomingSound', () => void check());
    return () => {
      live = false;
      void listener.then((l) => l.remove()).catch(() => undefined);
    };
  }, []);

  if (prepared) {
    return (
      <OwnSoundSheet
        mode="add"
        prepared={prepared}
        onClose={() => setPrepared(null)}
        onDone={(added) => {
          setPrepared(null);
          if (added) saveFocusSoundPrefs({ ...readFocusSoundPrefs(), sound: added.id });
        }}
      />
    );
  }
  if (!problem) return null;
  return (
    <Overlay open onClose={() => setProblem('')} align="bottom">
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-3" role="alertdialog" aria-labelledby="incoming-sound-title">
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70" />
        <h3 id="incoming-sound-title" className="text-[15px] font-bold text-content-primary">Sound not added</h3>
        <p className="text-[12px] font-medium text-content-secondary">{problem}</p>
        <button type="button" onClick={() => setProblem('')} className="h-11 rounded-2xl bg-primary text-on-primary text-[13.5px] font-bold">
          OK
        </button>
      </div>
    </Overlay>
  );
}
