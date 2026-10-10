import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import CommunityChat from './CommunityChat';
import type { CommunityContext } from '../../lib/community';

vi.mock('../../store', () => ({
  useStore: () => ({
    pacePrefs: { optedIn: true },
  }),
}));

vi.mock('../../lib/community', () => ({
  fetchUserCommunityReports: vi.fn().mockResolvedValue([]),
  markCommunityUpdatesRead: vi.fn().mockResolvedValue(true),
  removeCommunityMessage: vi.fn().mockResolvedValue(true),
  reportCommunityMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../lib/notifications', () => ({
  dismissCommunityNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../lib/communityHashtags', () => ({
  fetchCommunityRooms: vi.fn().mockResolvedValue({ hashtags: [], requests: [] }),
}));

vi.mock('./CommunityHashtagBar', () => ({
  default: () => createElement('div', { 'data-testid': 'hashtag-bar' }),
}));

vi.mock('./CommunityHashtagSupportChat', () => ({
  default: () => null,
}));

vi.mock('../Overlay', () => ({
  default: () => null,
}));

vi.mock('../chat/ChatActionSheet', () => ({
  default: () => null,
}));

vi.mock('../../lib/communityChat', () => ({
  activeChatMessages: (msgs: unknown[]) => msgs,
  chatCacheGeneration: () => 1,
  CHAT_HISTORY_LIMIT: 120,
  CHAT_PAGE_SIZE: 30,
  clearChatCache: vi.fn(),
  deleteChatMessage: vi.fn(),
  editChatMessage: vi.fn(),
  fetchChatPage: vi.fn().mockResolvedValue([]),
  mergeChatPage: (_current: unknown[], fresh: unknown[]) => fresh,
  pendingChatMessage: vi.fn(),
  readChatCache: () => ({
    messages: [
      {
        id: 'msg-1',
        authorId: 'other-aspirant',
        body: 'Keep working hard on your goals!',
        sequence: 1,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        delivery: 'sent',
        kind: 'chat',
      },
      {
        id: 'msg-2',
        authorId: 'me',
        body: 'Just finished 2 hours of focus!',
        sequence: 2,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        delivery: 'sent',
        kind: 'chat',
      },
    ],
    hasOlder: false,
    scrollTop: 100,
  }),
  saveChatCache: vi.fn(),
  sendChatMessage: vi.fn(),
  markChatRoomRead: vi.fn().mockResolvedValue(true),
}));

const mockContext: CommunityContext = {
  available: true,
  dayKey: '2026-10-10',
  isAdmin: false,
  canJoin: true,
  canPost: true,
  settings: { roomEnabled: true, appreciationsEnabled: true, announcement: '' },
  staffIds: [],
  banned: false,
};

describe('CommunityChat component', () => {
  it('renders interactive author profile button and avatar for community authors', () => {
    const onProfile = vi.fn();
    const names = new Map([['other-aspirant', 'Aarav Patel']]);

    const html = renderToStaticMarkup(
      createElement(CommunityChat, {
        userId: 'me',
        context: mockContext,
        names,
        onProfile,
        onOpenBoardSettings: vi.fn(),
      }),
    );

    expect(html).toContain('yd-chat-author-btn');
    expect(html).toContain('yd-chat-author-avatar');
    expect(html).toContain('Aarav Patel');
    expect(html).toContain('>A<'); // Initial avatar glyph
    expect(html).toContain('title="View Aarav Patel&#x27;s profile"');
    expect(html).toContain('aria-label="View Aarav Patel&#x27;s profile"');

    // Author button should NOT be rendered for user's own message
    expect(html).not.toContain('title="View You&#x27;s profile"');
  });

  it('disables author profile button when onProfile callback is not provided', () => {
    const names = new Map([['other-aspirant', 'Aarav Patel']]);

    const html = renderToStaticMarkup(
      createElement(CommunityChat, {
        userId: 'me',
        context: mockContext,
        names,
        onOpenBoardSettings: vi.fn(),
      }),
    );

    expect(html).toContain('disabled=""');
  });
});
