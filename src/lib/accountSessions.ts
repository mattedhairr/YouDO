import { supabase } from './supabase';

export interface AccountSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  userAgent: string;
  current: boolean;
  canRevoke: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseAccountSessions(value: unknown): AccountSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const row = entry as Record<string, unknown>;
    const id = typeof row.session_id === 'string' ? row.session_id : '';
    const createdAt = typeof row.created_at === 'string' ? row.created_at : '';
    const lastActiveAt = typeof row.last_active_at === 'string' ? row.last_active_at : '';
    if (!UUID.test(id) || !Number.isFinite(Date.parse(createdAt)) || !Number.isFinite(Date.parse(lastActiveAt))) return [];
    return [{
      id,
      createdAt,
      lastActiveAt,
      userAgent: typeof row.user_agent === 'string' ? row.user_agent.slice(0, 500) : '',
      current: row.is_current === true,
      canRevoke: row.can_revoke === true,
    }];
  });
}

export function accountSessionDevice(userAgent: string): { device: string; detail: string } {
  const ua = userAgent.toLowerCase();
  const app = /;\s*wv\)|\bwv\b/.test(ua) || ua.includes('youdo');
  const device = ua.includes('iphone') ? 'iPhone'
    : ua.includes('ipad') ? 'iPad'
      : ua.includes('android') ? 'Android device'
        : ua.includes('windows') ? 'Windows PC'
          : ua.includes('macintosh') || ua.includes('mac os') ? 'Mac'
            : ua.includes('linux') ? 'Linux device'
              : 'Unknown device';
  const browser = ua.includes('edg/') ? 'Edge'
    : ua.includes('firefox/') ? 'Firefox'
      : ua.includes('chrome/') || ua.includes('crios/') ? 'Chrome'
        : ua.includes('safari/') ? 'Safari'
          : 'Browser';
  return { device, detail: app ? 'YouDO app' : browser };
}

export function sessionLastSeenLabel(iso: string, now = Date.now()): string {
  const elapsed = Math.max(0, now - Date.parse(iso));
  if (elapsed < 60_000) return 'Active now';
  if (elapsed < 60 * 60_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 24 * 60 * 60_000) return `${Math.floor(elapsed / (60 * 60_000))}h ago`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(iso));
}

export async function listAccountSessions(): Promise<AccountSession[]> {
  const { data, error } = await supabase.rpc('account_sessions');
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || error.message.toLowerCase().includes('schema cache');
    throw new Error(missing ? 'Signed-in devices need the latest account security setup.' : 'Could not load signed-in devices. Try again.');
  }
  return parseAccountSessions(data);
}

export async function revokeAccountSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  if (!UUID.test(sessionId)) return { ok: false, error: 'That session is not valid.' };
  const { data, error } = await supabase.rpc('revoke_account_session', { target_session: sessionId });
  if (error) return { ok: false, error: error.message || 'Could not sign out that device.' };
  return data === true ? { ok: true } : { ok: false, error: 'That session is no longer active.' };
}
