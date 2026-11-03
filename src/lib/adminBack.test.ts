import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminBackStep, setAdminBackHandler } from './adminBack';

describe('adminBackStep', () => {
  afterEach(() => setAdminBackHandler(null));

  it('lets Back close the Admin Hub when nothing handles it', () => {
    expect(adminBackStep()).toBe(false);
    setAdminBackHandler(() => false);
    expect(adminBackStep()).toBe(false);
  });

  it('keeps the Admin Hub open when a page inside it handled Back', () => {
    const handler = vi.fn(() => true);
    setAdminBackHandler(handler);
    expect(adminBackStep()).toBe(true);
    expect(handler).toHaveBeenCalledOnce();
  });
});
