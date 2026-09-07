import { describe, expect, it, vi } from 'vitest';
import { closeTopOverlay, registerOverlayCloser } from './overlayNavigation';

describe('dialog Back routing', () => {
  it('closes only the top dialog and then returns control to its parent', () => {
    const parent = vi.fn(); const child = vi.fn();
    const removeParent = registerOverlayCloser(parent); const removeChild = registerOverlayCloser(child);
    expect(closeTopOverlay()).toBe(true); expect(child).toHaveBeenCalledOnce(); expect(parent).not.toHaveBeenCalled();
    removeChild(); expect(closeTopOverlay()).toBe(true); expect(parent).toHaveBeenCalledOnce();
    removeParent(); expect(closeTopOverlay()).toBe(false);
  });
  it('handles out-of-order and repeated cleanup without losing a blocking dialog', () => {
    const removeParent = registerOverlayCloser(() => {}); const removeChild = registerOverlayCloser(() => {});
    removeParent(); removeParent(); expect(closeTopOverlay()).toBe(true);
    removeChild(); expect(closeTopOverlay()).toBe(false);
  });
});
