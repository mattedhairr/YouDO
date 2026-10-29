import { useEffect, useRef } from 'react';
import type { ActiveSession } from '../types';
import { focusShareFromSession, focusShareKey, setFocusStatus } from '../lib/focusStatus';

/**
 * Shares "focusing / paused / idle" with room-mates when a session starts,
 * pauses, resumes or stops — not on every heartbeat. A failed write is
 * retried on the next change or when the app comes back to the foreground.
 * Nothing is shared until ready: a session started from the widget is picked
 * up after launch, and an "idle" sent before then would end it for the room.
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
    let cancelled = false;
    void setFocusStatus(share).then((ok) => {
      if (!cancelled && ok) sent.current = key;
    });
    return () => {
      cancelled = true;
    };
    // `share` is derived from `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);

  useEffect(() => {
    if (!userId || !ready) return;
    const retry = () => {
      if (document.visibilityState !== 'visible' || sent.current === key) return;
      void setFocusStatus(share).then((ok) => {
        if (ok) sent.current = key;
      });
    };
    document.addEventListener('visibilitychange', retry);
    return () => document.removeEventListener('visibilitychange', retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);
}
