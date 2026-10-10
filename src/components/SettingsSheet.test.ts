import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SettingsSheet from './SettingsSheet';

if (typeof window === 'undefined') {
  (global as unknown as Record<string, unknown>).window = global;
}

// Mock Overlay to render children directly in SSR test environment
vi.mock('./Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'mock-overlay' }, children) : null,
}));

vi.mock('./UpdateAction', () => ({
  default: () => createElement('div', { 'data-testid': 'mock-update-action' }, 'Update Action'),
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'test-user-id',
      email: 'test@example.com',
      user_metadata: { full_name: 'Test Aspirant', avatar_url: '🎓' },
      email_confirmed_at: '2026-01-01T00:00:00Z',
    },
    signOut: vi.fn(),
    verifyAccount: vi.fn(),
    deleteAccount: vi.fn(),
    updateProfile: vi.fn(),
    changeEmail: vi.fn(),
    changePassword: vi.fn(),
  }),
}));

vi.mock('../store', () => ({
  useStore: () => ({
    exportBackup: vi.fn().mockResolvedValue('Backup exported'),
    importBackup: vi.fn().mockReturnValue(true),
    syncToCloud: vi.fn().mockResolvedValue({ ok: true }),
    cloudSyncConflict: null,
    clearCloudData: vi.fn(),
    restoreFromCloud: vi.fn(),
    restoreFromVisitSnapshot: vi.fn(),
    listCloudRestorePoints: vi.fn().mockResolvedValue({ live: null, visits: [] }),
    recentlyDeletedGoals: [],
    restoreDeletedGoal: vi.fn(),
    clearTrash: vi.fn(),
    pruneOldSessions: vi.fn(),
    sessionHistory: {},
    pacePrefs: { optedIn: false },
    updatePacePrefs: vi.fn(),
    publishPublicPace: vi.fn().mockResolvedValue({ ok: true }),
    tasks: [],
    goals: [],
  }),
  useSessionStore: () => ({
    activeSession: null,
  }),
}));

vi.mock('../hooks/useTheme', () => ({
  useTheme: () => [{ darkMode: true }, vi.fn()],
}));

vi.mock('../hooks/useReducedEffects', () => ({
  useReducedEffects: () => [false, vi.fn()],
}));

vi.mock('../hooks/useLocalStorage', () => ({
  useLocalStorage: (_key: string, initial: unknown) => [initial, vi.fn()],
}));

vi.mock('../lib/haptics', () => ({
  hapticTick: vi.fn(),
  setHapticsPreference: vi.fn(),
}));

vi.mock('../lib/notifications', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/notifications')>();
  return {
    ...actual,
    getNotificationPreferences: () => actual.DEFAULT_NOTIFICATION_PREFERENCES,
    saveNotificationPreferences: vi.fn(),
    checkNotificationPermission: vi.fn().mockResolvedValue('granted'),
    requestNotificationPermission: vi.fn().mockResolvedValue(true),
    scheduleMorningBriefing: vi.fn().mockResolvedValue(true),
    sendTestBriefingNotification: vi.fn().mockResolvedValue(true),
  };
});

vi.mock('../lib/profiles', () => ({
  fetchProfile: vi.fn().mockResolvedValue(null),
  upsertProfile: vi.fn(),
  normalizeUsername: (name?: string) => name || '',
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
}));

vi.mock('../lib/communityHashtags', () => ({
  fetchCommunityHashtags: vi.fn().mockResolvedValue({ hashtags: [], requests: [] }),
  chooseCommunityHashtag: vi.fn(),
  requestCommunityHashtag: vi.fn(),
}));

vi.mock('../lib/appUpdate', () => ({
  checkAppUpdateStatus: vi.fn().mockResolvedValue({ release: null, checked: true }),
}));

