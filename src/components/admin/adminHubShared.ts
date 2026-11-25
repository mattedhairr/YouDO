import { can } from '../../lib/adminHub';
import type { AdminHubData } from './useAdminHubData';

export type QueueFilter = 'all' | 'reports' | 'hashtags' | 'appeals' | 'backers';
export type CommunityPage = 'broadcast' | 'hashtags' | 'quotes' | 'log';
export type OwnerPage = 'cleanup' | 'staff' | 'support' | 'backers';

export const COMMUNITY_PAGE_TITLES: Record<CommunityPage, string> = {
  broadcast: 'Board broadcast', hashtags: 'Hashtag rooms', quotes: 'Header quotes', log: 'Activity log',
};

export const OWNER_PAGE_TITLES: Record<OwnerPage, string> = {
  cleanup: 'Account cleanup', staff: 'Staff', support: 'Support YouDO', backers: 'Backers',
};

/** How many items wait in each part of the queue (backer claims only for the owner). */
export function queueCounts(data: AdminHubData) {
  const reports = new Set(data.reports.map((report) => report.messageId)).size;
  const hashtags = data.hashtagRequests.length;
  const appeals = data.appeals.length;
  const backers = can(data.role, 'money') ? data.pendingBackers : 0;
  return { reports, hashtags, appeals, backers, all: reports + hashtags + appeals + backers };
}
