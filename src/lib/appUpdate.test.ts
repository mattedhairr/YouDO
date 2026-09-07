import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkAppUpdateStatus, checkForAppUpdate, compareAppVersions, dismissAppUpdate, releaseHighlights } from './appUpdate';
import { APP_VERSION } from './version';

const NEXT_VERSION = `${Number(APP_VERSION.split('.')[0]) + 1}.0.0`;

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('app updates', () => {
  it('does not report an offline check as up to date', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('navigator', { onLine: false });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(checkAppUpdateStatus()).resolves.toEqual({ release: null, checked: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not report a rejected release request as up to date', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(checkAppUpdateStatus({ force: true })).resolves.toEqual({ release: null, checked: false });
  });

  it('distinguishes a successful current-version check from an unavailable one', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ tag_name: `v${APP_VERSION}`, html_url: `https://github.com/mattedhairr/YouDO/releases/tag/v${APP_VERSION}`, draft: false, prerelease: false }),
    }));
    await expect(checkAppUpdateStatus({ force: true })).resolves.toEqual({ release: null, checked: true });
  });
  it('compares semantic release versions without treating v prefixes differently', () => {
    expect(compareAppVersions('v6.0.0', '5.0.0')).toBe(1);
    expect(compareAppVersions('6.0', '6.0.0')).toBe(0);
    expect(compareAppVersions('6.0.0', '6.1.0')).toBe(-1);
    expect(compareAppVersions('10.0.0', '9.9.9')).toBe(1);
  });

  it('extracts a short plain-language changelog from release bullets', () => {
    const body = [
      '## v7',
      '- **Safer sync** — Your device plan stays isolated.',
      '- [Clear history](https://example.com) with restore points.',
      '- `Update notice` opens the official release.',
      '- Fourth item is intentionally omitted.',
    ].join('\n');
    expect(releaseHighlights(body)).toEqual([
      'Safer sync — Your device plan stays isolated.',
      'Clear history with restore points.',
      'Update notice opens the official release.',
    ]);
  });

  it('ignores an update cache written by an older installed app version', async () => {
    vi.stubGlobal('localStorage', memoryStorage({
      'youdo-update-check-v1': JSON.stringify({ checkedAt: Date.now(), release: null }),
    }));
    vi.stubGlobal('navigator', { onLine: true });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: `v${NEXT_VERSION}`,
        html_url: `https://github.com/mattedhairr/YouDO/releases/tag/v${NEXT_VERSION}`,
        body: '- A safer update check.',
        draft: false,
        prerelease: false,
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const release = await checkForAppUpdate();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(release?.version).toBe(NEXT_VERSION);
  });

  it('keeps a dismissed release available for the Settings update centre', async () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        tag_name: `v${NEXT_VERSION}`,
        html_url: `https://github.com/mattedhairr/YouDO/releases/tag/v${NEXT_VERSION}`,
        body: '- Better release access.',
        draft: false,
        prerelease: false,
      }),
    }));

    dismissAppUpdate(NEXT_VERSION);

    await expect(checkForAppUpdate({ force: true })).resolves.toBeNull();
    await expect(checkForAppUpdate({ includeDismissed: true })).resolves.toMatchObject({ version: NEXT_VERSION });
  });
});
