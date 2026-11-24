import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {}, supabaseAnonKey: '', supabaseUrl: '' }));

import { biggestDrop, cleanupLine, dayDetail, growthFunnel, parseCleanupList, parseReleases, weekChange } from './adminGrowth';
import type { GrowthReport } from './adminHub';

// Made-up numbers.
const growth = {
  accounts: 150, confirmed: 120, started: 45, cameBack: 27, active30d: 20,
  deleted: { count: 14, confirmed: 2, started: 0, cameBack: 0 },
} as GrowthReport;

describe('growth', () => {
  it('says how this week compares', () => {
    expect(weekChange(38, 32)).toEqual({ label: '▲ 6', trend: 'up' });
    expect(weekChange(7, 9)).toEqual({ label: '▼ 2', trend: 'down' });
    expect(weekChange(4, 4).trend).toBe('same');
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

  it('reads a tapped day in plain words', () => {
    expect(dayDetail({ day: '2026-11-18', opened: 21, signedIn: 15, withoutAccount: 6, newAccounts: 2, newConfirmed: 1, studied: 7 }))
      .toEqual(['21 opened YouDO', '15 signed in · 6 without an account', '2 new accounts (1 confirmed)', '7 focused on the Board']);
    expect(dayDetail({ day: '2026-11-01', opened: 0, signedIn: 0, withoutAccount: 0, newAccounts: 1, newConfirmed: 0, studied: 0 })[1]).toBe('1 new account (0 confirmed)');
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
