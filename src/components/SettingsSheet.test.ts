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

// The tab strip is Classic Look's; the new look opens on a list of rows.
const uiPrefs = vi.hoisted(() => ({ legacyStyle: true }));
vi.mock('../hooks/useUiPrefs', () => ({
  useUiPrefs: () => [{ legacyStyle: uiPrefs.legacyStyle, liquidGlass: true }, vi.fn()],
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
    refreshMorningBriefing: vi.fn().mockResolvedValue(undefined),
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

describe('SettingsSheet Tab Navigation System (Classic Look)', () => {
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

  it('renders tab buttons with shrink-0 and flex-none to prevent label overlapping', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    expect(html).toContain('shrink-0 flex-none px-3.5 py-1.5');
    expect(html).not.toContain('flex-1 min-w-fit');
    expect(html).not.toMatch(/id="settings-tab-account"[^>]*class="[^"]*flex-1[^"]*"/);

    // Classic tabs: the selected one is filled and bold, the others semibold
    expect(html).toMatch(/id="settings-tab-account"[^>]*aria-selected="true"[^>]*class="[^"]*font-bold[^"]*"/);
    expect(html).toMatch(/id="settings-tab-preferences"[^>]*class="[^"]*font-semibold[^"]*"/);
    expect(html).not.toMatch(/id="settings-tab-preferences"[^>]*class="[^"]*font-bold[^"]*"/);
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

  it('renders tab panels in exact matching DOM order as the tablist', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    const accountIndex = html.indexOf('id="settings-panel-account"');
    const preferencesIndex = html.indexOf('id="settings-panel-preferences"');
    const notificationsIndex = html.indexOf('id="settings-panel-notifications"');
    const boardIndex = html.indexOf('id="settings-panel-board"');
    const aboutIndex = html.indexOf('id="settings-panel-about"');

    expect(accountIndex).toBeGreaterThan(-1);
    expect(preferencesIndex).toBeGreaterThan(accountIndex);
    expect(notificationsIndex).toBeGreaterThan(preferencesIndex);
    expect(boardIndex).toBeGreaterThan(notificationsIndex);
    expect(aboutIndex).toBeGreaterThan(boardIndex);
  });

  it('sets native hidden attribute and tabIndex on inactive vs active panels', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, { ...defaultProps, initialTab: 'preferences' })
    );

    // Preferences panel is active: has tabindex="0", not hidden
    expect(html).toMatch(/id="settings-panel-preferences"[^>]*tabindex="0"/);
    expect(html).not.toMatch(/id="settings-panel-preferences"[^>]*hidden=""/);

    // Inactive panels have hidden="" attribute and tabindex="-1"
    expect(html).toMatch(/id="settings-panel-account"[^>]*hidden=""[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-panel-notifications"[^>]*hidden=""[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-panel-board"[^>]*hidden=""[^>]*tabindex="-1"/);
    expect(html).toMatch(/id="settings-panel-about"[^>]*hidden=""[^>]*tabindex="-1"/);
  });

  it('renders tab strip with mobile gesture overscroll containment and touch pan', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    expect(html).toContain('overscroll-x-contain');
    expect(html).toContain('touch-pan-x');
  });

  it('offers one community chat push choice, mentions and replies by default, and no in-app alert switches', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, {
        ...defaultProps,
        initialTab: 'notifications',
      })
    );

    expect(html).toContain('Community Chat');
    expect(html).toContain('All in my room');
    expect(html).toContain('Mentions &amp; replies');
    expect(html).toContain('When someone @mentions you or replies to your message');
    expect(html).not.toContain('Community Chat Messages');
    expect(html).not.toContain('Hashtag Community Updates');
  });

  it('renders settings content container with touch-pan-y for fluid vertical scrolling and swipe tab switching', () => {
    const html = renderToStaticMarkup(
      createElement(SettingsSheet, defaultProps)
    );

    expect(html).toContain('settings-content');
    expect(html).toContain('touch-pan-y');
  });
});

describe('SettingsSheet list (new look)', () => {
  const props = { open: true, onClose: vi.fn(), streakBarHours: 1, onStreakBarHoursChange: vi.fn() };
  const render = (extra: Record<string, unknown> = {}) => {
    uiPrefs.legacyStyle = false;
    try {
      return renderToStaticMarkup(createElement(SettingsSheet, { ...props, ...extra }));
    } finally {
      uiPrefs.legacyStyle = true;
    }
  };

  it('opens on the profile header and a plain list of rows, without the tab strip', () => {
    const html = render();
    expect(html).not.toContain('role="tablist"');
    expect(html).toContain('settings-home-profile');
    expect(html).toContain('Test Aspirant');
    for (const row of ['Account and sync', 'Appearance', 'Notifications', 'Focus and streak', 'Board and Hub', 'Backup and data', 'About and updates']) {
      expect(html).toContain(row);
    }
    expect(html).not.toContain('Admin Hub');
  });

  it('shows Admin Hub as a row with its count for admins', () => {
    const html = render({ onOpenAdminHub: vi.fn(), adminPending: 3 });
    expect(html).toContain('Admin Hub');
    expect(html).toContain('settings-home-count');
  });

  it('opens straight on a page when asked (e.g. About from a Board update)', () => {
    const html = render({ initialTab: 'about' });
    expect(html).toContain('About and updates</h1>');
    expect(html).not.toContain('settings-home-profile');
  });

  it('opens Board and Hub for the public board shortcut, without the streak card', () => {
    const html = render({ focusSection: 'public-board' });
    expect(html).toContain('Board and Hub</h1>');
    expect(html).toMatch(/hidden=""[^>]*class="settings-card settings-focus-card/);
  });
});
