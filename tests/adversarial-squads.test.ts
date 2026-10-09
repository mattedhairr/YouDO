import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  paceHoursMatch,
  squadPaceGateMessage,
  partitionSquadPaceMembers,
  createSquad,
  updateSquadPrivacy,
  inviteUserToSquadByUsername,
  fetchPendingSquadInvites,
} from '../src/lib/squads';
import { supabase } from '../src/lib/supabase';
import * as profilesModule from '../src/lib/profiles';

describe('Adversarial Challenge: partitionSquadPaceMembers', () => {
  it('handles massive member volume (50,000 members) without stack overflow or performance degradation', () => {
    const start = performance.now();
    const count = 50_000;
    const members = Array.from({ length: count }, (_, i) => ({
      userId: `user-${i}`,
      barHours: i % 10 === 0 ? null : (i % 8) + 1,
    }));

    const result = partitionSquadPaceMembers(members, 8);
    const elapsed = performance.now() - start;

    expect(result.collective).toHaveLength(count);
    expect(result.separate).toHaveLength(0);
    // Unification must complete in under 100ms
    expect(elapsed).toBeLessThan(100);
  });

  it('guarantees shallow immutability: mutating collective does not alter input array', () => {
    const original = [{ id: 1, barHours: 2 }, { id: 2, barHours: 4 }];
    const inputCopy = [...original];

    const { collective } = partitionSquadPaceMembers(original, 4);
    collective.push({ id: 3, barHours: 6 });
    collective.shift();

    expect(original).toEqual(inputCopy);
    expect(original).toHaveLength(2);
  });

  it('tolerates extreme, abnormal, and hostile barHours types (NaN, Infinity, negative, zero, subnormals)', () => {
    const hostileMembers = [
      { id: 'null', barHours: null },
      { id: 'undefined', barHours: undefined },
      { id: 'zero', barHours: 0 },
      { id: 'negative', barHours: -10 },
      { id: 'nan', barHours: NaN },
      { id: 'pos_inf', barHours: Infinity },
      { id: 'neg_inf', barHours: -Infinity },
      { id: 'subnormal', barHours: 1e-15 },
      { id: 'huge', barHours: Number.MAX_SAFE_INTEGER },
      { id: 'fraction', barHours: 1 / 3 },
    ];

    // Tested with various squadBarHours
    for (const squadBar of [null, undefined, 0, -5, NaN, Infinity, 8]) {
      const { collective, separate } = partitionSquadPaceMembers(hostileMembers, squadBar);
      expect(collective).toHaveLength(hostileMembers.length);
      expect(separate).toHaveLength(0);
      expect(collective).toEqual(hostileMembers);
    }
  });

  it('preserves exact order and duplicate member records', () => {
    const duplicate = { userId: 'dup-1', barHours: 4 };
    const members = [duplicate, duplicate, duplicate];

    const { collective, separate } = partitionSquadPaceMembers(members, 4);
    expect(collective).toHaveLength(3);
    expect(separate).toHaveLength(0);
    expect(collective[0]).toBe(duplicate);
    expect(collective[1]).toBe(duplicate);
    expect(collective[2]).toBe(duplicate);
  });

  it('handles empty and single-element inputs smoothly', () => {
    const empty = partitionSquadPaceMembers([]);
    expect(empty.collective).toEqual([]);
    expect(empty.separate).toEqual([]);

    const single = partitionSquadPaceMembers([{ barHours: 10 }]);
    expect(single.collective).toHaveLength(1);
    expect(single.separate).toHaveLength(0);
  });
});

