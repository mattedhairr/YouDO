import { describe, expect, it } from 'vitest';
import { parseBackupPayload } from './backup';

describe('replacement backup validation', () => {
  it.each([{}, [], { error: 'not a backup' }, { tasks: 'damaged', goals: [] }, { tasks: [], goals: {} }])(
    'does not interpret an unrelated or damaged document as an empty workspace: %j', value => {
      expect(parseBackupPayload(JSON.stringify(value))).toBeNull();
    },
  );
  it('refuses to silently discard a malformed task', () => {
    expect(parseBackupPayload(JSON.stringify({ tasks: [{ id: 'lost' }], goals: [] }))).toBeNull();
  });
  it('refuses to silently discard an unreadable goal branch', () => {
    expect(parseBackupPayload(JSON.stringify({ tasks: [], goals: [{ title: 'Exam', children: [{ id: 'lost' }] }] }))).toBeNull();
    expect(parseBackupPayload(JSON.stringify({ tasks: [], goals: [{ title: 'Exam', children: 'damaged' }] }))).toBeNull();
  });
  it.each([{ sessionHistory: [] }, { sessionHistory: { task: 'damaged' } }, { recentlyDeletedGoals: {} }, { deletionLedger: [{ kind: 'task', id: '', contentFingerprint: '', deletedAt: -1 }] }])(
    'refuses an invalid history or trash container: %j', extra => {
      expect(parseBackupPayload(JSON.stringify({ tasks: [], goals: [], ...extra }))).toBeNull();
    },
  );
  it('accepts an explicitly empty workspace and legacy compact arrays', () => {
    expect(parseBackupPayload('{"tasks":[],"goals":[]}')).toMatchObject({ tasks: [], goals: [] });
    expect(parseBackupPayload('{"t":[{"i":"t1","t":"Revise"}],"g":[]}')?.tasks[0]).toMatchObject({ id: 't1', title: 'Revise' });
  });
});
