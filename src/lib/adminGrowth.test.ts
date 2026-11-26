import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {}, supabaseAnonKey: '', supabaseUrl: '' }));

import {
  accountTotals, arrivalsReadout, biggestDrop, changeAgainst, cleanupLine, growthFunnel, parseCleanupList, parseReleases, peopleReadout, sameDayLastWeek,
  usualDay, usualWeek, worthALook,
} from './adminGrowth';
import type { GrowthDay, GrowthReport, GrowthWeek } from './adminHub';

// Made-up numbers.
const growth = {
  accounts: 150, confirmed: 120, started: 45, cameBack: 27, active30d: 20,
  deleted: { count: 14, confirmed: 2, started: 0, cameBack: 0 },
} as GrowthReport;

describe('account totals', () => {
  it('counts the accounts there are now, with deleted ones only in the note', () => {
    const totals = accountTotals(growth);
    expect(totals.tiles.map((t) => t.value)).toEqual([150, 120, 30, 20]);
    expect(totals.tiles.map((t) => t.label)).toEqual(['Accounts', 'Confirmed', 'Not yet', 'Active 30d']);
    expect(totals.note).toContain('14 deleted so far');
    expect(accountTotals({ ...growth, deleted: { count: 0, confirmed: 0, started: 0, cameBack: 0 } }).note).not.toContain('deleted');
  });
});

describe('growth', () => {
  it('says how a number compares, in words', () => {
    expect(changeAgainst(38, 32, 'last week')).toEqual({ label: '▲ 6 more than last week', trend: 'up' });
    expect(changeAgainst(7, 9, 'a usual week')).toEqual({ label: '▼ 2 fewer than a usual week', trend: 'down' });
    expect(changeAgainst(4, 4, 'last week')).toEqual({ label: 'Same as last week', trend: 'same' });
  });

  it('counts deleted accounts in the funnel, so a cleanup never rewrites it', () => {
    const steps = growthFunnel(growth);
    expect(steps.map((step) => step.count)).toEqual([164, 122, 45, 27, 20]);
    expect(steps[1].percent).toBe(74);
    expect(steps[2].percent).toBe(37);
    expect(steps[3].percent).toBe(60);
  });

  it('finds where most people stop', () => {
    expect(biggestDrop(growthFunnel(growth))).toEqual({ from: 'Confirmed their email', to: 'Made a plan or joined the Board', lost: 77 });
  });
});

// 30 made-up days: 1–20 Nov before counting, 21–30 Nov counted, 30 Nov is today.
const iso = (n: number) => `2026-11-${String(n).padStart(2, '0')}`;
const opened = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 16, 18, 20, 14, 22, 16, 18, 21, 9, 5];
const days: GrowthDay[] = opened.map((count, index) => ({
  day: iso(index + 1), opened: count, signedIn: count - Math.floor(count / 3), withoutAccount: Math.floor(count / 3), newAccounts: 0, newConfirmed: 0, studied: 2,
}));
const week = (n: number, signups: number, deleted = 0): GrowthWeek => ({ week: `2026-09-${String(n).padStart(2, '0')}`, signups, confirmed: signups - 1, started: 2, cameBack: 1, deleted, active7d: 1 });
const report = {
  ...growth,
  days,
  opensSince: '2026-11-21',
  thisWeek: { opened: 38, withoutAccount: 11, regulars: 9, newAccounts: 7 },
  lastWeek: { opened: 32, withoutAccount: 9, regulars: 7, newAccounts: 9 },
  weeks: [week(1, 11), week(8, 9, 2), week(15, 6), week(22, 7)],
  cleanup: { unconfirmed: 0, empty: 0 },
  databaseBytes: 40 * 1024 * 1024,
  largestTables: [],
} as GrowthReport;
const name = (day: string) => `day ${day.slice(8)}`;

describe('people using YouDO', () => {
  it('a usual day is the average of counted, finished days', () => {
    expect(usualDay(days, report.opensSince)).toBe(17); // 21–29 Nov, not today
    expect(usualDay(days, undefined)).toBeNull();
    expect(usualDay(days.slice(0, 22), report.opensSince)).toBeNull(); // one counted day is not enough
  });

  it('shows this week against last until a day is tapped', () => {
    expect(peopleReadout(report, null, name)).toMatchObject({
      when: 'This week', picked: false, value: 38, change: { label: '▲ 6 more than last week' },
      facts: [{ value: 27, label: 'signed in' }, { value: 11, label: 'without an account' }, { value: 9, label: 'regulars, 3+ days' }],
    });
    expect(peopleReadout({ ...report, opensSince: undefined }, null, name)).toMatchObject({ value: null, note: 'Counting starts once people install v9.' });
  });

  it('a tapped day is compared with a usual day; today has no comparison yet', () => {
    expect(peopleReadout(report, 24, name)).toMatchObject({
      when: 'day 25', picked: true, value: 22, change: { label: '▲ 5 more than a usual day', trend: 'up' },
      facts: [{ value: 15 }, { value: 7 }, { value: 17, label: 'a usual day' }],
    });
    expect(peopleReadout(report, 29, name)).toMatchObject({ when: 'Today so far', value: 5, change: undefined });
    expect(peopleReadout(report, 3, name)).toMatchObject({ value: null, note: 'Not counted: counting started with v9.' });
  });

  it('compares today with the same weekday last week', () => {
    expect(sameDayLastWeek(report, name)).toEqual({ label: '▼ 15 fewer than last day 23', trend: 'down' });
    expect(sameDayLastWeek({ ...report, opensSince: '2026-11-25' }, name)).toBeNull();
  });
});

