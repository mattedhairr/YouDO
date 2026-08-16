import { supabase } from './supabase';

export const MAX_VISIT_SNAPSHOTS = 3;

export type VisitSnapshotMeta = {
  id: string;
  createdAt: string;
};

let freezeState: { userId: string; done: boolean } | null = null;

export function resetVisitSnapshotFreeze(userId?: string): void {
  if (!userId) {
    freezeState = null;
    return;
  }
  freezeState = { userId, done: false };
}

async function pruneVisitSnapshots(userId: string): Promise<void> {
  const { data, error } = await supabase
    .from('user_backup_snapshots')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error || !data || data.length <= MAX_VISIT_SNAPSHOTS) return;

  const extraIds = data.slice(MAX_VISIT_SNAPSHOTS).map((row) => row.id);
  if (extraIds.length === 0) return;
  await supabase.from('user_backup_snapshots').delete().in('id', extraIds);
}

/** Once per app visit: freeze the current live cloud row. Never blocks the live write. */
export async function freezeLiveBackupForVisit(userId: string): Promise<void> {
  if (!freezeState || freezeState.userId !== userId) {
    freezeState = { userId, done: false };
  }
  if (freezeState.done) return;

  const { data: live, error: liveErr } = await supabase
    .from('user_backups')
    .select('backup_data')
    .eq('user_id', userId)
    .maybeSingle();

  if (liveErr) return;
  if (!live?.backup_data) {
    freezeState.done = true;
    return;
  }

  const { data: latest } = await supabase
    .from('user_backup_snapshots')
    .select('backup_data')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.backup_data === live.backup_data) {
    freezeState.done = true;
    return;
  }

  const { error: insertErr } = await supabase.from('user_backup_snapshots').insert({
    user_id: userId,
    backup_data: live.backup_data,
  });

  if (insertErr) {
    const missing = /does not exist|schema cache/i.test(insertErr.message);
    if (missing) {
      console.warn('[YouDO] user_backup_snapshots table not found — visit snapshots unavailable.');
      freezeState.done = true;
    }
    return;
  }
  await pruneVisitSnapshots(userId);
  freezeState.done = true;
}

const MAX_BACKUP_BYTES = 4 * 1024 * 1024;

export async function upsertLiveBackup(
  userId: string,
  jsonStr: string,
): Promise<{ ok: boolean; error?: string }> {
  if (jsonStr.length > MAX_BACKUP_BYTES) {
    return {
      ok: false,
      error: `Backup is too large (${(jsonStr.length / 1024 / 1024).toFixed(1)} MB). In Settings, trim sittings older than 90 days, then tap Sync now.`,
    };
  }

  await freezeLiveBackupForVisit(userId);
  const now = new Date().toISOString();
  const { error } = await supabase.from('user_backups').upsert(
    { user_id: userId, backup_data: jsonStr, updated_at: now },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.error('upsertLiveBackup:', error);
    return { ok: false, error: error.message || 'Database update failed' };
  }
  return { ok: true };
}

export async function fetchBackupData(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_backups')
    .select('backup_data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('fetchBackupData:', error.message);
    return null;
  }
  return data?.backup_data ?? null;
}

export async function listVisitSnapshots(userId: string): Promise<VisitSnapshotMeta[]> {
  const { data, error } = await supabase
    .from('user_backup_snapshots')
    .select('id, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(MAX_VISIT_SNAPSHOTS);

  if (error || !data) return [];
  return data.map((row) => ({ id: row.id as string, createdAt: row.created_at as string }));
}

export async function fetchVisitSnapshotData(userId: string, snapshotId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('user_backup_snapshots')
    .select('backup_data')
    .eq('user_id', userId)
    .eq('id', snapshotId)
    .maybeSingle();

  if (error) return null;
  return data?.backup_data ?? null;
}

export async function fetchLiveBackupMeta(
  userId: string,
): Promise<{ backupData: string; updatedAt: string } | null> {
  const { data, error } = await supabase
    .from('user_backups')
    .select('backup_data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data?.backup_data) return null;
  return { backupData: data.backup_data as string, updatedAt: data.updated_at as string };
}

export function visitSnapshotLabel(indexFromNewest: number): string {
  if (indexFromNewest === 0) return 'When you opened this time';
  if (indexFromNewest === 1) return 'Previous time you opened';
  return '2 opens ago';
}
