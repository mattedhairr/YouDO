import { describe, expect, it, vi } from 'vitest';
import { refreshBoard } from './boardRefresh';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('Board refresh ordering', () => {
  it('shows rankings while backup synchronization is still pending', async () => {
    const sync = deferred<void>();
    const show = vi.fn();
    const read = vi.fn().mockResolvedValueOnce('current').mockResolvedValueOnce('synced');
    const work = refreshBoard({ read, show, synchronize: () => sync.promise, cancelled: () => false });
    await Promise.resolve();
    expect(show).toHaveBeenCalledExactlyOnceWith('current');
    sync.resolve();
    await work;
    expect(show.mock.calls).toEqual([['current'], ['synced']]);
  });
  it('does not let a slow initial response overwrite the refreshed ranking', async () => {
    const first = deferred<string>();
    const read = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValueOnce('synced');
    const show = vi.fn();
    const work = refreshBoard({ read, show, synchronize: async () => {}, cancelled: () => false });
    await Promise.resolve();
    expect(read).toHaveBeenCalledTimes(1);
    first.resolve('current');
    await work;
    expect(show.mock.calls).toEqual([['current'], ['synced']]);
  });
  it('keeps fetched rankings when sync fails', async () => {
    const show = vi.fn();
    const read = vi.fn().mockResolvedValue('current');
    await refreshBoard({ read, show, synchronize: async () => { throw new Error('offline'); }, cancelled: () => false });
    expect(show).toHaveBeenCalledExactlyOnceWith('current');
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not show responses from a cancelled account or view', async () => {
    const show = vi.fn();
    const read = vi.fn().mockResolvedValue('previous account');
    await refreshBoard({ read, show, synchronize: async () => {}, cancelled: () => true });
    expect(show).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(1);
  });
});
