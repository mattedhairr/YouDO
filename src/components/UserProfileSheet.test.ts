import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import UserProfileSheet from './UserProfileSheet';

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-lucia' } }),
}));

vi.mock('../lib/profiles', () => ({
  fetchProfile: vi.fn().mockResolvedValue(null),
  checkFriendshipStatus: vi.fn().mockResolvedValue('none'),
  sendFriendRequest: vi.fn().mockResolvedValue({ ok: true }),
  removeFriend: vi.fn().mockResolvedValue(true),
  normalizeUsername: (raw: unknown) => (typeof raw === 'string' ? raw.toLowerCase().trim() : null),
}));

vi.mock('../lib/paceCloud', () => ({
  fetchPaceRowForUser: vi.fn().mockResolvedValue(null),
}));

describe('UserProfileSheet avatar circularity and styling', () => {
  it('renders perfectly proportioned circular avatar with explicit w-16 h-16 and aspect-square', () => {
    const html = renderToStaticMarkup(
      createElement(UserProfileSheet, {
        open: true,
        userId: 'user-other',
        boardPreview: {
          userId: 'user-other',
          displayName: 'Lucia',
          examLabel: 'MCAT',
          todayMs: 3600000,
          weekMs: 14400000,
          monthMs: 28800000,
          todayKey: '2026-10-10',
          weekKey: '2026-W41',
          monthKey: '2026-10',
          streak: 5,
          barHours: 8,
          updatedAt: '2026-10-10T12:00:00Z',
        },
        onClose: vi.fn(),
      }),
    );

    // Assert explicit fixed sizing and aspect ratio
    expect(html).toContain('w-16 h-16 shrink-0 aspect-square rounded-full');
    // Ensure invalid classes are completely removed
    expect(html).not.toContain('size-18');
    expect(html).not.toContain('p-4.5');
    // Ensure initial letter glyph is present
    expect(html).toContain('>L<');
  });

  it('renders You badge neatly anchored on own profile', () => {
    const html = renderToStaticMarkup(
      createElement(UserProfileSheet, {
        open: true,
        userId: 'user-lucia', // matches useAuth mock user
        boardPreview: {
          userId: 'user-lucia',
          displayName: 'Lucia',
          examLabel: 'MCAT',
          todayMs: 3600000,
          weekMs: 14400000,
          monthMs: 28800000,
          todayKey: '2026-10-10',
          weekKey: '2026-W41',
          monthKey: '2026-10',
          streak: 5,
          barHours: 8,
          updatedAt: '2026-10-10T12:00:00Z',
        },
        onClose: vi.fn(),
      }),
    );

    expect(html).toContain('w-16 h-16 shrink-0 aspect-square rounded-full');
    expect(html).toContain('You');
    expect(html).toContain('-bottom-0.5 -right-0.5');
  });
});
