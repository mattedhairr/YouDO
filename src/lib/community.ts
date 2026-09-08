import { supabase } from './supabase';
import type { PaceWindow } from './paceBoard';

export interface CommunityActivitySummary {
  dayKey: string;
  asOf: string;
  activeRecently: number;
  visitedToday: number;
  boardMembers: number;
}

export async function fetchCommunityActivity(): Promise<CommunityActivitySummary | null> {
  const { data, error } = await supabase.rpc('community_activity_summary');
  if (error || !data) return null;
  return parseCommunityActivity(data);
}

export function parseCommunityActivity(data: unknown): CommunityActivitySummary | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.day_key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.day_key)
    || typeof row.as_of !== 'string' || !Number.isFinite(Date.parse(row.as_of))) return null;
  const counts = [row.active_recently, row.visited_today, row.board_members];
  if (counts.some((count) => typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0)) return null;
  if (Number(row.active_recently) > Number(row.board_members) || Number(row.visited_today) > Number(row.board_members)) return null;
  return {
    dayKey: row.day_key, asOf: row.as_of,
    activeRecently: Number(row.active_recently), visitedToday: Number(row.visited_today),
    boardMembers: Number(row.board_members),
  };
}

export interface CommunitySettings {
  roomEnabled: boolean;
  appreciationsEnabled: boolean;
  announcement: string;
}

export interface CommunityContext {
  error?: string;
  available: boolean;
  dayKey: string;
  isAdmin: boolean;
  canJoin: boolean;
  canPost: boolean;
  settings: CommunitySettings;
  mutedUntil?: string;
  banned: boolean;
  appeal?: CommunityAppeal;
}

export interface CommunityAppeal {
  id: string;
  userId: string;
  message: string;
  status: 'open' | 'approved' | 'declined';
  adminResponse: string;
  createdAt: string;
  reviewedAt?: string;
}

const APPEAL_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

export function communityAppealAvailableAt(appeal?: CommunityAppeal): number {
  if (appeal?.status !== 'declined' || !appeal.reviewedAt) return 0;
  return new Date(appeal.reviewedAt).getTime() + APPEAL_RETRY_MS;
}

export function canSubmitCommunityAppeal(appeal?: CommunityAppeal, now = Date.now()): boolean {
  if (!appeal) return true;
  if (appeal.status !== 'declined') return false;
  return now >= communityAppealAvailableAt(appeal);
}

export interface CommunityMessage {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
  removedAt?: string;
  kind?: 'chat' | 'kudos';
}

export interface AppreciationState {
  counts: Record<string, number>;
  mine: Set<string>;
}

export interface CommunityReport {
  id: string;
  messageId: string;
  reporterId: string;
  reason: string;
  createdAt: string;
}

export interface CommunityMemberState {
  userId: string;
  displayName: string;
  mutedUntil?: string;
  banned: boolean;
  note: string;
}

export interface CommunityAuditEntry {
  id: number;
  action: string;
  targetUserId?: string;
  reason: string;
  createdAt: string;
}

export interface CommunityAuditDescription {
  category: 'Settings' | 'Member' | 'Report' | 'Appeal' | 'Message' | 'Admin';
  title: string;
  detail: string;
}

const auditSubject = (targetName?: string) => targetName?.trim() || 'a board member';

