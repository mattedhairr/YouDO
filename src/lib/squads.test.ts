import { describe, expect, it } from 'vitest';
import {
  paceHoursMatch,
  partitionSquadPaceMembers,
  squadPaceGateMessage,
  type Squad,
  type SquadPrivacy,
} from './squads';

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