describe('Adversarial Challenge: paceHoursMatch & squadPaceGateMessage (deprecated compatibility)', () => {
  it('correctly handles float precision drift (0.1 + 0.2 vs 0.3)', () => {
    expect(paceHoursMatch(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('treats null and undefined as wildcard non-blocking matches', () => {
    expect(paceHoursMatch(null, 4)).toBe(true);
    expect(paceHoursMatch(4, null)).toBe(true);
    expect(paceHoursMatch(null, null)).toBe(true);
    expect(paceHoursMatch(undefined, 8)).toBe(true);
    expect(paceHoursMatch(8, undefined)).toBe(true);
    expect(paceHoursMatch(undefined, undefined)).toBe(true);
  });

  it('returns true for exact zero and matching values', () => {
    expect(paceHoursMatch(0, 0)).toBe(true);
    expect(paceHoursMatch(5, 5)).toBe(true);
    expect(paceHoursMatch(8, 8.009)).toBe(true); // drift < 0.01
    expect(paceHoursMatch(8, 8.011)).toBe(false); // drift > 0.01
  });

  it('returns false for mismatched non-null numbers including NaN/Infinities', () => {
    expect(paceHoursMatch(NaN, 5)).toBe(false);
    expect(paceHoursMatch(5, NaN)).toBe(false);
    expect(paceHoursMatch(Infinity, Infinity)).toBe(false); // Infinity - Infinity is NaN
  });

  it('squadPaceGateMessage always returns empty string for all inputs', () => {
    expect(squadPaceGateMessage(8, 2)).toBe('');
    expect(squadPaceGateMessage(null, 5)).toBe('');
    expect(squadPaceGateMessage(undefined, undefined)).toBe('');
    expect(squadPaceGateMessage(NaN, Infinity)).toBe('');
  });
});

describe('Adversarial Challenge: createSquad', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects empty or whitespace-only squad names in both object and positional modes', async () => {
    const res1 = await createSquad({ ownerId: 'u1', name: '' });
    expect(res1.ok).toBe(false);
    expect(res1.error).toBe('Please give your squad a name.');

    const res2 = await createSquad({ ownerId: 'u1', name: '   \n\t  ' });
    expect(res2.ok).toBe(false);
    expect(res2.error).toBe('Please give your squad a name.');

    const res3 = await createSquad('u1', '   ', '🔥');
    expect(res3.ok).toBe(false);
    expect(res3.error).toBe('Please give your squad a name.');
  });

  it('omits bar_hours from insert payload when 0, negative, NaN, null, or undefined', async () => {
    let capturedPayload: Record<string, unknown> | null = null;

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            capturedPayload = payload;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sq-1', name: 'Test', created_by: 'u1' },
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

    // Test with 0 barHours
    await createSquad({ ownerId: 'u1', name: 'Zero Bar', barHours: 0 });
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.bar_hours).toBeUndefined();

    // Test with negative barHours
    await createSquad({ ownerId: 'u1', name: 'Neg Bar', barHours: -5 });
    expect(capturedPayload!.bar_hours).toBeUndefined();

    // Test with NaN barHours
    await createSquad({ ownerId: 'u1', name: 'NaN Bar', barHours: NaN });
    expect(capturedPayload!.bar_hours).toBeUndefined();

    // Test with null barHours
    await createSquad({ ownerId: 'u1', name: 'Null Bar', barHours: null });
    expect(capturedPayload!.bar_hours).toBeUndefined();

    // Test with valid positive barHours
    await createSquad({ ownerId: 'u1', name: 'Valid Bar', barHours: 6 });
    expect(capturedPayload!.bar_hours).toBe(6);
  });

  it('correctly maps privacy and allow_join_requests for invite_only vs anyone_can_join', async () => {
    let capturedPayload: Record<string, unknown> | null = null;

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          insert: vi.fn((payload: Record<string, unknown>) => {
            capturedPayload = payload;
            return {
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'sq-1', name: 'Test', created_by: 'u1' },
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

    // Invite-only squad
    await createSquad({ ownerId: 'u1', name: 'Secret Room', privacy: 'invite_only' });
    expect(capturedPayload!.privacy).toBe('invite_only');
    expect(capturedPayload!.allow_join_requests).toBe(false);

    // Anyone-can-join squad
    await createSquad({ ownerId: 'u1', name: 'Public Room', privacy: 'anyone_can_join' });
    expect(capturedPayload!.privacy).toBe('anyone_can_join');
    expect(capturedPayload!.allow_join_requests).toBe(true);
  });

  it('deduplicates initial invites and filters out owner self-invite', async () => {
    const memberInserts: unknown[] = [];

    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'squads') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: 'sq-1', name: 'Test', created_by: 'u1' },
                error: null,
              }),
            }),
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === 'squad_members') {
        return {
          insert: vi.fn((rows: unknown) => {
            memberInserts.push(rows);
            return Promise.resolve({ error: null });
          }),
        } as unknown as ReturnType<typeof supabase.from>;
      }
      return {} as unknown as ReturnType<typeof supabase.from>;
    });

    // Pass owner u1, duplicate u2, duplicate u3
    await createSquad({
      ownerId: 'u1',
      name: 'Squad with Invites',
      initialInviteUserIds: ['u1', 'u2', 'u2', 'u3', 'u3', 'u1'],
    });

    // First insert was owner as admin
    expect(memberInserts[0]).toEqual({
      squad_id: 'sq-1',
      user_id: 'u1',
      role: 'admin',
      status: 'accepted',
    });

    // Second insert was invitees: should only contain u2 and u3 once each, u1 excluded
    expect(memberInserts[1]).toEqual([
      { squad_id: 'sq-1', user_id: 'u2', role: 'member', status: 'invited' },
      { squad_id: 'sq-1', user_id: 'u3', role: 'member', status: 'invited' },
    ]);
  });
});

