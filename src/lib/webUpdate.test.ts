import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

function browser(controlled: boolean) {
  const worker = Object.assign(new EventTarget(), { state: 'installing' });
  const registration = Object.assign(new EventTarget(), { installing: worker, update: vi.fn().mockResolvedValue(undefined) });
  const serviceWorker = Object.assign(new EventTarget(), { controller: controlled ? {} : null, register: vi.fn().mockResolvedValue(registration) });
  const reload = vi.fn();
  const win = Object.assign(new EventTarget(), { location: { reload }, setInterval: vi.fn() });
  const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  const storage = { clear: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal('navigator', { serviceWorker, onLine: true });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('localStorage', storage);
  return { worker, registration, serviceWorker, reload, storage, doc, win };
}

describe('website updates', () => {
  it('offers a refresh after activation without automatically restarting or clearing sign-in', async () => {
    const b = browser(true);
    const updates = await import('./webUpdate');
    updates.registerWebUpdates();
    await Promise.resolve();
    expect(b.serviceWorker.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' });
    b.worker.state = 'activated';
    b.worker.dispatchEvent(new Event('statechange'));
    b.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(updates.webUpdateReady()).toBe(true);
    expect(b.reload).not.toHaveBeenCalled();
    updates.refreshWebApp();
    expect(b.reload).toHaveBeenCalledTimes(1);
    expect(b.storage.clear).not.toHaveBeenCalled();
    expect(b.storage.removeItem).not.toHaveBeenCalled();
  });
  it('does not label a first installation as an available update', async () => {
    const b = browser(false);
    const updates = await import('./webUpdate');
    updates.registerWebUpdates();
    await Promise.resolve();
    b.worker.state = 'activated';
    b.worker.dispatchEvent(new Event('statechange'));
    b.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(updates.webUpdateReady()).toBe(false);
    b.serviceWorker.dispatchEvent(new Event('controllerchange'));
    expect(updates.webUpdateReady()).toBe(true);
  });
  it('checks after returning to the app and retries after a failed update request', async () => {
    const b = browser(true);
    const updates = await import('./webUpdate');
    updates.registerWebUpdates();
    await Promise.resolve();
    b.doc.dispatchEvent(new Event('visibilitychange'));
    b.win.dispatchEvent(new Event('online'));
    expect(b.registration.update).toHaveBeenCalledTimes(3);
    b.registration.update.mockRejectedValueOnce(new Error('offline'));
    await expect(updates.checkWebUpdate()).rejects.toThrow('offline');
    await expect(updates.checkWebUpdate()).resolves.toBe(false);
  });
});
