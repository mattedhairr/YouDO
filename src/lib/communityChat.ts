import { supabase } from './supabase';
import type { CommunityMessage } from './community';

export interface ChatMessage extends CommunityMessage {
  sequence: number;
  editedAt?: string;
  mentionIds: string[];
  delivery: 'pending' | 'sent' | 'failed';
  error?: string;
}
export interface ChatSnapshot { messages: ChatMessage[]; scrollTop?: number; hasOlder: boolean }
const cache = new Map<string, ChatSnapshot>();
let cacheGeneration = 0;
let cacheAccount: string | null | undefined;
export const CHAT_PAGE_SIZE = 30;
export const CHAT_HISTORY_LIMIT = 120;

export function chatCacheGeneration() { return cacheGeneration; }
export function clearChatCache(userId?: string) {
  cacheGeneration++;
  if (userId) cache.delete(userId); else cache.clear();
}
export function activeChatMessages(messages: ChatMessage[], now = Date.now()): ChatMessage[] {
  return messages.filter(message => !message.removedAt && Date.parse(message.expiresAt) > now);
}
export function readChatCache(userId: string): ChatSnapshot {
  const saved = cache.get(userId);
  return saved ? { ...saved, messages: activeChatMessages(saved.messages).map(message=>message.delivery==='pending'
    ? {...message,delivery:'failed' as const,error:'Send status is unknown. Retrying will not send a duplicate.'}:message) } : { messages: [], hasOlder: false };
}
export function saveChatCache(userId: string, snapshot: ChatSnapshot, generation = cacheGeneration) {
  // A component may unmount after sign-out or membership revocation. Its cleanup
  // must not repopulate a cache that the access boundary has already cleared.
  if (generation !== cacheGeneration || (cacheAccount !== undefined && cacheAccount !== userId)) return;
  // Only the current account is cached. Sign-out/account switch clears it below.
  for (const key of cache.keys()) if (key !== userId) cache.delete(key);
  cache.set(userId, { ...snapshot, messages: activeChatMessages(snapshot.messages).slice(-CHAT_HISTORY_LIMIT) });
}
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
    const next = session?.user.id ?? null;
    if (event === 'SIGNED_OUT' || (cacheAccount !== undefined && cacheAccount !== next)) clearChatCache();
    cacheAccount = next;
  }
});

export function parseChatMessage(input: unknown): ChatMessage {
  const row = input as Record<string, unknown> | null;
  if (!row || typeof row.id !== 'string' || typeof row.author_id !== 'string' || typeof row.body !== 'string'
    || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
    || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at)) || !Number.isSafeInteger(Number(row.sequence))) {
    throw new Error('Community returned an unreadable message. Please refresh.');
  }
  return { id: row.id, authorId: row.author_id, body: row.body, createdAt: row.created_at, expiresAt: row.expires_at,
    sequence: Number(row.sequence), editedAt: typeof row.edited_at === 'string' ? row.edited_at : undefined,
    removedAt: typeof row.removed_at === 'string' ? row.removed_at : undefined,
    replyToId: typeof row.reply_to === 'string' ? row.reply_to : undefined,
    kind: row.message_kind === 'kudos' ? 'kudos' : 'chat', delivery: 'sent',
    mentionIds: Array.isArray(row.mention_ids) ? row.mention_ids.filter((id): id is string => typeof id === 'string') : [],
  };
}
export function mergeChatPage(current: ChatMessage[], page: ChatMessage[]): ChatMessage[] {
  const byId = new Map(current.map(message => [message.id, message]));
  for (const message of page) byId.set(message.id, message);
  return activeChatMessages([...byId.values()]).sort((a,b) => {
    // Server sequence owns conversation order; an incorrect device clock must
    // never move an unsent message into the middle of the received history.
    if (a.delivery === 'sent' && b.delivery === 'sent') return a.sequence-b.sequence;
    if (a.delivery === 'sent') return -1;
    if (b.delivery === 'sent') return 1;
    return Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id.localeCompare(b.id);
  }).slice(-CHAT_HISTORY_LIMIT);
}
export function pendingChatMessage(userId: string, body: string, replyToId?: string, mentionIds: string[] = [], now = Date.now()): ChatMessage {
  return { id: crypto.randomUUID(), authorId: userId, body: body.trim().replace(/\s+/g,' '), replyToId, mentionIds,
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now+86_400_000).toISOString(), sequence: 0, kind: 'chat', delivery: 'pending' };
}
export async function fetchChatPage(beforeSequence?: number): Promise<ChatMessage[]> {
  const { data, error } = await supabase.rpc('community_chat_page', { before_sequence: beforeSequence ?? null });
  if (error) throw new Error('Could not refresh chat. Your conversation has not been cleared.');
  return (Array.isArray(data) ? data : []).map(parseChatMessage);
}
export async function sendChatMessage(message: ChatMessage): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('send_community_message', {
    client_id: message.id, message_body: message.body, reply_to_message: message.replyToId ?? null,
    recipients: message.mentionIds, expected_author: message.authorId,
  });
  if (error) throw new Error(error.message || 'Could not send. Tap Retry.');
  return parseChatMessage(data);
}
export async function editChatMessage(id: string, body: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc('edit_community_message', { target_message: id, message_body: body });
  if (error) throw new Error(error.message);
  return parseChatMessage(data);
}
export async function deleteChatMessage(id: string): Promise<void> {
  const { error } = await supabase.rpc('delete_community_message', { target_message: id });
  if (error) throw new Error(error.message);
}
