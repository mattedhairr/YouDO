import { supabase } from './supabase';
import { localISODate } from './dates';
import { mondayOfLocalISO, monthStartLocalISO, type PaceRow } from './paceBoard';

export function isPaceTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === 'PGRST202' ||
    error.code === '42P01' ||
    error.code === '42883' ||
    (msg.includes('board_pace_rows') && msg.includes('schema cache')) ||
    (msg.includes('public_pace') && msg.includes('schema cache')) ||
    (msg.includes('public_pace') && msg.includes('does not exist'))
  );
}

function asRow(raw: Record<string, unknown>): PaceRow | null {
  const userId = typeof raw.user_id === 'string' ? raw.user_id : '';
  const displayName = typeof raw.display_name === 'string' ? raw.display_name.trim() : '';
  if (!userId || !displayName) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  const updatedAt = typeof raw.updated_at === 'string' ? raw.updated_at : '';
  const updatedDate = updatedAt && Number.isFinite(new Date(updatedAt).getTime())
    ? localISODate(new Date(updatedAt))
    : undefined;
  const dateKey = (value: unknown, fallback: string | undefined) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
  return {
    userId,
    displayName: displayName.slice(0, 40),
    examLabel: typeof raw.exam_label === 'string' ? raw.exam_label.slice(0, 40) : '',
    hashtagId: typeof raw.hashtag_id === 'string' ? raw.hashtag_id : undefined,
    hashtagLabel: typeof raw.hashtag_label === 'string' ? raw.hashtag_label.slice(0, 24) : undefined,
    todayMs: num(raw.today_ms),
    weekMs: num(raw.week_ms),
    monthMs: num(raw.month_ms),
    todayKey: dateKey(raw.today_key, updatedDate),
    weekKey: dateKey(raw.week_key, updatedDate ? mondayOfLocalISO(updatedDate) : undefined),
    monthKey: dateKey(raw.month_key, updatedDate ? monthStartLocalISO(updatedDate) : undefined),
    streak: Math.max(0, Math.round(num(raw.streak))),
    barHours: num(raw.bar_hours) || 1,
    updatedAt,
  };
}

export async function fetchPaceRows(boardTimezone: string): Promise<
  { ok: true; rows: PaceRow[] } | { ok: false; missingTable: boolean }
> {
  const joined = await supabase.rpc('board_pace_rows', { board_timezone: boardTimezone });
  if (!joined.error) {
    const rows = (Array.isArray(joined.data) ? joined.data : [])
      .map((row) => asRow(row as Record<string, unknown>))
      .filter((row): row is PaceRow => !!row);
    return { ok: true, rows };
  }
  // A raw-table fallback would reintroduce the client-uploaded totals this
  // migration removes. Leave the Board unavailable until its RPC is installed.
  return { ok: false, missingTable: isPaceTableMissing(joined.error) };
}

export async function upsertPaceRow(row: {
  userId: string;
  displayName: string;
  examLabel: string;
  barHours: number;
}): Promise<{ ok: boolean; missingTable?: boolean }> {
  const payload = {
      user_id: row.userId,
      display_name: row.displayName.slice(0, 40),
      exam_label: row.examLabel.slice(0, 40),
      bar_hours: row.barHours,
    };
  const { error } = await supabase.from('public_pace').upsert(
    payload,
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}

export async function reconcileBoardEvidence(): Promise<{ ok: boolean; status?: string; rejected?: number }> {
  const { data, error } = await supabase.rpc('reconcile_board_evidence');
  if (error) return { ok: false };
  const result = Array.isArray(data) ? data[0] : data;
  return {
    ok: true,
    status: typeof result?.status === 'string' ? result.status : undefined,
    rejected: typeof result?.rejected === 'number' ? result.rejected : undefined,
  };
}

export async function deletePaceRow(userId: string): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await supabase.from('public_pace').delete().eq('user_id', userId);
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}