describe('SettingsSheet Tab Navigation System', () => {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    streakBarHours: 4,
    onStreakBarHoursChange: vi.fn(),
  };

  it('renders null when open is false', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, { ...defaultProps, open: false })
    );
    expect(html).toBe('');
  });

  it('renders the segmented tab navigation bar with all 5 tabs', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Settings categories"');

    // All 5 tabs should be present
    expect(html).toContain('id="settings-tab-account"');
    expect(html).toContain('id="settings-tab-preferences"');
    expect(html).toContain('id="settings-tab-notifications"');
    expect(html).toContain('id="settings-tab-board"');
    expect(html).toContain('id="settings-tab-about"');

    expect(html).toContain('Account');
    expect(html).toContain('Preferences');
    expect(html).toContain('Notifications');
    expect(html).toContain('Board');
    expect(html).toContain('About');
  });

  it('defaults to the Account tab being selected and its panel visible', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    // Account tab button selected
    expect(html).toMatch(/id="settings-tab-account"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="settings-tab-preferences"[^>]*aria-selected="false"/);

    // Account panel is visible (fade-in, not hidden)
    expect(html).toMatch(/id="settings-panel-account"[^>]*class="[^"]*fade-in[^"]*"/);
    expect(html).not.toMatch(/id="settings-panel-account"[^>]*class="[^"]*hidden[^"]*"/);

    // Other panels are hidden
    expect(html).toMatch(/id="settings-panel-preferences"[^>]*class="[^"]*hidden[^"]*"/);
    expect(html).toMatch(/id="settings-panel-notifications"[^>]*class="[^"]*hidden[^"]*"/);
    expect(html).toMatch(/id="settings-panel-board"[^>]*class="[^"]*hidden[^"]*"/);
    expect(html).toMatch(/id="settings-panel-about"[^>]*class="[^"]*hidden[^"]*"/);
  });

  it('switches to Board tab and highlights the section when focusSection="public-board"', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, {
        ...defaultProps,
        focusSection: 'public-board',
      })
    );

    // Board tab is selected
    expect(html).toMatch(/id="settings-tab-board"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="settings-tab-account"[^>]*aria-selected="false"/);

    // Board panel is visible
    expect(html).toMatch(/id="settings-panel-board"[^>]*class="[^"]*fade-in[^"]*"/);
    expect(html).not.toMatch(/id="settings-panel-board"[^>]*class="[^"]*hidden[^"]*"/);

    // Account panel is hidden
    expect(html).toMatch(/id="settings-panel-account"[^>]*class="[^"]*hidden[^"]*"/);

    // Board section has highlight ring
    expect(html).toContain('ring-2 ring-primary ring-offset-2 ring-offset-base');
  });

  it('renders Preferences tab with Appearance and Data sections when initialTab="preferences"', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, {
        ...defaultProps,
        initialTab: 'preferences',
      })
    );

    expect(html).toMatch(/id="settings-tab-preferences"[^>]*aria-selected="true"/);
    expect(html).not.toMatch(/id="settings-panel-preferences"[^>]*class="[^"]*hidden[^"]*"/);

    // Both Appearance and Data sections exist in the preferences panel
    expect(html).toContain('APPEARANCE &amp; EXPERIENCE');
    expect(html).toContain('DATA &amp; STORAGE');
    expect(html).toContain('Theme');
    expect(html).toContain('Haptic Feedback');
    expect(html).toContain('Recently Deleted Goals');
  });

  it('renders Notifications tab when initialTab="notifications"', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, {
        ...defaultProps,
        initialTab: 'notifications',
      })
    );

    expect(html).toMatch(/id="settings-tab-notifications"[^>]*aria-selected="true"/);
    expect(html).not.toMatch(/id="settings-panel-notifications"[^>]*class="[^"]*hidden[^"]*"/);
    expect(html).toContain('NOTIFICATIONS &amp; BRIEFINGS');
  });

  it('renders About tab with version info when initialTab="about"', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, {
        ...defaultProps,
        initialTab: 'about',
      })
    );

    expect(html).toMatch(/id="settings-tab-about"[^>]*aria-selected="true"/);
    expect(html).not.toMatch(/id="settings-panel-about"[^>]*class="[^"]*hidden[^"]*"/);
    expect(html).toContain('UPDATES &amp; COMMUNITY');
    expect(html).toContain('Installed');
    expect(html).toContain('YouDO Updates');
    expect(html).toContain('Discussion &amp; bug reports');
  });

  it('properly associates tabs and panels via ARIA attributes', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    // All tabs have aria-controls matching panel IDs
    expect(html).toContain('aria-controls="settings-panel-account"');
    expect(html).toContain('aria-controls="settings-panel-preferences"');
    expect(html).toContain('aria-controls="settings-panel-notifications"');
    expect(html).toContain('aria-controls="settings-panel-board"');
    expect(html).toContain('aria-controls="settings-panel-about"');

    // All panels have aria-labelledby matching tab IDs
    expect(html).toContain('aria-labelledby="settings-tab-account"');
    expect(html).toContain('aria-labelledby="settings-tab-preferences"');
    expect(html).toContain('aria-labelledby="settings-tab-notifications"');
    expect(html).toContain('aria-labelledby="settings-tab-board"');
    expect(html).toContain('aria-labelledby="settings-tab-about"');
  });

  it('renders tab buttons with correct tabIndex (0 for active, -1 for inactive)', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, { ...defaultProps, initialTab: 'board' })
    );

    // Board tab has tabIndex 0, other tabs have -1
    expect(html).toMatch(/id="settings-tab-board"[^>]*tabindex="0"/);
    expect(html).toMatch(/id="settings-tab-account"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-tab-preferences"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-tab-notifications"[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-tab-about"[^>]*tabindex="-1"/);
  });
});
