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
});
