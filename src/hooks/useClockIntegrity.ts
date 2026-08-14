import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  checkDeviceClock,
  CLOCK_CLEARED_EVENT,
  CLOCK_JUMP_EVENT,
  hasClockIncident,
  markClockIncident,
  noteClockSample,
  resetClockSample,
} from '../lib/deviceClock';

const SAMPLE_MS = 15_000;

export function useClockIntegrity(discardSession: () => void) {
  const { user, loading, signOut } = useAuth();
  const [blocked, setBlocked] = useState(() => hasClockIncident());
  const [clockReady, setClockReady] = useState(false);
  const handlingRef = useRef(false);

  const handleCorruption = useCallback(async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    markClockIncident();
    discardSession();
    setBlocked(true);
    resetClockSample();
    try {
      if (user) await signOut();
    } finally {
      handlingRef.current = false;
    }
  }, [discardSession, signOut, user]);

  useEffect(() => {
    resetClockSample();
    const sample = (source: 'tick' | 'resume') => {
      if (source === 'tick' && document.visibilityState === 'hidden') return;
      const { jumped } = noteClockSample();
      if (!jumped) return;
      if (source === 'resume') {
        void (async () => {
          const status = await checkDeviceClock();
          if (status === 'skewed') await handleCorruption();
          else resetClockSample();
        })();
        return;
      }
      void handleCorruption();
    };
    const interval = window.setInterval(() => sample('tick'), SAMPLE_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') sample('resume');
    };
    const onFocus = () => sample('resume');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [handleCorruption]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      const status = await checkDeviceClock();
      if (cancelled) return;
      if (status === 'skewed') await handleCorruption();
      if (!cancelled) setClockReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loading, handleCorruption]);

  useEffect(() => {
    const onCleared = () => setBlocked(false);
    const onJump = () => void handleCorruption();
    window.addEventListener(CLOCK_CLEARED_EVENT, onCleared);
    window.addEventListener(CLOCK_JUMP_EVENT, onJump);
    return () => {
      window.removeEventListener(CLOCK_CLEARED_EVENT, onCleared);
      window.removeEventListener(CLOCK_JUMP_EVENT, onJump);
    };
  }, [handleCorruption]);

  return { clockBlocked: blocked, clockReady, setClockBlocked: setBlocked };
}
