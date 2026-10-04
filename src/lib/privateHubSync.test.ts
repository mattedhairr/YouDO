import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { PRIVATE_HUB_SYNC_EVENT, dispatchPrivateHubSync } from './privateHubSync';

describe('privateHubSync', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { dispatchEvent: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dispatches sync event with reason', () => {
    dispatchPrivateHubSync('pending');
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PRIVATE_HUB_SYNC_EVENT,
        detail: { reason: 'pending' },
      }),
    );
  });
});
