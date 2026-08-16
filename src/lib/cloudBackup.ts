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

/** Once per app visit: freeze the current live cloud row before this visit overwrites it. */
export async function freezeLiveBackupForVisit(userId: string): Promise<'ok' | 'retry'> {
  if (!freezeState || freezeState.userId !== userId) {
    freezeState = { userId, done: false };
  }
  if (freezeState.done) return 'ok';

  const { data: live, error: liveErr } = await supabase
    .from('user_backups')
    .select('backup_data')
    .eq('user_id', userId)
    .maybeSingle();

  if (liveErr) return 'retry';
  if (!live?.backup_data) {
    freezeState.done = true;
    return 'ok';
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
    return 'ok';
  }

  const { error: insertErr } = await supabase.from('user_backup_snapshots').insert({
    user_id: userId,
    backup_data: live.backup_data,
  });

      if (insertErr) {
        const missing = /does not exist|schema cache/i.test(insertErr.message);
        if (missing) {
          // The user_backup_snapshots table is not set up in this environment.
          // Log a warning so developers can diagnose, but do not block the sync.
          console.warn('[YouDO] user_backup_snapshots table not found — visit snapshots unavailable. Run the snapshot migration SQL.');
          freezeState.done = true;
          return 'ok';
        }
        return 'retry';
      }
  await pruneVisitSnapshots(userId);
  freezeState.done = true;
  return 'ok';
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