export function describeCommunityAudit(entry: CommunityAuditEntry, targetName?: string): CommunityAuditDescription {
  const subject = auditSubject(targetName);
  const descriptions: Record<string, CommunityAuditDescription> = {
    'settings.room.enabled': { category: 'Settings', title: 'Community room opened', detail: 'Members can send messages and automatic notes again.' },
    'settings.room.disabled': { category: 'Settings', title: 'Community room paused', detail: 'New messages and automatic notes are paused.' },
    'settings.kudos.enabled': { category: 'Settings', title: 'Kudos enabled', detail: 'Members can recognise today’s top three again.' },
    'settings.kudos.disabled': { category: 'Settings', title: 'Kudos paused', detail: 'New recognition is temporarily unavailable.' },
    'settings.announcement.published': { category: 'Settings', title: 'Board announcement published', detail: 'The room announcement was added or replaced.' },
    'settings.announcement.cleared': { category: 'Settings', title: 'Board announcement cleared', detail: 'The room announcement was removed.' },
    'settings.updated': { category: 'Settings', title: 'Community settings updated', detail: 'An earlier app version recorded this change without field details.' },
    'member.mute_24h': { category: 'Member', title: `Muted ${subject} for 24 hours`, detail: entry.reason || 'Posting access was temporarily paused.' },
    'member.mute_7d': { category: 'Member', title: `Muted ${subject} for 7 days`, detail: entry.reason || 'Posting access was temporarily paused.' },
    'member.ban': { category: 'Member', title: `Removed ${subject} from community`, detail: entry.reason || 'Community access was disabled; private workspace data was untouched.' },
    'member.restore': { category: 'Member', title: `Restored ${subject}`, detail: entry.reason || 'Community access was restored.' },
    'appeal.approve': { category: 'Appeal', title: `Approved ${subject}’s appeal`, detail: entry.reason || 'Community access was restored.' },
    'appeal.decline': { category: 'Appeal', title: `Declined ${subject}’s appeal`, detail: entry.reason || 'The restriction remains in place.' },
    'message.removed': { category: 'Message', title: `Removed ${subject}’s message`, detail: entry.reason || 'The message was removed from the community room.' },
    'report.dismissed': { category: 'Report', title: 'Report dismissed', detail: 'The report was reviewed and closed without restricting a member.' },
  };
  if (descriptions[entry.action]) return descriptions[entry.action];
  const readable = entry.action.split('.').filter(Boolean).join(' ');
  return {
    category: 'Admin',
    title: readable ? readable.charAt(0).toUpperCase() + readable.slice(1) : 'Admin action recorded',
    detail: entry.reason || 'Recorded by a community administrator.',
  };
}

export function isCommunityUnavailable(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return error.code === 'PGRST205' || error.code === '42P01' || error.code === '42883'
    || (message.includes('community_') && (message.includes('schema cache') || message.includes('does not exist')));
}

const defaultContext = (): CommunityContext => ({
  available: false,
  dayKey: new Date().toISOString().slice(0, 10),
  isAdmin: false,
  canJoin: false,
  canPost: false,
  settings: { roomEnabled: false, appreciationsEnabled: false, announcement: '' },
  banned: false,
});

