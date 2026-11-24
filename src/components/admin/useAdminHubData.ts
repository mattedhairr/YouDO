import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAdminCommunity, fetchCommunityActivity, fetchCommunityContext, fetchReportedMessages,
  type CommunityActivitySummary, type CommunityAppeal, type CommunityAuditEntry, type CommunityContext,
  type CommunityMemberState, type CommunityMessage, type CommunityReport,
} from '../../lib/community';
import { fetchAdminCommunityHashtags, fetchAdminHashtagRequests, type AdminCommunityHashtag, type CommunityHashtagRequest } from '../../lib/communityHashtags';
import { fetchAdminAppQuotes, type AdminAppQuote } from '../../lib/appQuotes';
import { fetchUpdateReplies, fetchUpdateState, type UpdateReply, type UpdateState } from '../../lib/boardUpdate';
import { fetchPendingHubBackers } from '../../lib/backers';
import { dismissAdminNotification } from '../../lib/notifications';
import { can, fetchAdminRole, fetchGrowth, fetchNames, type AdminRole, type GrowthReport } from '../../lib/adminHub';

export interface AdminHubData {
  context: CommunityContext;
  role: AdminRole | null;
  activity: CommunityActivitySummary | null;
  reports: CommunityReport[];
  reportMessages: CommunityMessage[];
  appeals: CommunityAppeal[];
  members: CommunityMemberState[];
  audit: CommunityAuditEntry[];
  hashtagRequests: CommunityHashtagRequest[];
  hashtags: AdminCommunityHashtag[];
  hashtagError: string;
  quotes: AdminAppQuote[];
  quoteError: string;
  update: UpdateState | null;
  updateReplies: UpdateReply[];
  pendingBackers: number;
  growth: GrowthReport | null;
  growthError: string;
  names: Map<string, string>;
}

const attempt = <T,>(promise: Promise<T>, fallback: T) =>
  promise.then((value) => ({ value, error: '' })).catch((error: unknown) => ({ value: fallback, error: error instanceof Error ? error.message : 'Unavailable.' }));

/**
 * Everything the Admin Hub shows, loaded together and refreshed every 30 s
 * while visible. Owner-only parts are asked for only by the owner.
 */
export function useAdminHubData(userId: string) {
  const [data, setData] = useState<AdminHubData | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const request = useRef(0);
  const invalidate = useCallback(() => { request.current++; }, []);

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setRefreshing(true);
    try {
      const [context, role] = await Promise.all([fetchCommunityContext(userId), fetchAdminRole()]);
      if (id !== request.current) return;
      if (context.error) throw new Error(context.error);
      // A server without admin_hub.sql has no roles yet: an admin there is treated as one.
      const effectiveRole: AdminRole | null = role ?? (context.isAdmin ? 'admin' : null);
      if (!context.isAdmin) {
        setData((previous) => ({ ...(previous ?? emptyData(context)), context, role: null }));
        return;
      }
      const owner = can(effectiveRole, 'growth');
      const [admin, activity, hashtagRequests, hashtags, quotes, update, updateReplies, backers, growth] = await Promise.all([
        fetchAdminCommunity(context.dayKey),
        fetchCommunityActivity(),
        fetchAdminHashtagRequests(),
        attempt(fetchAdminCommunityHashtags(), [] as AdminCommunityHashtag[]),
        attempt(fetchAdminAppQuotes(), [] as AdminAppQuote[]),
        fetchUpdateState(),
        owner ? fetchUpdateReplies() : Promise.resolve([] as UpdateReply[]),
        owner ? fetchPendingHubBackers() : Promise.resolve([]),
        owner ? attempt(fetchGrowth(), null as GrowthReport | null) : Promise.resolve({ value: null, error: '' }),
      ]);
      const reportMessages = await fetchReportedMessages(admin.reports.map((report) => report.messageId));
      const names = await fetchNames([
        ...reportMessages.map((message) => message.authorId),
        ...admin.appeals.map((appeal) => appeal.userId),
        ...admin.members.map((member) => member.userId),
        ...admin.audit.flatMap((entry) => [entry.adminId ?? '', entry.targetUserId ?? '']),
        ...hashtagRequests.map((item) => item.requesterId ?? ''),
        ...updateReplies.map((reply) => reply.userId),
      ]).catch(() => new Map<string, string>());
      if (id !== request.current) return;
      setData({
        context, role: effectiveRole, activity,
        reports: admin.reports, reportMessages, appeals: admin.appeals, members: admin.members, audit: admin.audit,
        hashtagRequests, hashtags: hashtags.value, hashtagError: hashtags.error,
        quotes: quotes.value, quoteError: quotes.error,
        update, updateReplies, pendingBackers: backers.length,
        growth: growth.value, growthError: growth.error,
        names,
      });
      setError('');
      void dismissAdminNotification();
    } catch (caught) {
      if (id === request.current) setError(caught instanceof Error ? caught.message : 'Could not refresh. Try again.');
    } finally {
      if (id === request.current) setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visible, 30_000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      invalidate();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh, invalidate]);

  return { data, error, refreshing, refresh };
}

function emptyData(context: CommunityContext): AdminHubData {
  return {
    context, role: null, activity: null, reports: [], reportMessages: [], appeals: [], members: [], audit: [],
    hashtagRequests: [], hashtags: [], hashtagError: '', quotes: [], quoteError: '', update: null, updateReplies: [],
    pendingBackers: 0, growth: null, growthError: '', names: new Map(),
  };
}
