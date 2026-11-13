import { useEffect, useRef } from 'react';
import type { ActiveSession } from '../types';
import { focusShareFromSession, focusShareKey } from '../lib/focusShare';

type ShareQueue = ReturnType<typeof import('../lib/focusStatus').createFocusShareQueue>;

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
 * Writes go out one at a time, newest last (createFocusShareQueue), so a stop
 * made just after coming back can't be overtaken by the "focusing" sent then.
 * The sending code loads on first use, outside the first screen's budget;
 * calls keep their order while it loads.
 *
 * Nothing is shared until ready: a session started from the widget is picked
 * up after launch first.
 */
export function useFocusStatusShare(userId: string | undefined, session: ActiveSession | null | undefined, ready = true) {
  const sent = useRef<string | null>(null);
  const userRef = useRef(userId);
  userRef.current = userId;
  const queue = useRef<Promise<ShareQueue> | null>(null);
  const share = focusShareFromSession(session);
  const key = focusShareKey(share);

  useEffect(() => {
    sent.current = null;
  }, [userId]);

  const enqueue = (owner: string) => {
    queue.current ??= import('../lib/focusStatus').then(({ createFocusShareQueue }) => createFocusShareQueue());
    // A failed load drops this change; the next one, or coming back, tries again.
    void queue.current.then((push) => push({
      share,
      userId: owner,
      current: () => userRef.current === owner,
      done: () => { sent.current = key; },
    }), () => { queue.current = null; });
  };

  useEffect(() => {
    if (!userId || !ready || sent.current === key) return;
    enqueue(userId);
    // `share` and `enqueue` follow `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);

  useEffect(() => {
    if (!userId || !ready) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Focusing is announced again (another device may have overwritten it). A
      // paused session is not: the server takes the write time as the start of
      // the pause, so room-mates' paused clock would jump. Anything else, such as
      // an unsent "idle" for our own ended session, is only retried (and only
      // when this device has something to say: see createFocusShareQueue).
      if (share.state !== 'focusing' && sent.current === key) return;
      enqueue(userId);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);
}