describe('new people arriving', () => {
  it('shows this week against last, then a tapped week against a usual one', () => {
    expect(arrivalsReadout(report, null, name)).toMatchObject({
      when: 'This week', picked: false, value: 7, change: { label: '▲ 1 more than last week' },
      facts: [{ value: 6, label: 'confirmed' }, { value: 1, label: 'not yet' }, { value: 2 }],
    });
    expect(arrivalsReadout(report, 1, name)).toMatchObject({
      when: 'Week of day 08', picked: true, value: 9, change: { label: '▲ 1 more than a usual week' },
      facts: [{ value: 8, label: 'confirmed' }, { value: 2 }, { value: 1, label: 'came back after day one' }],
      note: 'Includes 2 since deleted.',
    });
    expect(usualWeek(report.weeks.slice(0, 2))).toBeNull();
  });
});

describe('worth a look', () => {
  const now = Date.parse('2026-11-30T12:00:00Z');
  it('stays empty when nothing is unusual', () => {
    expect(worthALook({ ...report, days: days.slice(0, 29) }, null, now)).toEqual([]);
  });

  it('flags a quiet yesterday only once a week of days is counted', () => {
    // 29 Nov had 9 against a usual 18 (21–28 Nov).
    expect(worthALook(report, null, now)).toEqual([{ id: 'fewer', title: 'Fewer people than usual', text: 'Yesterday 9, a usual day is 18.' }]);
    expect(worthALook({ ...report, opensSince: '2026-11-24' }, null, now)).toEqual([]);
  });

  it('flags cleanup, a full database and a new release', () => {
    const busy = { ...report, opensSince: undefined, cleanup: { unconfirmed: 12, empty: 6 }, databaseBytes: 420 * 1024 * 1024, largestTables: [{ name: 'user_backups', bytes: 1 }] };
    expect(worthALook(busy, { version: '9.0.0', publishedAt: '2026-11-28T09:00:00Z', downloads: 64 }, now)).toEqual([
      { id: 'cleanup', title: '18 accounts to clean up', text: 'Never confirmed or nothing saved.' },
      { id: 'database', title: 'Database 84% full', text: 'Of the free 500 MB. Largest: user backups.' },
      { id: 'downloads', title: 'v9.0.0: 64 downloads', text: 'Since it came out 2 days ago.' },
    ]);
    expect(worthALook(busy, { version: '8.9.0', publishedAt: '2026-11-01T09:00:00Z', downloads: 118 }, now).map((item) => item.id)).toEqual(['cleanup', 'database']);
  });
});

describe('account cleanup', () => {
  it('reads the list and skips rows without an id', () => {
    const list = parseCleanupList({
      unconfirmed: 2, empty: 1, matching: 2,
      accounts: [
        { id: 'a1', email: 'qwerty.temp41@mailbox.test', created_at: '2026-09-12T10:00:00Z', confirmed: false, reason: 'unconfirmed' },
        { id: 'a2', email: 'x9k2@fastmail.test', username: 'x9', created_at: '2026-08-02T10:00:00Z', confirmed: true, last_sign_in_at: '2026-08-03T10:00:00Z', reason: 'empty' },
        { email: 'no-id@mail.test' },
      ],
    });
    expect(list.accounts.map((account) => account.id)).toEqual(['a1', 'a2']);
    expect(list.accounts[1]).toMatchObject({ reason: 'empty', confirmed: true, username: 'x9' });
    const day = (iso: string) => iso.slice(5, 10);
    expect(cleanupLine(list.accounts[0], day)).toBe('Signed up 09-12 · never confirmed · never signed in');
    expect(cleanupLine(list.accounts[1], day)).toBe('Signed up 08-02 · confirmed, nothing saved · last sign-in 08-03');
  });
});

describe('downloads', () => {
  it('adds up APK downloads per release and skips drafts', () => {
    expect(parseReleases([
      { tag_name: 'v8.9.0', published_at: '2026-11-21T10:00:00Z', assets: [{ name: 'YouDO.apk', download_count: 118 }, { name: 'notes.txt', download_count: 5 }] },
      { tag_name: 'v9.0.0', draft: true, assets: [{ name: 'YouDO.apk', download_count: 3 }] },
      { tag_name: 'v8.8.0', published_at: '2026-11-20T10:00:00Z', assets: [] },
    ])).toEqual([
      { version: '8.9.0', publishedAt: '2026-11-21T10:00:00Z', downloads: 118 },
      { version: '8.8.0', publishedAt: '2026-11-20T10:00:00Z', downloads: 0 },
    ]);
  });
});
