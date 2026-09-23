import { describe, expect, it } from 'vitest';
import { parseSyncConflictRecord, type SyncConflictRecord } from './syncConflictRecord';

const record: SyncConflictRecord = {
  accountId: 'account-a', kind: 'different_copies', detectedAt: 10,
  localFingerprint: 'local', remoteFingerprint: 'remote', remoteRevision: 4,
  reason: 'Both copies changed.',
};

describe('account-bound sync conflict record', () => {
  it('restores a valid conflict only for its original account', () => {
    expect(parseSyncConflictRecord(JSON.stringify(record), 'account-a')).toEqual(record);
    expect(parseSyncConflictRecord(JSON.stringify(record), 'account-b')).toBeNull();
  });
  it('ignores malformed or corrupted records', () => {
    expect(parseSyncConflictRecord('{broken', 'account-a')).toBeNull();
    expect(parseSyncConflictRecord(JSON.stringify({ ...record, remoteRevision: -1 }), 'account-a')).toBeNull();
    expect(parseSyncConflictRecord(JSON.stringify({ ...record, kind: 'allow_overwrite' }), 'account-a')).toBeNull();
  });
});
