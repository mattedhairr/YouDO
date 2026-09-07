import { describe, expect, it } from 'vitest';
import { accountSessionDevice, parseAccountSessions, sessionLastSeenLabel } from './accountSessions';

describe('account sessions', () => {
  it('accepts only complete server rows', () => {
    expect(parseAccountSessions([
      { session_id: '00000000-0000-4000-8000-000000000001', created_at: '2026-09-01T00:00:00Z', last_active_at: '2026-09-02T00:00:00Z', user_agent: 'test', is_current: true, can_revoke: false },
      { session_id: 'bad', created_at: 'never', last_active_at: null },
    ])).toHaveLength(1);
  });

  it('describes common app and browser devices without exposing the raw agent', () => {
    expect(accountSessionDevice('Mozilla/5.0 (Linux; Android 14; Pixel; wv) Chrome/120').device).toBe('Android device');
    expect(accountSessionDevice('Mozilla/5.0 (Linux; Android 14; Pixel; wv) Chrome/120').detail).toBe('YouDO app');
    expect(accountSessionDevice('Mozilla/5.0 (Windows NT 10.0) Edg/120')).toEqual({ device: 'Windows PC', detail: 'Edge' });
  });

  it('keeps recent activity labels compact', () => {
    const now = Date.parse('2026-09-07T12:00:00Z');
    expect(sessionLastSeenLabel('2026-09-07T11:59:40Z', now)).toBe('Active now');
    expect(sessionLastSeenLabel('2026-09-07T11:40:00Z', now)).toBe('20m ago');
    expect(sessionLastSeenLabel('2026-09-07T09:00:00Z', now)).toBe('3h ago');
  });
});
