import { supabase } from './supabase';

/** What a Board update can carry besides its text (supabase/board_update_extras.sql). */
export const UPDATE_REACTIONS = ['👍', '❤️', '🔥', '🎉', '🙏'] as const;
export type UpdateReaction = (typeof UPDATE_REACTIONS)[number];
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;
export const POLL_OPTION_MAX = 60;
export const REPLY_MAX = 500;
export const ACTION_LABEL_MAX = 24;
/** Action links may only open YouDO's own GitHub or Telegram (checked again on the server). */
export const ACTION_LINK_PATTERN = /^https:\/\/(github\.com\/mattedhairr\/YouDO(\/\S*)?|t\.me\/[A-Za-z0-9_+/-]+)$/;

export type UpdateAction =
  | { kind: 'updater'; label: string }
  | { kind: 'link'; label: string; url: string };

export interface UpdatePoll {
  options: string[];
  closed: boolean;
  myChoice: number | null;
  /** Per option; only after voting, once ended, or for admins. */
  counts: number[] | null;
  total: number;
}

export interface UpdateState {
  revision: number;
  poll: UpdatePoll | null;
  reactions: Partial<Record<UpdateReaction, number>>;
  myReaction: UpdateReaction | null;
  replies: boolean;
  replied: boolean;
  action: UpdateAction | null;
}

