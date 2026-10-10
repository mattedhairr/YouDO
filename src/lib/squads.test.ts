import { describe, expect, it, vi } from 'vitest';
import {
  paceHoursMatch,
  partitionSquadPaceMembers,
  squadPaceGateMessage,
  createSquad,
  updateSquadPrivacy,
  fetchDiscoverableSquads,
  type Squad,
  type SquadPrivacy,
} from './squads';
import { supabase } from './supabase';

describe('partitionSquadPaceMembers (Unification without segregation)', () => {
  it('unifies all members into collective regardless of different bar hours', () => {
    const members = [{ barHours: 8 }, { barHours: 5 }, { barHours: 8 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 8);
    expect(collective).toHaveLength(3);
    expect(separate).toHaveLength(0);
    expect(collective).toEqual(members);
  });

  it('unifies members even when all personal bar hours differ', () => {
    const members = [{ barHours: 3 }, { barHours: 5 }, { barHours: 7 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 4);
    expect(collective).toHaveLength(3);
    expect(separate).toHaveLength(0);
  });

  it('unifies all members when personal bar hours match', () => {
    const members = [{ barHours: 5 }, { barHours: 5 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 5);
    expect(collective).toHaveLength(2);
    expect(separate).toHaveLength(0);
  });

  it('includes a single member on the collective board', () => {
    const members = [{ barHours: 8 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 8);
    expect(collective).toHaveLength(1);
    expect(separate).toHaveLength(0);
  });

  it('handles empty member list cleanly', () => {
    const { collective, separate } = partitionSquadPaceMembers([], 8);
    expect(collective).toEqual([]);
    expect(separate).toEqual([]);
  });

  it('tolerates null, undefined, or missing squad and member bar hours', () => {
    const members = [
      { barHours: null },
      { barHours: undefined },
      { barHours: 6 },
    ];
    const { collective, separate } = partitionSquadPaceMembers(members, null);
    expect(collective).toHaveLength(3);
    expect(separate).toHaveLength(0);
  });
});

describe('Squad types & privacy', () => {
  it('supports SquadPrivacy values', () => {
    const publicPrivacy: SquadPrivacy = 'anyone_can_join';
    const inviteOnlyPrivacy: SquadPrivacy = 'invite_only';
    expect(publicPrivacy).toBe('anyone_can_join');
    expect(inviteOnlyPrivacy).toBe('invite_only');
  });

  it('allows Squad interface with optional bar_hours and privacy', () => {
    const squad: Squad = {
      id: 'squad-1',
      name: 'Pace-Free Squad',
      description: '🚀',
      allow_join_requests: true,
      privacy: 'anyone_can_join',
      bar_hours: null,
      created_by: 'user-1',
      created_at: new Date().toISOString(),
    };
    expect(squad.bar_hours).toBeNull();
    expect(squad.privacy).toBe('anyone_can_join');
  });
});

describe('paceHoursMatch & squadPaceGateMessage (deprecated compatibility)', () => {
  it('matches equal hours and small float drift', () => {
    expect(paceHoursMatch(8, 8)).toBe(true);
    expect(paceHoursMatch(8, 8.005)).toBe(true);
  });

  it('treats null or undefined hours as non-restrictive match', () => {
    expect(paceHoursMatch(null, 5)).toBe(true);
    expect(paceHoursMatch(8, null)).toBe(true);
    expect(paceHoursMatch(undefined, undefined)).toBe(true);
  });

  it('handles message gracefully', () => {
    const msg = squadPaceGateMessage(8, 5);
    expect(typeof msg).toBe('string');
  });
});

describe('createSquad & updateSquadPrivacy check constraint graceful recovery', () => {
  it('retries with mapped privacy when squads_privacy_check constraint fails', async () => {
    const payloads: Record<string, unknown>[] = [];
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            payloads.push(payload);
            if (payload.privacy === 'anyone_can_join') {
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      code: '23514',
                      message: 'new row for relation "squads" violates check constraint "squads_privacy_check"',
                    },
                  }),
                }),
              };
            }
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sq-10', name: 'Check Test', privacy: 'public', created_by: 'u1' },
                  error: null,
                }),
              }),
            };
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'squad_members') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    const res = await createSquad({
      ownerId: 'u1',
      name: 'Check Test',
      privacy: 'anyone_can_join',
    });

    expect(res.ok).toBe(true);
    expect(res.squad?.id).toBe('sq-10');
    // Normalized to modern privacy in client model
    expect(res.squad?.privacy).toBe('anyone_can_join');
    expect(payloads).toHaveLength(2);
    expect(payloads[0].privacy).toBe('anyone_can_join');
    expect(payloads[1].privacy).toBe('public');
  });

  it('omits privacy column if mapped privacy also fails check constraint', async () => {
    const payloads: Record<string, unknown>[] = [];
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            payloads.push(payload);
            if ('privacy' in payload) {
              return {
                select: vi.fn().mockReturnValue({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: {
                      code: '23514',
                      message: 'violates check constraint "squads_privacy_check"',
                    },
                  }),
                }),
              };
            }
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sq-20', name: 'Check Test 2', created_by: 'u1' },
                  error: null,
                }),
              }),
            };
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'squad_members') {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    const res = await createSquad({
      ownerId: 'u1',
      name: 'Check Test 2',
      privacy: 'invite_only',
    });

    expect(res.ok).toBe(true);
    expect(res.squad?.id).toBe('sq-20');
    expect(payloads).toHaveLength(3);
    expect(payloads[0].privacy).toBe('invite_only');
    expect(payloads[1].privacy).toBe('private');
    expect('privacy' in payloads[2]).toBe(false);
  });

  it('updateSquadPrivacy retries with mapped legacy privacy on check constraint', async () => {
    const updates: Record<string, unknown>[] = [];
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          update: vi.fn((patch: Record<string, unknown>) => {
            updates.push(patch);
            const isLegacy = patch.privacy === 'private';
            return {
              eq: vi.fn().mockResolvedValue({
                error: isLegacy ? null : {
                  code: '23514',
                  message: 'violates check constraint squads_privacy_check',
                },
              }),
            };
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    const ok = await updateSquadPrivacy('sq-1', 'invite_only');
    expect(ok).toBe(true);
    expect(updates).toHaveLength(2);
    expect(updates[0].privacy).toBe('invite_only');
    expect(updates[1].privacy).toBe('private');
  });

  it('fetchDiscoverableSquads normalizes legacy public and private to anyone_can_join and invite_only', async () => {
    vi.spyOn(supabase, 'rpc').mockImplementation((fn: string) => {
      if (fn === 'discover_squads') {
        return Promise.resolve({
          data: [
            { id: 'sq-legacy-1', name: 'Legacy Public Squad', privacy: 'public' },
            { id: 'sq-legacy-2', name: 'Legacy Private Squad', privacy: 'private' },
            { id: 'sq-modern-3', name: 'Modern Squad', privacy: 'anyone_can_join' },
          ],
          error: null,
        }) as unknown as ReturnType<typeof supabase.rpc>;
      }
      return Promise.resolve({ data: null, error: null }) as unknown as ReturnType<typeof supabase.rpc>;
    });

    const squads = await fetchDiscoverableSquads();
    expect(squads).toHaveLength(3);
    expect(squads[0].privacy).toBe('anyone_can_join');
    expect(squads[1].privacy).toBe('invite_only');
    expect(squads[2].privacy).toBe('anyone_can_join');
  });
});

