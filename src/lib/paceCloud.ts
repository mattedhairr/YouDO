import { supabase } from './supabase';
import type { PaceRow } from './paceBoard';

export function isPaceTableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message ?? '').toLowerCase();
  return (
    error.code === 'PGRST205' ||
    error.code === '42P01' ||
    (msg.includes('public_pace') && msg.includes('schema cache')) ||
    (msg.includes('public_pace') && msg.includes('does not exist'))
  );
}

function asRow(raw: Record<string, unknown>): PaceRow | null {
  const userId = typeof raw.user_id === 'string' ? raw.user_id : '';
  const displayName = typeof raw.display_name === 'string' ? raw.display_name.trim() : '';
  if (!userId || !displayName) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
  return {
    userId,
    displayName: displayName.slice(0, 40),
    examLabel: typeof raw.exam_label === 'string' ? raw.exam_label.slice(0, 40) : '',
    todayMs: num(raw.today_ms),
    weekMs: num(raw.week_ms),
    monthMs: num(raw.month_ms),
    streak: Math.max(0, Math.round(num(raw.streak))),
    barHours: num(raw.bar_hours) || 1,
    updatedAt: typeof raw.updated_at === 'string' ? raw.updated_at : '',
  };
}

export async function fetchPaceRows(): Promise<
  { ok: true; rows: PaceRow[] } | { ok: false; missingTable: boolean }
> {
  const { data, error } = await supabase
    .from('public_pace')
    .select('user_id, display_name, exam_label, today_ms, week_ms, month_ms, streak, bar_hours, updated_at');
  if (error) {
    return { ok: false, missingTable: isPaceTableMissing(error) };
  }
  const rows = (data ?? []).map((r) => asRow(r as Record<string, unknown>)).filter((r): r is PaceRow => !!r);
  return { ok: true, rows };
}

export async function upsertPaceRow(row: {
  userId: string;
  displayName: string;
  examLabel: string;
  todayMs: number;
  weekMs: number;
  monthMs: number;
  streak: number;
  barHours: number;
}): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await supabase.from('public_pace').upsert(
    {
      user_id: row.userId,
      display_name: row.displayName.slice(0, 40),
      exam_label: row.examLabel.slice(0, 40),
      today_ms: Math.max(0, Math.round(row.todayMs)),
      week_ms: Math.max(0, Math.round(row.weekMs)),
      month_ms: Math.max(0, Math.round(row.monthMs)),
      streak: Math.max(0, Math.round(row.streak)),
      bar_hours: row.barHours,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}

export async function deletePaceRow(userId: string): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await supabase.from('public_pace').delete().eq('user_id', userId);
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}
