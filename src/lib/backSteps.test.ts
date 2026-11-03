import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBackStep, setBackStep } from './backSteps';

describe('runBackStep', () => {
  afterEach(() => { setBackStep('admin', null); setBackStep('hub', null); });

  it('lets Back carry on when the screen has nothing to step back from', () => {
    expect(runBackStep('admin')).toBe(false);
    setBackStep('admin', vi.fn());
    setBackStep('admin', null);
    expect(runBackStep('admin')).toBe(false);
  });

  it('runs only the step of the screen that was asked', () => {
    const admin = vi.fn();
    const hub = vi.fn();
    setBackStep('admin', admin);
    setBackStep('hub', hub);
    expect(runBackStep('hub')).toBe(true);
    expect(hub).toHaveBeenCalledOnce();
    expect(admin).not.toHaveBeenCalled();
  });
});
