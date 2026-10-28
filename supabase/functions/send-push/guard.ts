// Pure request checks for send-push. Kept free of Deno/JSR imports so the
// rules that protect every user's device can be unit tested with Vitest.

export const PUSH_SECRET_HEADER = 'x-push-secret';
export const MIN_SECRET_LENGTH = 32;
export const MAX_TARGETS = 500;
export const MAX_TITLE_LENGTH = 100;
export const MAX_BODY_LENGTH = 300;

// Android channels registered by the app (src/lib/notifications.ts).
export const PUSH_CHANNELS = ['public-hub', 'private-hub', 'admin-hub', 'daily-briefing'] as const;
export type PushChannel = (typeof PUSH_CHANNELS)[number];
const DEFAULT_CHANNEL: PushChannel = 'public-hub';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PushRequest {
  userIds: string[];
  title: string;
  body: string;
  data: Record<string, string>;
  channel: PushChannel;
  /** Data only, nothing shown: wakes the app to refresh a home-screen widget. */
  silent: boolean;
}

/**
 * Only the database (pg_net, see supabase/push_dispatch.sql) knows the shared
 * secret. Fails closed when the secret is missing or too short to be safe.
 */
export function isAuthorizedCaller(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected || expected.length < MIN_SECRET_LENGTH || !provided) return false;
  const a = new TextEncoder().encode(provided);
  const b = new TextEncoder().encode(expected);
  // Constant-time compare so response timing does not leak the secret.
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i];
  return diff === 0;
}

function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function parsePushRequest(raw: unknown): { ok: true; request: PushRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'Body must be a JSON object' };
  const input = raw as Record<string, unknown>;

  const ids = Array.isArray(input.userIds) ? input.userIds : input.userId !== undefined ? [input.userId] : [];
  if (ids.length === 0 || !ids.every((id) => typeof id === 'string' && UUID.test(id))) {
    return { ok: false, error: 'userIds must be valid user ids' };
  }
  const userIds = [...new Set(ids as string[])];
  if (userIds.length > MAX_TARGETS) return { ok: false, error: `At most ${MAX_TARGETS} recipients per request` };

  if (typeof input.title !== 'string' || !input.title.trim()) return { ok: false, error: 'title is required' };
  const body = typeof input.body === 'string' ? input.body : '';

  // FCM requires every data value to be a string.
  const data: Record<string, string> = {};
  if (input.data && typeof input.data === 'object' && !Array.isArray(input.data)) {
    for (const [key, value] of Object.entries(input.data as Record<string, unknown>)) {
      if (typeof value === 'string') data[key] = value;
      else if (typeof value === 'number' || typeof value === 'boolean') data[key] = String(value);
    }
  }
  const channel = (PUSH_CHANNELS as readonly string[]).includes(data.channel) ? (data.channel as PushChannel) : DEFAULT_CHANNEL;

  return {
    ok: true,
    request: {
      userIds,
      title: clip(input.title, MAX_TITLE_LENGTH),
      body: clip(body, MAX_BODY_LENGTH),
      data,
      channel,
      silent: data.silent === 'true',
    },
  };
}

/**
 * A token is only deleted when FCM says the device is gone. A malformed message
 * also returns INVALID_ARGUMENT, and must not wipe a working device.
 */
export function isStaleTokenError(status: number, errorBody: unknown): boolean {
  const error = (errorBody as { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } } | null)?.error;
  const code = error?.details?.find((detail) => detail?.errorCode)?.errorCode ?? error?.status;
  if (code === 'UNREGISTERED' || status === 404) return true;
  return code === 'INVALID_ARGUMENT' && /registration token/i.test(error?.message ?? '');
}