export async function fetchCommunityContext(userId?: string): Promise<CommunityContext> {
  if (!userId) return defaultContext();
  const settings = await supabase.from('community_settings').select('room_enabled, appreciations_enabled, announcement').eq('id', 1).maybeSingle();
  if (settings.error) return { ...defaultContext(), error: isCommunityUnavailable(settings.error) ? undefined : 'Could not load community access. Try again.' };
  const [today, admin, join, post, member, appeal] = await Promise.all([
    supabase.rpc('community_today'),
    supabase.rpc('is_community_admin'),
    supabase.rpc('can_join_community'),
    supabase.rpc('can_post_community'),
    supabase.from('community_members').select('muted_until, banned_at').eq('user_id', userId).maybeSingle(),
    supabase.from('community_appeals').select('id, user_id, message, status, admin_response, created_at, reviewed_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const error = today.error ?? admin.error ?? join.error ?? post.error ?? member.error ?? appeal.error;
  if (error) return { ...defaultContext(), error: isCommunityUnavailable(error) ? undefined : 'Could not load community access. Try again.' };
  const row = settings.data as Record<string, unknown> | null;
  const membership = member.data as Record<string, unknown> | null;
  const appealRow = appeal.data as Record<string, unknown> | null;
  return {
    available: true,
    dayKey: typeof today.data === 'string' ? today.data : defaultContext().dayKey,
    isAdmin: admin.data === true,
    canJoin: join.data === true,
    canPost: post.data === true,
    settings: {
      roomEnabled: row?.room_enabled === true,
      appreciationsEnabled: row?.appreciations_enabled === true,
      announcement: typeof row?.announcement === 'string' ? row.announcement : '',
    },
    mutedUntil: typeof membership?.muted_until === 'string' ? membership.muted_until : undefined,
    banned: typeof membership?.banned_at === 'string',
    appeal: appealRow ? {
      id: String(appealRow.id),
      userId: String(appealRow.user_id),
      message: String(appealRow.message),
      status: appealRow.status as CommunityAppeal['status'],
      adminResponse: String(appealRow.admin_response ?? ''),
      createdAt: String(appealRow.created_at),
      reviewedAt: typeof appealRow.reviewed_at === 'string' ? appealRow.reviewed_at : undefined,
    } : undefined,
  };
}

export async function fetchAppreciations(dayKey: string, userId?: string): Promise<AppreciationState> {
  const { data, error } = await supabase.from('board_appreciations').select('from_user, to_user').eq('day_key', dayKey);
  if (error) return { counts: {}, mine: new Set() };
  const counts: Record<string, number> = {};
  const mine = new Set<string>();
  for (const row of (data ?? []) as { from_user: string; to_user: string }[]) {
    counts[row.to_user] = (counts[row.to_user] ?? 0) + 1;
    if (row.from_user === userId) mine.add(row.to_user);
  }
  return { counts, mine };
}

export async function giveKudos(toUser: string, period: PaceWindow): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('give_board_kudos', {
    target: toUser, board_window: period, board_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  });
  return error ? { ok: false, error: error.code === 'PGRST202' ? 'Kudos needs the latest community setup.' : error.message } : { ok: true };
}

export async function fetchCommunityMessages(keepVisible: string[] = []): Promise<CommunityMessage[]> {
  const { data, error } = await supabase.rpc('community_inbox', { keep_visible: keepVisible.slice(0, 120) });
  if (error) throw new Error(error.code === 'PGRST202' ? 'Unread catch-up needs the latest community setup.' : 'Could not refresh messages. Try again.');
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id), authorId: String(row.author_id), body: String(row.body), createdAt: String(row.created_at),
    removedAt: typeof row.removed_at === 'string' ? row.removed_at : undefined,
    kind: row.message_kind === 'kudos' || row.message_kind === 'admiration' ? 'kudos' : 'chat',
  }));
}

export async function markCommunityRead(ids: string[]): Promise<boolean> {
  if (!ids.length) return true;
  const { error } = await supabase.rpc('read_community_messages', { message_ids: ids.slice(0, 120) });
  return !error;
}

export async function postCommunityMessage(userId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const clean = body.trim().replace(/\s+/g, ' ');
  if (!clean || clean.length > 240) return { ok: false, error: 'Keep the message between 1 and 240 characters.' };
  if (/(https?:\/\/|www\.|t\.me\/)/i.test(clean)) return { ok: false, error: 'Links are not allowed in the daily room.' };
  if (!userId) return { ok: false, error: 'Sign in first.' };
  const { error } = await supabase.rpc('post_community_message', { message_body: clean });
  return error ? { ok: false, error: error.message.includes('row-level security') ? 'Posting is unavailable, limited, or paused.' : error.message } : { ok: true };
}

export async function reportCommunityMessage(messageId: string, reporterId: string): Promise<boolean> {
  const { error } = await supabase.from('community_reports').upsert({ message_id: messageId, reporter_id: reporterId, reason: 'Unhelpful or disrespectful' }, { onConflict: 'message_id,reporter_id', ignoreDuplicates: true });
  return !error;
}

