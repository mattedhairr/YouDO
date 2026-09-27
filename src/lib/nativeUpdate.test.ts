import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppRelease } from './appUpdate';

const plugin = vi.hoisted(() => ({ prepareUpdate: vi.fn(), installUpdate: vi.fn(), openInstallSettings: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  registerPlugin: () => plugin,
  Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
}));
const release: AppRelease = { version: '9.0.0', name: 'YouDO', url: 'https://github.com/mattedhairr/YouDO/releases/tag/v9.0.0', highlights: [], publishedAt: '',
  apk: { url: 'https://github.com/mattedhairr/YouDO/releases/download/v9.0.0/YouDO.apk', sha256: 'a'.repeat(64) } };
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); });

describe('Android update flow', () => {
  it('requires download verification and permission before invoking the installer', async () => {
    const updater = await import('./nativeUpdate');
    await updater.installAppUpdate();
    expect(plugin.installUpdate).not.toHaveBeenCalled();
    plugin.prepareUpdate.mockResolvedValue({ ready: true, installAllowed: false });
    await updater.downloadAppUpdate(release);
    expect(updater.nativeUpdateState().phase).toBe('permission');
    expect(plugin.prepareUpdate).toHaveBeenCalledWith({ ...release.apk, version: release.version });
    plugin.openInstallSettings.mockResolvedValue(undefined);
    await updater.allowAppUpdates();
    plugin.installUpdate.mockResolvedValueOnce({ permissionRequired: true }).mockResolvedValueOnce({ permissionRequired: false });
    await updater.installAppUpdate();
    expect(updater.nativeUpdateState().phase).toBe('permission');
    await updater.allowAppUpdates();
    await updater.installAppUpdate();
    expect(updater.nativeUpdateState().phase).toBe('ready');
  });
  it('allows retry after a corrupt or failed download without invoking installation', async () => {
    const updater = await import('./nativeUpdate');
    plugin.prepareUpdate.mockRejectedValueOnce(new Error('Verification failed')).mockResolvedValueOnce({ ready: true, installAllowed: true });
    await updater.downloadAppUpdate(release);
    expect(updater.nativeUpdateState()).toMatchObject({ phase: 'idle', error: 'Verification failed' });
    await updater.installAppUpdate();
    expect(plugin.installUpdate).not.toHaveBeenCalled();
    await updater.downloadAppUpdate(release);
    expect(updater.nativeUpdateState()).toMatchObject({ phase: 'ready', error: '' });
  });
  it('prevents duplicate downloads and clears state when installer verification fails', async () => {
    const updater = await import('./nativeUpdate');
    let resolve!: (value: unknown) => void;
    plugin.prepareUpdate.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const first = updater.downloadAppUpdate(release);
    await updater.downloadAppUpdate(release);
    expect(plugin.prepareUpdate).toHaveBeenCalledTimes(1);
    resolve({ ready: true, installAllowed: true });
    await first;
    plugin.installUpdate.mockRejectedValue(new Error('APK no longer matches'));
    await updater.installAppUpdate();
    expect(updater.nativeUpdateState()).toMatchObject({ phase: 'idle', error: 'APK no longer matches' });
  });
});