export interface UpdateExtrasDraft {
  pollOptions: string[];
  allowReplies: boolean;
  action: UpdateAction | null;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
const isReaction = (value: unknown): value is UpdateReaction =>
  typeof value === 'string' && (UPDATE_REACTIONS as readonly string[]).includes(value);

export function parseUpdateAction(value: unknown): UpdateAction | null {
  const row = record(value);
  const label = typeof row?.label === 'string' ? row.label.trim().slice(0, ACTION_LABEL_MAX) : '';
  if (!row || !label) return null;
  if (row.kind === 'updater') return { kind: 'updater', label };
  if (row.kind === 'link' && typeof row.url === 'string' && ACTION_LINK_PATTERN.test(row.url)) {
    return { kind: 'link', label, url: row.url };
  }
  return null;
}

export function parseUpdateState(value: unknown): UpdateState | null {
  const row = record(value);
  if (!row || !Number.isFinite(Number(row.revision))) return null;
  const pollRow = record(row.poll);
  const options = Array.isArray(pollRow?.options) ? pollRow!.options.filter((o): o is string => typeof o === 'string') : [];
  const poll: UpdatePoll | null = pollRow && options.length >= POLL_MIN_OPTIONS ? {
    options,
    closed: pollRow.closed === true,
    myChoice: Number.isInteger(pollRow.my_choice) && (pollRow.my_choice as number) < options.length ? (pollRow.my_choice as number) : null,
    counts: Array.isArray(pollRow.counts) && pollRow.counts.length === options.length
      ? pollRow.counts.map((n) => Math.max(0, Number(n) || 0))
      : null,
    total: Math.max(0, Number(pollRow.total) || 0),
  } : null;
  const reactions: UpdateState['reactions'] = {};
  const reactionRow = record(row.reactions);
  if (reactionRow) {
    for (const [emoji, count] of Object.entries(reactionRow)) {
      if (isReaction(emoji) && Number(count) > 0) reactions[emoji] = Number(count);
    }
  }
  return {
    revision: Number(row.revision),
    poll,
    reactions,
    myReaction: isReaction(row.my_reaction) ? row.my_reaction : null,
    replies: row.replies === true,
    replied: row.replied === true,
    action: parseUpdateAction(row.action),
  };
}

/** The draft as the server stores it, for comparing with what is published. */
export function draftSignature(text: string, draft: UpdateExtrasDraft): string {
  // An empty update carries nothing: clearing it drops any poll, replies or action.
  if (!text.trim()) return JSON.stringify(['']);
  const options = draft.pollOptions.map((o) => o.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return JSON.stringify([text.trim(), options.length ? options : null, draft.allowReplies, draft.action]);
}

export function draftFromState(state: UpdateState | null): UpdateExtrasDraft {
  return {
    pollOptions: state?.poll?.options ?? [],
    allowReplies: state?.replies ?? false,
    action: state?.action ?? null,
  };
}

export const EMPTY_UPDATE_DRAFT: UpdateExtrasDraft = { pollOptions: [], allowReplies: false, action: null };

/**
 * What Reset does: take down the update everyone sees ('live'), only empty an
 * unpublished draft ('draft'), or nothing to reset (null).
 */
export function updateResetKind(publishedText: string, text: string, draft: UpdateExtrasDraft): 'live' | 'draft' | null {
  if (publishedText.trim()) return 'live';
  return text.trim() || draft.pollOptions.length > 0 || draft.allowReplies || draft.action ? 'draft' : null;
}

/** A problem to show before publishing, or null when the draft is fine. */
export function validateDraft(text: string, draft: UpdateExtrasDraft): string | null {
  if (!text.trim()) return null;
  const options = draft.pollOptions.map((o) => o.trim()).filter(Boolean);
  if (options.length > 0) {
    if (options.length < POLL_MIN_OPTIONS) return 'A poll needs at least 2 options.';
    if (options.length > POLL_MAX_OPTIONS) return 'A poll can have up to 6 options.';
    if (options.some((o) => o.length > POLL_OPTION_MAX)) return 'Keep each poll option under 60 characters.';
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return 'Poll options must be different.';
  }
  if (draft.action) {
    if (draft.action.label.trim().length > ACTION_LABEL_MAX) return 'Keep the button label under 24 characters.';
    if (draft.action.kind === 'link' && !ACTION_LINK_PATTERN.test(draft.action.url.trim())) {
      return 'Links can only open YouDO on GitHub or Telegram.';
    }
  }
  return null;
}

export const SERVER_UPDATE_NEEDED = 'Polls and replies need a server update first.';
const message = (error: { code?: string; message?: string }, fallback: string) =>
  error.code === 'PGRST202' ? SERVER_UPDATE_NEEDED : error.message || fallback;

export async function fetchUpdateState(): Promise<UpdateState | null> {
  const { data, error } = await supabase.rpc('community_update_state');
  if (error) return null;
  return parseUpdateState(data);
}

export async function publishCommunityUpdate(text: string, draft: UpdateExtrasDraft): Promise<{ ok: boolean; error?: string }> {
  const options = draft.pollOptions.map((o) => o.trim()).filter(Boolean);
  const { error } = await supabase.rpc('publish_community_update', {
    next_announcement: text.trim(),
    poll_options: options.length ? options : null,
    allow_replies: draft.allowReplies,
    action_kind: draft.action?.kind ?? null,
    action_label: draft.action?.label.trim() || null,
    action_url: draft.action?.kind === 'link' ? draft.action.url.trim() : null,
  });
  return error ? { ok: false, error: message(error, 'Could not publish the update.') } : { ok: true };
}

export async function voteOnUpdate(option: number): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('vote_community_update', { option_index: option });
  return error ? { ok: false, error: message(error, 'Could not save your vote.') } : { ok: true };
}

export async function reactToUpdate(reaction: UpdateReaction | null): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('react_community_update', { reaction: reaction ?? '' });
  return error ? { ok: false, error: message(error, 'Could not save your reaction.') } : { ok: true };
}

export async function replyToUpdate(text: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('reply_community_update', { reply_text: text.trim() });
  return error ? { ok: false, error: message(error, 'Could not send your reply.') } : { ok: true };
}

export async function closeUpdatePoll(): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('close_community_poll');
  return error ? { ok: false, error: message(error, 'Could not end the poll.') } : { ok: true };
}

export interface UpdateReply { userId: string; body: string; createdAt: string }

export async function fetchUpdateReplies(): Promise<UpdateReply[]> {
  const { data, error } = await supabase.rpc('admin_community_update_replies');
  if (error || !Array.isArray(data)) return [];
  return data.flatMap((value) => {
    const row = record(value);
    return row && typeof row.user_id === 'string' && typeof row.body === 'string'
      ? [{ userId: row.user_id, body: row.body, createdAt: String(row.created_at ?? '') }]
      : [];
  });
}

/** Where the update's action button goes: the in-app updater, or an allowed link. */
export const OPEN_APP_UPDATES_EVENT = 'youdo-open-app-updates';
