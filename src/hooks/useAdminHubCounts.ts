import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminHubCounts, type AdminHubCounts } from '../lib/community';
import { fetchPendingHubBackers } from '../lib/backers';

export interface AdminQueue extends AdminHubCounts {
  backers: number;
}

export const EMPTY_ADMIN_QUEUE: AdminQueue = { reports: 0, appeals: 0, hashtagRequests: 0, chatReplies: 0, backers: 0, total: 0 };

/** Fired when an admin action may have changed the queue (Admin Hub closed, item reviewed). */
export const ADMIN_QUEUE_EVENT = 'youdo-admin-queue-changed';

/**
 * Items waiting for an admin, on every tab: they clear only once handled, not
 * when viewed. They feed the Admin Hub's dots; new items are pushed to admins
 * by the server (supabase/community_push.sql).
 */
export function useAdminHubCounts(isAdmin: boolean) {
  const [queue, setQueue] = useState<AdminQueue>(EMPTY_ADMIN_QUEUE);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (!isAdmin || busy.current || document.visibilityState !== 'visible') return;
    busy.current = true;
    try {
      const [counts, backers] = await Promise.all([fetchAdminHubCounts(), fetchPendingHubBackers()]);
      const next: AdminQueue = { ...counts, backers: backers.length, total: counts.total + backers.length };
      setQueue(next);
    } catch {
      // Keep the last known queue during a connection failure.
    } finally {
      busy.current = false;
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) {
      setQueue(EMPTY_ADMIN_QUEUE);
      return;
    }
    void check();
    const refresh = () => void check();
    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener('youdo-community-read', refresh);
    window.addEventListener(ADMIN_QUEUE_EVENT, refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('youdo-community-read', refresh);
      window.removeEventListener(ADMIN_QUEUE_EVENT, refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [isAdmin, check]);

  return { queue, refresh: check };
}