describe('Adversarial Challenge: updateSquadPrivacy', () => {
  it('updates privacy and automatically synchronizes allow_join_requests', async () => {
    let updatePayload: Record<string, unknown> | null = null;
    let targetSquadId = '';

    vi.spyOn(supabase, 'from').mockImplementation(() => {
      return {
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayload = payload;
          return {
            eq: vi.fn((_col: string, val: string) => {
              targetSquadId = val;
              return Promise.resolve({ error: null });
            }),
          };
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const res1 = await updateSquadPrivacy('sq-100', 'invite_only');
    expect(res1).toBe(true);
    expect(targetSquadId).toBe('sq-100');
    expect(updatePayload).toEqual({
      privacy: 'invite_only',
      allow_join_requests: false,
    });

    const res2 = await updateSquadPrivacy('sq-100', 'anyone_can_join');
    expect(res2).toBe(true);
    expect(updatePayload).toEqual({
      privacy: 'anyone_can_join',
      allow_join_requests: true,
    });
  });
});

describe('Adversarial Challenge: inviteUserToSquadByUsername', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects malformed, empty, and solo-@ username inputs before making network calls', async () => {
    const rpcSpy = vi.spyOn(supabase, 'rpc');

    const res1 = await inviteUserToSquadByUsername('sq-1', '');
    expect(res1).toEqual({ ok: false, error: 'Enter a valid username.' });

    const res2 = await inviteUserToSquadByUsername('sq-1', '   ');
    expect(res2).toEqual({ ok: false, error: 'Enter a valid username.' });

    const res3 = await inviteUserToSquadByUsername('sq-1', '@');
    expect(res3).toEqual({ ok: false, error: 'Enter a valid username.' });

    expect(rpcSpy).not.toHaveBeenCalled();
  });

  it('normalizes handles (removes leading @, trims whitespace, converts to lowercase)', async () => {
    let capturedParams: Record<string, unknown> | null = null;
    vi.spyOn(supabase, 'rpc').mockImplementation((_fn: string, params: unknown) => {
      capturedParams = params as Record<string, unknown>;
      return Promise.resolve({
        data: { ok: true, user_id: 'target-u' },
        error: null,
      }) as unknown as ReturnType<typeof supabase.rpc>;
    });

    const res = await inviteUserToSquadByUsername('sq-1', '  @AlEX_99  ');
    expect(res).toEqual({ ok: true, userId: 'target-u' });
    expect(capturedParams).toEqual({
      p_squad_id: 'sq-1',
      p_username: 'alex_99',
    });
  });

  it('propagates RPC errors cleanly', async () => {
    vi.spyOn(supabase, 'rpc').mockResolvedValue({
      data: { ok: false, error: 'User is already in this squad or has a pending invite' },
      error: null,
    } as unknown as ReturnType<typeof supabase.rpc>);

    const res = await inviteUserToSquadByUsername('sq-1', 'alex');
    expect(res.ok).toBe(false);
    expect(res.error).toBe('User is already in this squad or has a pending invite');
  });

  it('falls back to client-side profile search when RPC throws an error', async () => {
    vi.spyOn(supabase, 'rpc').mockRejectedValue(new Error('RPC function not found'));
    vi.spyOn(profilesModule, 'searchProfileByUsername').mockResolvedValue({
      id: 'fallback-u-9',
      username: 'bob',
      display_name: 'Bob',
      stats_private: false,
      avatar_url: null,
      bio: null,
      created_at: '',
      updated_at: '',
    });

    let insertedMember: unknown = null;
    vi.spyOn(supabase, 'from').mockImplementation(() => {
      return {
        insert: vi.fn((row: unknown) => {
          insertedMember = row;
          return Promise.resolve({ error: null });
        }),
      } as unknown as ReturnType<typeof supabase.from>;
    });

    const res = await inviteUserToSquadByUsername('sq-1', '@bob');
    expect(res).toEqual({ ok: true, userId: 'fallback-u-9' });
    expect(insertedMember).toEqual({
      squad_id: 'sq-1',
      user_id: 'fallback-u-9',
      role: 'member',
      status: 'invited',
    });
  });
});

describe('Adversarial Challenge: fetchPendingSquadInvites', () => {
  it('filters out orphaned invites where the squad record is null or deleted', async () => {
    vi.spyOn(supabase, 'from').mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [
              {
                squad_id: 'sq-live',
                status: 'invited',
                squads: { id: 'sq-live', name: 'Alive Squad' },
              },
              {
                squad_id: 'sq-dead',
                status: 'invited',
                squads: null, // orphaned row
              },
            ],
            error: null,
          }),
        }),
      }),
    } as unknown as ReturnType<typeof supabase.from>);

    const pending = await fetchPendingSquadInvites('u1');
    expect(pending).toHaveLength(1);
    expect(pending[0].squad_id).toBe('sq-live');
  });
});
