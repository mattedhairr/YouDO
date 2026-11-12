import { useEffect, useRef } from 'react';
import type { ActiveSession } from '../types';
import {
  announcedAfter,
  focusShareFromSession,
  focusShareKey,
  readFocusAnnounced,
  saveFocusAnnounced,
  setFocusStatus,
  shouldShareFocus,
} from '../lib/focusStatus';

/**
 * Shares "focusing / paused / idle" with room-mates when a session starts,
 * pauses, resumes or stops — not on every heartbeat.
 *
 * A device speaks only for its own session (shouldShareFocus): opening YouDO
 * on a phone with no session says nothing, so it can't cancel a session
 * running on the website; "idle" goes out only when a session this device
 * announced ends. While you focus here, coming back to the app or tab
 * announces it again, which repairs a status another device overwrote. A
 * failed write is retried on the next change or on coming back.
 *
 * Nothing is shared until ready: a session started from the widget is picked
 * up after launch first.
 */
export function useFocusStatusShare(userId: string | undefined, session: ActiveSession | null | undefined, ready = true) {
  const sent = useRef<string | null>(null);
  const share = focusShareFromSession(session);
  const key = focusShareKey(share);

  useEffect(() => {
    sent.current = null;
  }, [userId]);

  useEffect(() => {
    if (!userId || !ready || sent.current === key) return;
    if (!shouldShareFocus(share, readFocusAnnounced(), userId)) {
      // No session of ours to report: leave the room's status to the device that has one.
      sent.current = key;
      return;
    }
    let cancelled = false;
    void setFocusStatus(share).then((ok) => {
      if (cancelled || !ok) return;
      sent.current = key;
      saveFocusAnnounced(announcedAfter(share, userId));
    });
    return () => {
      cancelled = true;
    };
    // `share` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);

  useEffect(() => {
    if (!userId || !ready) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Focusing is announced again (another device may have overwritten it). A
      // paused session is not: the server takes the write time as the start of
      // the pause, so room-mates' paused clock would jump. Anything else, such as
      // an unsent "idle" for our own ended session, is only retried.
      const reassert = share.state === 'focusing';
      if (!reassert && (sent.current === key || !shouldShareFocus(share, readFocusAnnounced(), userId))) return;
      void setFocusStatus(share).then((ok) => {
        if (!ok) return;
        sent.current = key;
        saveFocusAnnounced(announcedAfter(share, userId));
      });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);
}
