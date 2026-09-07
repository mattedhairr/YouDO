import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

/** Coarse Board participation only: one foreground signal at most every two minutes. */
export function useCommunityActivity(userId: string | undefined, optedIn: boolean) {
  useEffect(() => {
    if (!userId || !optedIn) return;
    let busy = false;
    let last = 0;
    let unavailable = false;
    const ping = async () => {
      if (unavailable || busy || document.visibilityState !== 'visible' || !navigator.onLine || Date.now() - last < 120_000) return;
      busy = true;
      last = Date.now();
      try {
        const { error } = await supabase.rpc('record_community_activity');
        // Older backend: don't repeatedly call a function that is not installed.
        unavailable = error?.code === 'PGRST202' || error?.code === '42883';
      } catch { /* Optional activity measurement must never interrupt the app. */ }
      finally { busy = false; }
    };
    void ping();
    const timer = window.setInterval(() => void ping(), 120_000);
    const resume = () => void ping();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
    };
  }, [userId, optedIn]);
}
