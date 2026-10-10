import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import HubAuthGate from './HubAuthGate';
import PrivateHubUsernameGate from './PrivateHubUsernameGate';
import type { User } from '@supabase/supabase-js';

describe('HubAuthGate', () => {
  it('renders Public Hub gate with community leaderboard highlights', () => {
    const html = renderToStaticMarkup(
      createElement(HubAuthGate, {
        tab: 'social',
        isOffline: false,
        onSwitchTab: vi.fn(),
      }),
    );

    expect(html).toContain('Public Focus Hub · Account Required');
    expect(html).toContain('Join the Global Focus Board');
    expect(html).toContain('Global &amp; Periodic Leaderboards');
    expect(html).toContain('Sign In or Create Account');
    expect(html).toContain('Switch to Private Hub');
    expect(html).toContain('pb-28');
  });

  it('renders Private Hub gate with squad rooms and companion DMs highlights', () => {
    const html = renderToStaticMarkup(
      createElement(HubAuthGate, {
        tab: 'private',
        isOffline: false,
        onSwitchTab: vi.fn(),
      }),
    );

    expect(html).toContain('Private Hub &amp; Rooms · Account Required');
    expect(html).toContain('Unlock Private Study Rooms');
    expect(html).toContain('4-Member Focus Squads');
    expect(html).toContain('Companion DMs &amp; Streaks');
    expect(html).toContain('Sign In or Create Account');
    expect(html).toContain('Switch to Public Board');
  });

  it('renders offline alert notice when offline is detected', () => {
    const html = renderToStaticMarkup(
      createElement(HubAuthGate, {
        tab: 'private',
        isOffline: true,
        onSwitchTab: vi.fn(),
      }),
    );

    expect(html).toContain('You are currently offline');
    expect(html).toContain('Connect to Wi-Fi or mobile data to sign in');
  });
});

describe('PrivateHubUsernameGate', () => {
  const mockUser: User = {
    id: 'user-abc-123',
    app_metadata: {},
    user_metadata: { full_name: 'Test Explorer' },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: 'explorer@example.com',
  } as unknown as User;

  it('renders username setup gate with identity prompt and form inputs', () => {
    const html = renderToStaticMarkup(
      createElement(PrivateHubUsernameGate, {
        user: mockUser,
        initialDraft: 'explorer_study',
        onSuccess: vi.fn(),
        onSwitchToPublic: vi.fn(),
      }),
    );

    expect(html).toContain('Private Hub Entry · Set Identity');
    expect(html).toContain('Choose your @username');
    expect(html).toContain('explorer_study');
    expect(html).toContain('Test Explorer (explorer@example.com)');
    expect(html).toContain('Claim Username &amp; Enter');
    expect(html).toContain('View Public Board');
    expect(html).toContain('pb-28');
  });
});
