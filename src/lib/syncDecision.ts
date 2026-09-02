export type SyncConflictStrategy = 'merge' | 'cloud' | 'device';

export type SyncDecision =
  | 'noop'
  | 'pull'
  | 'push'
  | 'merge'
  | 'conflict'
  | 'empty-error';

export function decideSyncAction(input: {
  localFingerprint: string;
  remoteFingerprint: string | null;
  baseFingerprint: string | null;
  localEmpty: boolean;
  allowEmpty?: boolean;
  conflictStrategy?: SyncConflictStrategy;
}): SyncDecision {
  const {
    localFingerprint,
    remoteFingerprint,
    baseFingerprint,
    localEmpty,
    allowEmpty,
    conflictStrategy,
  } = input;

  if (allowEmpty) return 'push';
  if (localEmpty && remoteFingerprint) return 'pull';
  if (localEmpty) return 'empty-error';
  if (!remoteFingerprint) {
    return baseFingerprint && conflictStrategy !== 'device' ? 'conflict' : 'push';
  }
  if (localFingerprint === remoteFingerprint) return 'noop';
  if (conflictStrategy === 'cloud') return 'pull';

  const localChanged = !baseFingerprint || localFingerprint !== baseFingerprint;
  const remoteChanged = !baseFingerprint || remoteFingerprint !== baseFingerprint;
  if (baseFingerprint && !localChanged && remoteChanged) return 'pull';
  if (baseFingerprint && localChanged && !remoteChanged) return 'push';
  if (conflictStrategy === 'merge') return 'merge';
  if (conflictStrategy === 'device') return 'push';
  return 'conflict';
}
