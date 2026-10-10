import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BoardView from './BoardView';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test-user-1' } }),
}));

vi.mock('../store', () => ({
  useStore: () => ({
    publishPublicPace: vi.fn().mockResolvedValue({ ok: true }),
    syncToCloud: vi.fn().mockResolvedValue({ ok: true }),
    pacePrefs: { optedIn: true },
  }),
}));

vi.mock('../lib/community', () => ({
  fetchCommunityContext: vi.fn().mockResolvedValue({
    available: true,
    dayKey: '2026-10-10',
    isAdmin: false,
    canJoin: true,
    canPost: true,
    settings: { roomEnabled: true, appreciationsEnabled: true, announcement: '' },
    staffIds: [],
    banned: false,
  }),
  fetchAdminHubCounts: vi.fn().mockResolvedValue({
    reports: 0,
    appeals: 0,
    hashtagRequests: 0,
    chatReplies: 0,
    total: 0,
  }),
  fetchAppreciations: vi.fn().mockResolvedValue({ counts: {}, mine: new Set() }),
  giveKudos: vi.fn(),
}));

vi.mock('../lib/paceCloud', () => ({
  fetchPaceRows: vi.fn().mockResolvedValue({ ok: true, rows: [] }),
}));

vi.mock('../lib/boardRefresh', () => ({
  refreshBoard: vi.fn(),
}));

describe('BoardView responsive layout & hygiene', () => {
  it('renders board workspace with overflow-x-hidden to prevent horizontal scrolling', () => {
    const html = renderToStaticMarkup(
      createElement(BoardView, {
        onOpenBoardSettings: vi.fn(),
      }),
    );

    expect(html).toContain('board-workspace pb-4 overflow-x-hidden');
    expect(html).not.toContain('Focus sync details');
  });

  it('never outputs redundant Focus sync details element', () => {
    const html = renderToStaticMarkup(
      createElement(BoardView, {
        onOpenBoardSettings: vi.fn(),
      }),
    );

    expect(html).not.toContain('Focus sync details');
    expect(html).not.toContain('sittings were excluded');
    expect(html).not.toContain('sitting was excluded');
  });

  it('renders admin button and badge cleanly without overflow when admin items exist', () => {
    const html = renderToStaticMarkup(
      createElement(BoardView, {
        onOpenBoardSettings: vi.fn(),
        initialCommunity: {
          available: true,
          dayKey: '2026-10-10',
          isAdmin: true,
          canJoin: true,
          canPost: true,
          settings: { roomEnabled: true, appreciationsEnabled: true, announcement: '' },
          staffIds: [],
          banned: false,
        },
        initialAdminCounts: {
          reports: 1,
          appeals: 0,
          hashtagRequests: 0,
          chatReplies: 0,
          total: 1,
        },
      }),
    );

    expect(html).toContain('board-admin-link');
    expect(html).toContain('board-admin-badge');
    expect(html).toContain('>1<');
    expect(html).toContain('Open community admin, 1 unreviewed items');
    expect(html).toContain('1 pending admin items');
    // Ensure no negative coordinates that protrude past container
    expect(html).not.toContain('-right-');
    expect(html).not.toContain('-top-');
    expect(html).not.toContain('-mr-');
  });

  it('renders 9+ badge boundary for two-digit admin counts without overflow', () => {
    const html = renderToStaticMarkup(
      createElement(BoardView, {
        onOpenBoardSettings: vi.fn(),
        initialCommunity: {
          available: true,
          dayKey: '2026-10-10',
          isAdmin: true,
          canJoin: true,
          canPost: true,
          settings: { roomEnabled: true, appreciationsEnabled: true, announcement: '' },
          staffIds: [],
          banned: false,
        },
        initialAdminCounts: {
          reports: 5,
          appeals: 3,
          hashtagRequests: 4,
          chatReplies: 0,
          total: 12,
        },
      }),
    );

    expect(html).toContain('board-admin-badge');
    expect(html).toContain('>9+<');
    expect(html).toContain('Open community admin, 12 unreviewed items');
  });

  it('renders clean admin button without badge when total unreviewed items is 0', () => {
    const html = renderToStaticMarkup(
      createElement(BoardView, {
        onOpenBoardSettings: vi.fn(),
        initialCommunity: {
          available: true,
          dayKey: '2026-10-10',
          isAdmin: true,
          canJoin: true,
          canPost: true,
          settings: { roomEnabled: true, appreciationsEnabled: true, announcement: '' },
          staffIds: [],
          banned: false,
        },
        initialAdminCounts: {
          reports: 0,
          appeals: 0,
          hashtagRequests: 0,
          chatReplies: 0,
          total: 0,
        },
      }),
    );

    expect(html).toContain('board-admin-link');
    expect(html).not.toContain('board-admin-badge');
    expect(html).toContain('aria-label="Open community admin"');
  });
});
