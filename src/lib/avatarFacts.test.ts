import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { missingIds, parseAvatarFacts } from './avatarFacts';

describe('avatar facts', () => {
  it('reads pictures, emoji and the backer flag, and skips bad rows', () => {
    const facts = parseAvatarFacts([
      { id: 'a', avatar_url: 'https://example.com/a.jpg', is_backer: true },
      { id: 'b', avatar_url: '🦉', is_backer: false },
      { id: 'c', avatar_url: '   ', is_backer: null },
      { avatar_url: 'https://example.com/x.jpg' },
      null,
    ]);
    expect(facts.get('a')).toEqual({ avatarUrl: 'https://example.com/a.jpg', backer: true });
    expect(facts.get('b')).toEqual({ avatarUrl: '🦉', backer: false });
    expect(facts.get('c')).toEqual({ avatarUrl: undefined, backer: false });
    expect(facts.size).toBe(3);
    expect(parseAvatarFacts(null).size).toBe(0);
  });

  it('asks only for people not asked for yet, once each', () => {
    expect(missingIds(['a', 'b', 'a', '', 'c'], new Set(['b']))).toEqual(['a', 'c']);
  });
});
