import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: {}, supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon' }));
vi.mock('../../hooks/useUiPrefs', () => ({ useUiPrefs: () => [{ liquidGlass: false, legacyStyle: false }] }));

import AdminQueue from './AdminQueue';
import AdminCommunity from './AdminCommunity';
import AdminOwner from './AdminOwner';
import AdminHome from './AdminHome';
import AdminEmail from './AdminEmail';
import { queueCounts } from './adminHubShared';
import type { AdminHubData } from './useAdminHubData';
import type { AdminRole } from '../../lib/adminHub';

// Made-up people and messages.
function hub(role: AdminRole): AdminHubData {
  return {
    role,
    context: {
      available: true, dayKey: '2026-11-24', isAdmin: true, canJoin: true, canPost: true, banned: false, staffIds: [],
      settings: { roomEnabled: true, appreciationsEnabled: true, announcement: 'v8.9.0 is out' },
    },
    activity: { dayKey: '2026-11-24', asOf: '2026-11-24T10:00:00Z', activeRecently: 3, visitedToday: 11, boardMembers: 40 },
    reports: [
      { id: 'r1', messageId: 'm1', reporterId: 'u2', reason: 'Spam', createdAt: '2026-11-24T09:00:00Z' },
      { id: 'r2', messageId: 'm1', reporterId: 'u3', reason: 'Spam', createdAt: '2026-11-24T09:05:00Z' },
    ],
    reportMessages: [{ id: 'm1', authorId: 'u9', body: 'Free PYQ pdfs here', createdAt: '2026-11-24T08:55:00Z', expiresAt: '2026-11-25T08:55:00Z' }],
    appeals: [{ id: 'a1', userId: 'u7', message: 'Sorry, my friend used my phone.', status: 'open', adminResponse: '', createdAt: '2026-11-23T10:00:00Z' }],
    members: [],
    audit: [{ id: 1, adminId: 'u5', action: 'member.mute_7d', targetUserId: 'u9', reason: '', createdAt: '2026-11-24T09:10:00Z' }],
    hashtagRequests: [],
    hashtags: [],
    hashtagError: '',
    quotes: [],
    quoteError: '',
    update: null,
    updateReplies: [],
    pendingBackers: 2,
    growth: role === 'owner' ? {
      accounts: 222, confirmed: 191, started: 40, cameBack: 10, active7d: 9, active30d: 21, new7d: 14, new7dConfirmed: 9, studyingNow: 3,
      weeks: [{ week: '2026-11-17', signups: 14, confirmed: 9, started: 4, cameBack: 1, deleted: 0, active7d: 3 }],
      beforeV8: { signups: 120, started: 20, cameBack: 4 }, sinceV8: { signups: 102, started: 20, cameBack: 6 },
      cleanup: { unconfirmed: 31, empty: 104 }, databaseBytes: 43_000_000, largestTables: [],
      days: [{ day: '2026-11-24', opened: 12, signedIn: 8, withoutAccount: 4, newAccounts: 2, newConfirmed: 1, studied: 5 }],
      opensSince: '2026-11-24',
      thisWeek: { opened: 30, withoutAccount: 9, regulars: 7, newAccounts: 14 },
      lastWeek: { opened: 25, withoutAccount: 8, regulars: 5, newAccounts: 16 },
      deleted: { count: 0, confirmed: 0, started: 0, cameBack: 0 },
    } : null,
    growthError: '',
    names: new Map([['u9', 'quickmarks'], ['u7', 'Ravi K.'], ['u5', 'Anjali R.']]),
  };
}

const noop = () => {};
const refresh = async () => {};

