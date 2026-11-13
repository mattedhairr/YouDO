import { useEffect, useMemo, useRef } from 'react';
import type { ActiveSession, TaskSession } from '../types';
import { focusShareFromSession, focusShareKey } from '../lib/focusShare';

type FocusLib = typeof import('../lib/focusStatus');
type ShareQueue = ReturnType<FocusLib['createFocusShareQueue']>;

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
 *
 * With no session here, the app also checks your status when it opens or comes
 * back: if the room still shows a session that is already in your history (it
 * ended, on any device), it says "idle" (isEndedOwnStatus). That clears a
 * status left stuck, for instance by an older version.
 *
 * The sending code loads on first use, outside the first screen's budget;
 * calls keep their order while it loads. Nothing is shared until ready: a
 * session started from the widget is picked up after launch first.
 */
export function useFocusStatusShare(
  userId: string | undefined,
  session: ActiveSession | null | undefined,
  ready = true,
  history: Record<string, TaskSession[]> = {},
) {
  const sent = useRef<string | null>(null);
  const userRef = useRef(userId);
  userRef.current = userId;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const lib = useRef<Promise<FocusLib> | null>(null);
  const queue = useRef<ShareQueue | null>(null);
  const share = focusShareFromSession(session);
  const key = focusShareKey(share);
  const sittingStarts = useMemo(
    () => new Set(Object.values(history).flat().map((sitting) => sitting.startTime)),
    [history],
  );
  const startsRef = useRef(sittingStarts);
  startsRef.current = sittingStarts;

  const load = () => {
    lib.current ??= import('../lib/focusStatus').catch((error) => {
      // A failed load is tried again on the next change or on coming back.
      lib.current = null;
      throw error;
    });
    return lib.current.then((focus) => {
      queue.current ??= focus.createFocusShareQueue();
      return { focus, push: queue.current };
    });
  };

  useEffect(() => {
    sent.current = null;
  }, [userId]);

  const enqueue = (owner: string) => {
    void load().then(({ push }) => push({
      share,
      userId: owner,
      current: () => userRef.current === owner,
      done: () => { sent.current = key; },
    }), () => {});
  };

  /** Clears your room status if it still shows a session that has ended. */
  const clearEnded = (owner: string) => {
    void load().then(async ({ focus, push }) => {
      const status = (await focus.fetchFocusStatuses([owner]))[owner];
      const stillIdleHere = () => userRef.current === owner && !sessionRef.current;
      if (!stillIdleHere() || !focus.isEndedOwnStatus(status, startsRef.current)) return;
      await push({
        share: { state: 'idle', startedAt: null, pausedMs: 0 },
        userId: owner,
        force: true,
        current: stillIdleHere,
        done: () => {},
      });
    }).catch(() => {});
  };

  useEffect(() => {
    if (!userId || !ready || sent.current === key) return;
    enqueue(userId);
    // `share` and `enqueue` follow `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, key, ready]);

  // With no session here: on opening, and when a newly synced sitting arrives.
  const idleHere = share.state === 'idle';
  useEffect(() => {
    if (!userId || !ready || !idleHere) return;
    clearEnded(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, ready, idleHere, sittingStarts.size]);

  useEffect(() => {
    if (!userId || !ready) return;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (share.state === 'idle') clearEnded(userId);
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
