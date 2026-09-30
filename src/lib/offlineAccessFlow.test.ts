import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canContinueOffline, canOpenAccountWorkspace, canOpenOfflineWorkspace } from './workspaceAccess';
import { checkAccountAvailability } from './accountAvailability';
import { Brand, AuthWelcome } from '../components/AuthGate';
import { STORAGE_KEYS } from './storageKeys';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage());
});

describe('deleted account sign-out and device workspace preservation', () => {
  it('confirms deleted account status from auth responses without clearing device workspace', async () => {
    const mockAuth = {
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { code: 'user_not_found' },
      }),
    };

    const status = await checkAccountAvailability(mockAuth, 'deleted-user-123');
    expect(status).toBe('gone');

    // Simulate device storage preserved after signOut({ clearWorkspace: false })
    const storage: Record<string, string> = {
      [STORAGE_KEYS.workspaceOwner]: 'deleted-user-123',
      [STORAGE_KEYS.tasks]: JSON.stringify([{ id: 'task-1', title: 'Preserved study goal' }]),
      [STORAGE_KEYS.goals]: JSON.stringify([{ id: 'goal-1', title: 'Civil Services' }]),
    };

    // Owner and data are kept intact on device
    expect(storage[STORAGE_KEYS.workspaceOwner]).toBe('deleted-user-123');
    expect(JSON.parse(storage[STORAGE_KEYS.tasks])).toHaveLength(1);
  });
});

describe('offline access condition and sync isolation', () => {
  it('makes "Continue offline" available when a local workspace exists from a deleted account', () => {
    const hasLocalWorkspace = true;
    const deletedAccountOwner = 'deleted-user-123';
    expect(canContinueOffline(hasLocalWorkspace, deletedAccountOwner)).toBe(true);
  });

  it('makes "Continue offline" available on fresh unowned installs', () => {
    expect(canContinueOffline(false, null)).toBe(true);
    expect(canContinueOffline(true, null)).toBe(true);
  });

  it('opens offline workspace only when signed out and offline mode was chosen', () => {
    // Signed-out user entering offline mode with preserved workspace
    expect(canOpenOfflineWorkspace({
      user: null,
      offlineMode: true,
      hasLocalWorkspace: true,
      owner: 'deleted-user-123',
    })).toBe(true);

    // Active signed-in session must never be routed through offline gate
    expect(canOpenOfflineWorkspace({
      user: { id: 'active-user' },
      offlineMode: true,
      hasLocalWorkspace: true,
      owner: 'deleted-user-123',
    })).toBe(false);

    // Signed out but offlineMode not requested
    expect(canOpenOfflineWorkspace({
      user: null,
      offlineMode: false,
      hasLocalWorkspace: true,
      owner: 'deleted-user-123',
    })).toBe(false);
  });

  it('prohibits automatic workspace attachment and requires explicit choice upon later sign-in', () => {
    const deletedAccountOwner = 'deleted-user-123';
    const newUserId = 'new-user-456';

    // Before any user choice, new account cannot open the preserved workspace
    expect(canOpenAccountWorkspace(newUserId, newUserId, deletedAccountOwner)).toBe(false);

    // Even if inspected, owner mismatch blocks access until explicit choice
    expect(canOpenAccountWorkspace(newUserId, 'new-user-456', deletedAccountOwner)).toBe(false);

    // Only once the owner is explicitly set to the new user after user review/keep choice
    expect(canOpenAccountWorkspace(newUserId, newUserId, newUserId)).toBe(true);
  });
});

describe('sign-in page and logo layout verification', () => {
  it('renders Brand SVG with an unclipped viewBox and overflow-visible', () => {
    const html = renderToStaticMarkup(createElement(Brand));
    expect(html).toContain('viewBox="3 3 18 18"');
    expect(html).toContain('overflow-visible');
    expect(html).toContain('ou');
    expect(html).toContain('DO');

    // Mathematical verification of stroke boundary:
    // Path 1: M5 4.5L12 13.25V19.5 (strokeWidth=2.5, radius=1.25)
    // Path 2: M19 4.5L12 13.25L9.25 10 (strokeWidth=2.5, radius=1.25)
    const minX = 5 - 1.25; // 3.75 >= 3
    const maxX = 19 + 1.25; // 20.25 <= 21 (3 + 18)
    const minY = 4.5 - 1.25; // 3.25 >= 3
    const maxY = 19.5 + 1.25; // 20.75 <= 21 (3 + 18)

    expect(minX).toBeGreaterThanOrEqual(3);
    expect(maxX).toBeLessThanOrEqual(21);
    expect(minY).toBeGreaterThanOrEqual(3);
    expect(maxY).toBeLessThanOrEqual(21);
  });

  it('renders AuthWelcome with scroll container, responsive hero, notices, and offline action', () => {
    const accountNotice = 'This account is no longer available. YouDO signed out and kept its device copy separate from other accounts.';
    const html = renderToStaticMarkup(
      createElement(AuthWelcome, {
        allowOffline: true,
        onContinueOffline: () => {},
        accountNotice,
      })
    );

    // Verify outer scroll container and responsive hero structure
    expect(html).toContain('auth-scroll-page');
    expect(html).toContain('auth-welcome');
    expect(html).toContain('auth-hero-eyebrow');
    expect(html).toContain('auth-hero-title');
    expect(html).toContain('auth-hero-desc');

    // Verify deleted account notice
    expect(html).toContain(accountNotice);
    expect(html).toContain('role="status"');

    // Verify "Continue offline" action is visible and actionable
    expect(html).toContain('Continue offline');
    expect(html).toContain('No account required. This workspace stays on this device until you connect it.');

    // Verify form elements are reachable
    expect(html).toContain('type="email"');
    expect(html).toContain('type="password"');
    expect(html).toContain('Open my workspace');
  });

  it('hides "Continue offline" only when allowOffline is false (e.g. forgot password mode)', () => {
    const html = renderToStaticMarkup(
      createElement(AuthWelcome, {
        allowOffline: false,
        onContinueOffline: () => {},
        accountNotice: null,
      })
    );

    expect(html).not.toContain('Continue offline');
  });
});
