import { describe, expect, it } from 'vitest';
import { paceHoursMatch, partitionSquadPaceMembers, squadPaceGateMessage } from './squads';

describe('paceHoursMatch', () => {
  it('matches equal squad and personal bar hours', () => {
    expect(paceHoursMatch(8, 8)).toBe(true);
    expect(paceHoursMatch(6.5, 6.5)).toBe(true);
  });

  it('treats tiny float drift as a match', () => {
    expect(paceHoursMatch(8, 8.005)).toBe(true);
  });

  it('rejects meaningfully different hours', () => {
    expect(paceHoursMatch(8, 6)).toBe(false);
    expect(paceHoursMatch(4, 8)).toBe(false);
  });

  it('explains a mismatch in plain language', () => {
    expect(squadPaceGateMessage(8, 5)).toContain('8h/day');
    expect(squadPaceGateMessage(8, 5)).toContain('5h');
  });
});

describe('partitionSquadPaceMembers', () => {
  it('puts a shared room-bar group on the collective and others aside', () => {
    const members = [{ barHours: 8 }, { barHours: 5 }, { barHours: 8 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 8);
    expect(collective).toHaveLength(2);
    expect(separate).toEqual([{ barHours: 5 }]);
  });

  it('does not create a collective for a single person on the room bar', () => {
    const members = [{ barHours: 8 }, { barHours: 5 }, { barHours: 6 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 8);
    expect(collective).toHaveLength(0);
    expect(separate).toHaveLength(3);
  });

  it('uses a shared personal bar when two or more match and nobody shares the room bar', () => {
    const members = [{ barHours: 5 }, { barHours: 5 }, { barHours: 6 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 8);
    expect(collective).toHaveLength(2);
    expect(collective.every((m) => m.barHours === 5)).toBe(true);
    expect(separate).toEqual([{ barHours: 6 }]);
  });

  it('keeps everyone separate when all hours differ', () => {
    const members = [{ barHours: 5 }, { barHours: 6 }, { barHours: 8 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 4);
    expect(collective).toHaveLength(0);
    expect(separate).toHaveLength(3);
  });

  it('puts everyone on the collective when all hours match', () => {
    const members = [{ barHours: 5 }, { barHours: 5 }];
    const { collective, separate } = partitionSquadPaceMembers(members, 5);
    expect(collective).toHaveLength(2);
    expect(separate).toHaveLength(0);
  });
});