describe('the Admin Hub', () => {
  it('counts a message reported twice once, and backer claims only for the owner', () => {
    expect(queueCounts(hub('owner'))).toEqual({ reports: 1, hashtags: 0, appeals: 1, backers: 2, all: 4 });
    expect(queueCounts(hub('admin'))).toEqual({ reports: 1, hashtags: 0, appeals: 1, backers: 0, all: 2 });
  });

  it('shows the Inbox with two clear choices on each card, and more behind •••', () => {
    const html = renderToStaticMarkup(createElement(AdminQueue, {
      data: hub('admin'), filter: 'all', onFilter: noop, onRefresh: refresh, onOpenBackers: noop, onOpenPerson: noop,
    }));
    expect(html).toContain('Free PYQ pdfs here');
    expect(html).toContain('quickmarks');
    expect(html).toContain('>Inbox</h1>');
    expect(html).toContain('>Remove</button>');
    expect(html).toContain('>Keep</button>');
    expect(html).toContain('aria-label="More choices"');
    expect(html).not.toContain('Remove + mute 7 days'); // behind •••
    expect(html).toContain('Ravi K.');
    expect(html).toContain('>Restore</button>');
    expect(html).not.toContain('Backers');
    expect(html).not.toContain('Backer claims');
  });

  it('gives the owner the backer claims in the queue', () => {
    const html = renderToStaticMarkup(createElement(AdminQueue, {
      data: hub('owner'), filter: 'all', onFilter: noop, onRefresh: refresh, onOpenBackers: noop, onOpenPerson: noop,
    }));
    expect(html).toContain('Claims 2');
    expect(html).toContain('Backer claims');
    expect(html).toContain('2 claims to check');
  });

  it('lets only the owner switch the room or edit the broadcast', () => {
    const admin = renderToStaticMarkup(createElement(AdminCommunity, { data: hub('admin'), selfId: 'u5', page: null, onPage: noop, onRefresh: refresh }));
    expect(admin).not.toContain('role="switch"');
    expect(admin).toContain('The switches and the broadcast are the owner’s.');
    expect(admin).not.toContain('Board broadcast');
    const owner = renderToStaticMarkup(createElement(AdminCommunity, { data: hub('owner'), selfId: 'u1', page: null, onPage: noop, onRefresh: refresh }));
    expect(owner.match(/role="switch"/g)).toHaveLength(2);
    expect(owner).toContain('Board broadcast');
    // The log's latest line, with who did it.
    expect(admin).toContain('Muted quickmarks for 7 days · You');
    expect(owner).toContain('Muted quickmarks for 7 days · Anjali R.');
  });

  it('never renders the broadcast editor for an admin', () => {
    const html = renderToStaticMarkup(createElement(AdminCommunity, { data: hub('admin'), selfId: 'u5', page: 'broadcast', onPage: noop, onRefresh: refresh }));
    expect(html).toBe('');
  });

  it('shows the owner a short overview, with the charts on their own Growth page', () => {
    const html = renderToStaticMarkup(createElement(AdminOwner, {
      data: hub('owner'), page: null, onPage: noop, onOpenPerson: noop, onRefresh: refresh,
    }));
    expect(html).toContain('<b>30</b><span>people opened YouDO this week</span>');
    expect(html).toContain('▲ 5 more than last week');
    expect(html).toContain('Charts and funnel');
    expect(html).not.toContain('From sign-up to habit'); // on the Growth page
    expect(html).toContain('135 to look at');
    const growth = renderToStaticMarkup(createElement(AdminOwner, {
      data: hub('owner'), page: 'growth', onPage: noop, onOpenPerson: noop, onRefresh: refresh,
    }));
    expect(growth).toContain('>Growth</h1>');
    expect(growth).toContain('People using YouDO');
    expect(growth).toContain('New people');
    expect(growth).toContain('30<em>people opened YouDO</em>');
    expect(growth).toContain('regulars, 3+ days');
    expect(growth).not.toContain('Studied');
    expect(growth).toContain('From sign-up to habit');
    expect(growth).toContain('Confirmed their email');
    // Account totals right now, at the top of Accounts.
    expect(html).toContain('<b>222</b><span>Accounts</span>');
    expect(html).toContain('<b>191</b><span>Confirmed</span>');
    expect(html).toContain('<b>31</b><span>Not yet</span>');
    expect(html).toContain('<b>21</b><span>Active 30d</span>');
    const cleanup = renderToStaticMarkup(createElement(AdminOwner, {
      data: hub('owner'), page: 'cleanup', onPage: noop, onOpenPerson: noop, onRefresh: refresh,
    }));
    expect(cleanup).toContain('222 accounts now · 191 confirmed');
    expect(html).toContain('2 claims waiting');
    expect(html).toContain('41 MB of 500 MB');
  });

  it('keeps Today to today and what needs you', () => {
    const props = { onQueue: noop, onBroadcast: noop, onOwner: noop };
    const owner = renderToStaticMarkup(createElement(AdminHome, { data: hub('owner'), ...props }));
    expect(owner).toContain('>Today</h1>');
    expect(owner).toContain('aria-label="Today so far"');
    expect(owner).toContain('<span>Opened</span>');
    expect(owner).toContain('5 focused today');
    expect(owner).toContain('1 of the new confirmed');
    expect(owner).toContain('Needs you');
    expect(owner).toContain('Worth a look');
    expect(owner).toContain('135 accounts to clean up');
    expect(owner).not.toContain('Came back');
    expect(owner).not.toContain('New this week');
    const admin = renderToStaticMarkup(createElement(AdminHome, { data: hub('admin'), ...props }));
    expect(admin).toContain('Used the Board');
    expect(admin).not.toContain('<span>Opened</span>');
    expect(admin).not.toContain('Worth a look');
  });
  it('lets only the owner write to backers or thank them', () => {
    const admin = renderToStaticMarkup(createElement(AdminEmail, { role: 'admin', selfId: 'u5' }));
    expect(admin).toContain('New email');
    expect(admin).not.toContain('>Templates<'); // editing templates is the owner's
    expect(admin).not.toContain('Backers');
    expect(admin).not.toContain('Thank you');
    const owner = renderToStaticMarkup(createElement(AdminEmail, { role: 'owner', selfId: 'u1', start: { audience: 'backers', kind: 'thanks' } }));
    expect(owner).toContain('Thank you for backing YouDO');
    expect(owner).toContain('{amount}');
    expect(owner).toContain('Stop these emails');
  });
});
