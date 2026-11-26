import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {}, supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' }));

import {
  activeLabel, can, formatBytes, isMuted, parseAdminPerson, parseCleanupPreview, parseGrowthReport,
  parsePeoplePage, personLabel, returnRate, lastActive,
} from './adminHub';

const NOW = Date.parse('2026-11-24T12:00:00Z');

describe('who can do what', () => {
  it('gives the owner everything', () => {
    for (const power of ['moderate', 'emails', 'staff', 'broadcast', 'roomSwitches', 'money', 'growth', 'deleteAccounts'] as const) {
      expect(can('owner', power)).toBe(true);
    }
  });

  it('lets admins moderate, run hashtags and quotes and look people up, nothing more', () => {
    expect(can('admin', 'moderate')).toBe(true);
    expect(can('admin', 'hashtags')).toBe(true);
    expect(can('admin', 'quotes')).toBe(true);
    expect(can('admin', 'people')).toBe(true);
    for (const power of ['emails', 'staff', 'broadcast', 'roomSwitches', 'money', 'growth', 'deleteAccounts'] as const) {
      expect(can('admin', power)).toBe(false);
    }
  });

  it('gives everyone else nothing', () => {
    expect(can(null, 'moderate')).toBe(false);
    expect(can(undefined, 'people')).toBe(false);
  });
});

describe('a person', () => {
  const adminView = {
    user_id: 'u1', username: 'meera_s', display_name: 'Meera Shah', created_at: '2026-10-03T10:00:00Z',
    last_active_at: '2026-11-24T10:00:00Z', on_board: true, board_week_ms: 15_000_000, room_count: 2,
    message_count: 31, reported_count: 0, badge_visible: false, moderation_note: '', hashtag: 'UPSC-2027',
  };

  it('reads what an admin gets, with no owner-only fields', () => {
    const person = parseAdminPerson(adminView)!;
    expect(person).toMatchObject({ id: 'u1', username: 'meera_s', name: 'Meera Shah', onBoard: true, rooms: 2, messages: 31, hashtag: 'UPSC-2027' });
    expect(person.email).toBeUndefined();
    expect(person.confirmed).toBeUndefined();
    expect(person.backupBytes).toBeUndefined();
    expect(person.note).toBeUndefined();
  });

  it('reads the owner-only fields when the server sends them', () => {
    const person = parseAdminPerson({ ...adminView, email: 'meera@example.com', email_confirmed_at: '2026-10-03T10:05:00Z', backup_bytes: 43_000, junk: 'empty', staff_role: 'admin', is_backer: true })!;
    expect(person).toMatchObject({ email: 'meera@example.com', confirmed: true, backupBytes: 43_000, junk: 'empty', role: 'admin', backer: true });
  });

  it('marks an owner view without a confirmation date as unconfirmed', () => {
    expect(parseAdminPerson({ user_id: 'u2', email: 'x@example.com', created_at: '2026-11-01T00:00:00Z' })!.confirmed).toBe(false);
  });

  it('ignores rows without an id and unknown roles', () => {
    expect(parseAdminPerson(null)).toBeNull();
    expect(parseAdminPerson({ username: 'x' })).toBeNull();
    expect(parseAdminPerson({ user_id: 'u3', staff_role: 'superuser' })!.role).toBeUndefined();
  });

  it('names people, falling back to the username and then to "No name yet"', () => {
    expect(personLabel({ name: 'Meera Shah', username: 'meera_s' })).toBe('Meera Shah');
    expect(personLabel({ username: 'meera_s' })).toBe('@meera_s');
    expect(personLabel({ email: 'meera@example.com' })).toBe('meera@example.com');
    expect(personLabel({})).toBe('No name yet');
  });

  it('says only when someone was last active under their name', () => {
    const now = Date.parse('2026-11-26T12:00:00Z');
    expect(lastActive({ lastActive: '2026-11-26T10:00:00Z' }, now)).toBe('Active 2 h ago');
    expect(lastActive({ lastActive: '2026-11-26T11:58:00Z' }, now)).toBe('Active now');
    expect(lastActive({}, now)).toBe('Never active');
  });

  it('counts a mute only while it lasts', () => {
    expect(isMuted({ mutedUntil: '2026-11-25T00:00:00Z' }, NOW)).toBe(true);
    expect(isMuted({ mutedUntil: '2026-11-20T00:00:00Z' }, NOW)).toBe(false);
    expect(isMuted({}, NOW)).toBe(false);
  });
});

