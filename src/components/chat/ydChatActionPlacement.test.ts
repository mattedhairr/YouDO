import { describe, expect, it } from 'vitest';
import { ydChatActionsPreferBelow } from './ydChatActionPlacement';

describe('ydChatActionsPreferBelow', () => {
  it('returns false when anchor is missing', () => {
    expect(ydChatActionsPreferBelow(null)).toBe(false);
  });
});
