import { useEffect, useState } from 'react';
import type { ActiveSession } from '../types';
import { FOCUS_SOUNDS_EVENT, focusSoundAction, readFocusSoundPrefs } from '../lib/focusSounds';
import { setFocusSoundKeepAlive } from '../lib/focusSoundKeepAlive';

type Player = typeof import('../lib/focusSoundPlayer')['focusSoundPlayer'];
let player: Promise<Player> | null = null;
/** The player loads the first time a sound is needed, not with the first screen. */
const loadPlayer = () => (player ??= import('../lib/focusSoundPlayer').then((m) => m.focusSoundPlayer));

/** Plays the chosen focus sound with the session: on while it runs, paused with it, gone when it ends. */
export function useFocusSoundSession(activeSession: ActiveSession | null) {
  const [prefs, setPrefs] = useState(readFocusSoundPrefs);
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');

  useEffect(() => {
    const onPrefs = () => setPrefs(readFocusSoundPrefs());
    const onVisibility = () => setVisible(document.visibilityState !== 'hidden');
    window.addEventListener(FOCUS_SOUNDS_EVENT, onPrefs);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener(FOCUS_SOUNDS_EVENT, onPrefs);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const action = focusSoundAction({
    session: !!activeSession,
    paused: !!activeSession?.isPaused,
    sound: prefs.sound,
    visible,
    keepPlaying: prefs.keepPlaying,
  });
  useEffect(() => {
    // Nothing has played yet: no need to load the player just to stop it.
    if (action !== 'play' && !player) return;
    const sound = prefs.sound;
    void loadPlayer().then((p) => {
      if (action === 'play' && sound) void p.play(sound);
      else if (action === 'pause') void p.pause();
      // No session: leave a Settings preview to finish on its own.
      else if (!p.previewing) void p.stop();
    }).catch(() => undefined);
  }, [action, prefs.sound]);

  const keepAlive = action === 'play' && prefs.keepPlaying;
  useEffect(() => {
    void setFocusSoundKeepAlive(keepAlive);
  }, [keepAlive]);
}
