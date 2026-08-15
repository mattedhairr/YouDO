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

export function useClockIntegrity() {
  const { loading } = useAuth();
  const [blocked, setBlocked] = useState(() => hasClockIncident());
  const [clockReady, setClockReady] = useState(false);
  const handlingRef = useRef(false);

  const handleProvenSkew = useCallback(async () => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    markClockIncident();
    setBlocked(true);
    resetClockSample();
    handlingRef.current = false;
  }, []);

  useEffect(() => {
    resetClockSample();
    const sample = (source: 'tick' | 'resume') => {
      if (source === 'tick' && document.visibilityState === 'hidden') return;
      const { jumped, slept } = noteClockSample(source);
      if (slept) return;
      if (!jumped) return;
      void (async () => {
        const status = await checkDeviceClock();
        if (status === 'skewed') await handleProvenSkew();
        else resetClockSample();
      })();
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
  }, [handleProvenSkew]);

  useEffect(() => {
    if (loading) return;
    let cancelled = false;
    void (async () => {
      const status = await checkDeviceClock();
      if (cancelled) return;
      if (status === 'skewed') await handleProvenSkew();
      if (!cancelled) setClockReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, handleProvenSkew]);

  useEffect(() => {
    const onCleared = () => setBlocked(false);
    const onJump = () => {
      void (async () => {
        const status = await checkDeviceClock();
        if (status === 'skewed') await handleProvenSkew();
        else resetClockSample();
      })();
    };
    window.addEventListener(CLOCK_CLEARED_EVENT, onCleared);
    window.addEventListener(CLOCK_JUMP_EVENT, onJump);
    return () => {
      window.removeEventListener(CLOCK_CLEARED_EVENT, onCleared);
      window.removeEventListener(CLOCK_JUMP_EVENT, onJump);
    };
  }, [handleProvenSkew]);

  return { clockBlocked: blocked, clockReady, setClockBlocked: setBlocked };
}
