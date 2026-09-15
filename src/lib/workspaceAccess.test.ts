import { describe, expect, it } from 'vitest';
import { canOpenAccountWorkspace } from './workspaceAccess';

describe('workspace render boundary', () => {
  it('opens only the account whose workspace inspection finished', () => {
    expect(canOpenAccountWorkspace('a', 'a', 'a')).toBe(true);
  });
  it('does not reuse account A readiness during account B first render', () => {
    expect(canOpenAccountWorkspace('b', 'a', 'a')).toBe(false);
    expect(canOpenAccountWorkspace('b', 'a', 'b')).toBe(false);
  });
  it('blocks a missing or changed local owner even after inspection', () => {
    expect(canOpenAccountWorkspace('a', 'a', null)).toBe(false);
    expect(canOpenAccountWorkspace('a', 'a', 'b')).toBe(false);
    expect(canOpenAccountWorkspace(null, 'a', 'a')).toBe(false);
  });
});