describe('labels', () => {
  it('says how long ago someone was active', () => {
    expect(activeLabel(undefined, NOW)).toBe('never');
    expect(activeLabel('2026-11-24T11:55:00Z', NOW)).toBe('now');
    expect(activeLabel('2026-11-24T11:30:00Z', NOW)).toBe('30 min ago');
    expect(activeLabel('2026-11-24T09:00:00Z', NOW)).toBe('3 h ago');
    expect(activeLabel('2026-11-23T10:00:00Z', NOW)).toBe('yesterday');
    expect(activeLabel('2026-11-10T12:00:00Z', NOW)).toBe('14 days ago');
    expect(activeLabel('2026-06-01T12:00:00Z', NOW)).toBe('6 months ago');
  });

  it('formats sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(43_000)).toBe('42 KB');
    expect(formatBytes(4.5 * 1024 * 1024)).toBe('4.5 MB');
    expect(formatBytes(41 * 1024 * 1024)).toBe('41 MB');
  });
});

describe('server answers', () => {
  it('reads a page of people with its counts', () => {
    const page = parsePeoplePage({ total: 2, counts: { all: 222, staff: 3, muted: 2, banned: 1 }, people: [{ user_id: 'a' }, { nope: 1 }, { user_id: 'b' }] });
    expect(page.total).toBe(2);
    expect(page.counts).toEqual({ all: 222, staff: 3, muted: 2, banned: 1 });
    expect(page.people.map((person) => person.id)).toEqual(['a', 'b']);
    expect(parsePeoplePage(null).people).toEqual([]);
  });

  it('reads the growth report', () => {
    const report = parseGrowthReport({
      accounts: 222, confirmed: 191, started: 40, came_back: 10, active_7d: 9, active_30d: 21, new_7d: 14, new_7d_confirmed: 9, studying_now: 3,
      weeks: [{ week: '2026-11-16', signups: 14, confirmed: 9, started: 4, came_back: 1, deleted: 2, active_7d: 3 }],
      before_v8: { signups: 120, started: 20, came_back: 4 }, since_v8: { signups: 102, started: 20, came_back: 6 },
      cleanup: { unconfirmed: 31, empty: 104 }, database_bytes: 43_000_000, largest_tables: [{ name: 'user_backups', bytes: 30_000_000 }],
    })!;
    expect(report.accounts).toBe(222);
    expect(report.weeks[0]).toEqual({ week: '2026-11-16', signups: 14, confirmed: 9, started: 4, cameBack: 1, deleted: 2, active7d: 3 });
    expect(report.sinceV8).toEqual({ signups: 102, started: 20, cameBack: 6 });
    expect(report.cleanup).toEqual({ unconfirmed: 31, empty: 104 });
    expect(report.largestTables[0].name).toBe('user_backups');
    expect(parseGrowthReport(null)).toBeNull();
  });

  it('gives a return rate only with enough people', () => {
    expect(returnRate({ signups: 100, started: 20, cameBack: 5 })).toBe(25);
    expect(returnRate({ signups: 10, started: 3, cameBack: 1 })).toBeNull();
  });

  it('reads the cleanup preview with no people in it', () => {
    const preview = parseCleanupPreview({ unconfirmed: 1, empty: 1, sample: [{ reason: 'unconfirmed', created_at: '2026-11-02T00:00:00Z', confirmed: false }, { reason: 'empty', created_at: '2026-09-28T00:00:00Z', confirmed: true, last_active_at: '2026-09-29T00:00:00Z' }] });
    expect(preview.sample).toEqual([
      { reason: 'unconfirmed', createdAt: '2026-11-02T00:00:00Z', confirmed: false, lastActive: undefined },
      { reason: 'empty', createdAt: '2026-09-28T00:00:00Z', confirmed: true, lastActive: '2026-09-29T00:00:00Z' },
    ]);
  });
});
