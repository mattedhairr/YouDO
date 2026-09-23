export type SyncConflictKind = 'different_copies' | 'stale_revision' | 'ambiguous_merge' | 'cleared_device' | 'missing_cloud' | 'restored_snapshot';

export type SyncConflictRecord = {
  accountId: string;
  kind: SyncConflictKind;
  detectedAt: number;
  localFingerprint: string;
  remoteFingerprint: string | null;
  remoteRevision: number | null;
  reason: string;
};

const kinds = new Set<SyncConflictKind>([
  'different_copies', 'stale_revision', 'ambiguous_merge', 'cleared_device', 'missing_cloud', 'restored_snapshot',
]);

export function parseSyncConflictRecord(raw: string | null, accountId: string): SyncConflictRecord | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as SyncConflictRecord;
    if (!value || value.accountId !== accountId || !kinds.has(value.kind)
      || !Number.isFinite(value.detectedAt) || value.detectedAt < 0
      || typeof value.localFingerprint !== 'string'
      || (value.remoteFingerprint !== null && typeof value.remoteFingerprint !== 'string')
      || (value.remoteRevision !== null && (!Number.isSafeInteger(value.remoteRevision) || value.remoteRevision < 0))
      || typeof value.reason !== 'string') return null;
    return value;
  } catch {
    return null;
  }
}
