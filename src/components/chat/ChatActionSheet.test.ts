import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatActionSheet, { copyTextToClipboard } from './ChatActionSheet';

// Ensure window is defined for node test runner
if (typeof window === 'undefined') {
  (global as unknown as Record<string, unknown>).window = global;
}

// Mock Overlay to render children directly for SSR testing
vi.mock('../Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'overlay-root' }, children) : null,
}));

vi.mock('../../lib/haptics', () => ({
  hapticTick: vi.fn(),
  hapticWarn: vi.fn(),
}));

describe('ChatActionSheet component', () => {
  it('returns null when open is false', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: false,
        onClose: () => {},
        authorName: 'Alex',
        time: '10:30 AM',
        body: 'Hello everyone!',
      })
    );
    expect(html).toBe('');
  });

  it('renders author, timestamp, and message body in preview quote card', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: true,
        onClose: () => {},
        authorName: 'Jordan',
        time: '11:45 AM',
        body: 'Keep pushing your daily bar!',
      })
    );
    expect(html).toContain('Jordan');
    expect(html).toContain('11:45 AM');
    expect(html).toContain('Keep pushing your daily bar!');
    expect(html).toContain('Cancel');
  });

  it('conditionally renders Reply, Copy, Edit, Delete, and Report buttons based on permissions', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: true,
        onClose: () => {},
        authorName: 'Jordan',
        time: '11:45 AM',
        body: 'Test permissions',
        canReply: true,
        onReply: () => {},
        canCopy: true,
        canEdit: true,
        onEdit: () => {},
        canDelete: true,
        deleteLabel: 'Delete for everyone',
        onDelete: () => {},
        canReport: true,
        onReport: () => {},
      })
    );
    expect(html).toContain('Reply');
    expect(html).toContain('Copy text');
    expect(html).toContain('Edit message');
    expect(html).toContain('Delete for everyone');
    expect(html).toContain('Report privately');
  });

  it('omits Copy text button when canCopy is false', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: true,
        onClose: () => {},
        authorName: 'Jordan',
        time: '11:45 AM',
        body: 'Test permissions',
        canCopy: false,
      })
    );
    expect(html).not.toContain('Copy text');
  });

  it('renders admin moderation box when isAdmin is true and onAdminRemove is provided', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: true,
        onClose: () => {},
        authorName: 'Bad Actor',
        time: '12:00 PM',
        body: 'Inappropriate content',
        isAdmin: true,
        adminReason: 'Spam violation',
        onAdminReasonChange: () => {},
        onAdminRemove: () => {},
      })
    );
    expect(html).toContain('Moderation removal');
    expect(html).toContain('Remove as admin');
    expect(html).toContain('Spam violation');
  });

  it('renders action error when actionError prop is passed', () => {
    const html = renderToStaticMarkup(
      createElement(ChatActionSheet, {
        open: true,
        onClose: () => {},
        authorName: 'Sam',
        time: '1:00 PM',
        body: 'Test error',
        actionError: 'Network failed to delete message',
      })
    );
    expect(html).toContain('Network failed to delete message');
  });

  it('copyTextToClipboard attempts clipboard write when available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    try {
      const success = await copyTextToClipboard('Hello copy');
      expect(writeText).toHaveBeenCalledWith('Hello copy');
      expect(success).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