export async function fetchAdminCommunity(dayKey: string): Promise<{
  reports: CommunityReport[]; members: CommunityMemberState[]; appeals: CommunityAppeal[]; audit: CommunityAuditEntry[];
}> {
  const [reports, members, appeals, audit] = await Promise.all([
    supabase.from('community_reports').select('id, message_id, reporter_id, reason, created_at').eq('status', 'open').order('created_at', { ascending: false }),
    supabase.from('community_members').select('user_id, display_name, muted_until, banned_at, moderation_note').order('updated_at', { ascending: false }),
    supabase.from('community_appeals').select('id, user_id, message, status, admin_response, created_at, reviewed_at').eq('status', 'open').order('created_at', { ascending: true }),
    supabase.from('community_audit_log').select('id, action, target_user_id, reason, created_at').order('created_at', { ascending: false }).limit(30),
  ]);
  void dayKey;
  const error = reports.error ?? members.error ?? appeals.error ?? audit.error;
  if (error) throw new Error('Could not refresh moderation queues. Try again.');
  return {
    reports: ((reports.data ?? []) as Record<string, unknown>[]).map((row) => ({ id: String(row.id), messageId: String(row.message_id), reporterId: String(row.reporter_id), reason: String(row.reason), createdAt: String(row.created_at) })),
    members: ((members.data ?? []) as Record<string, unknown>[]).map((row) => ({ userId: String(row.user_id), displayName: String(row.display_name ?? ''), mutedUntil: typeof row.muted_until === 'string' ? row.muted_until : undefined, banned: typeof row.banned_at === 'string', note: String(row.moderation_note ?? '') })),
    appeals: ((appeals.data ?? []) as Record<string, unknown>[]).map((row) => ({ id: String(row.id), userId: String(row.user_id), message: String(row.message), status: row.status as CommunityAppeal['status'], adminResponse: String(row.admin_response ?? ''), createdAt: String(row.created_at), reviewedAt: typeof row.reviewed_at === 'string' ? row.reviewed_at : undefined })),
    audit: ((audit.data ?? []) as Record<string, unknown>[]).map((row) => ({ id: Number(row.id), action: String(row.action), targetUserId: typeof row.target_user_id === 'string' ? row.target_user_id : undefined, reason: String(row.reason ?? ''), createdAt: String(row.created_at) })),
  };
}

export async function fetchReportedMessages(ids: string[]): Promise<CommunityMessage[]> {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('community_messages')
    .select('id, author_id, body, created_at, removed_at').in('id', [...new Set(ids)]);
  if (error) throw new Error('Could not load reported messages.');
  return (data ?? []).map((row) => ({
    id: String(row.id), authorId: String(row.author_id), body: String(row.body),
    createdAt: String(row.created_at), removedAt: row.removed_at ?? undefined,
  }));
}

export async function submitCommunityAppeal(message: string): Promise<{ ok: boolean; error?: string }> {
  const clean = message.trim().replace(/\s+/g, ' ');
  if (clean.length < 20 || clean.length > 600) return { ok: false, error: 'Write between 20 and 600 characters.' };
  const { error } = await supabase.rpc('submit_community_appeal', { appeal_message: clean });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function reviewCommunityAppeal(appealId: string, decision: 'approve' | 'decline', response = ''): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('review_community_appeal', { target_appeal: appealId, decision, response_note: response.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function saveCommunitySettings(settings: CommunitySettings): Promise<boolean> {
  const { error } = await supabase.rpc('set_community_settings', {
    next_room_enabled: settings.roomEnabled,
    next_appreciations_enabled: settings.appreciationsEnabled,
    next_announcement: settings.announcement,
  });
  return !error;
}

export async function moderateCommunityMember(userId: string, action: 'mute_24h' | 'mute_7d' | 'ban' | 'restore', note = ''): Promise<boolean> {
  const { error } = await supabase.rpc('moderate_community_member', { target: userId, moderation_action: action, note });
  return !error;
}

export async function removeCommunityMessage(messageId: string, note = ''): Promise<boolean> {
  const { error } = await supabase.rpc('remove_community_message', { target_message: messageId, note });
  return !error;
}

export async function dismissCommunityReport(reportId: string): Promise<boolean> {
  const { error } = await supabase.rpc('dismiss_community_report', { target_report: reportId });
  return !error;
}
