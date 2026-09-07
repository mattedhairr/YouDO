import { supabase } from './supabase';
import { localISODate } from './dates';
import { mondayOfLocalISO, monthStartLocalISO, type PaceRow } from './paceBoard';

const LEGACY_FIELDS = 'user_id, display_name, exam_label, today_ms, week_ms, month_ms, streak, bar_hours, updated_at';
const CURRENT_FIELDS = `${LEGACY_FIELDS}, today_key, week_key, month_key`;

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

function isWindowKeyMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = (error.message ?? '').toLowerCase();
  return (error.code === '42703' || error.code === 'PGRST204')
    && ['today_key', 'week_key', 'month_key'].some((key) => message.includes(key));
}

export async function fetchPaceRows(): Promise<
  { ok: true; rows: PaceRow[] } | { ok: false; missingTable: boolean }
> {
  const current = await supabase
    .from('public_pace')
    .select(CURRENT_FIELDS);
  let data = current.data as Record<string, unknown>[] | null;
  let error = current.error;
  if (isWindowKeyMissing(error)) {
    const legacy = await supabase.from('public_pace').select(LEGACY_FIELDS);
    data = legacy.data as Record<string, unknown>[] | null;
    error = legacy.error;
  }
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
  todayKey: string;
  weekKey: string;
  monthKey: string;
  streak: number;
  barHours: number;
}): Promise<{ ok: boolean; missingTable?: boolean }> {
  const payload = {
      user_id: row.userId,
      display_name: row.displayName.slice(0, 40),
      exam_label: row.examLabel.slice(0, 40),
      today_ms: Math.max(0, Math.round(row.todayMs)),
      week_ms: Math.max(0, Math.round(row.weekMs)),
      month_ms: Math.max(0, Math.round(row.monthMs)),
      today_key: row.todayKey,
      week_key: row.weekKey,
      month_key: row.monthKey,
      streak: Math.max(0, Math.round(row.streak)),
      bar_hours: row.barHours,
      updated_at: new Date().toISOString(),
    };
  let { error } = await supabase.from('public_pace').upsert(
    payload,
    { onConflict: 'user_id' },
  );
  if (isWindowKeyMissing(error)) {
    const legacyPayload = {
      user_id: payload.user_id,
      display_name: payload.display_name,
      exam_label: payload.exam_label,
      today_ms: payload.today_ms,
      week_ms: payload.week_ms,
      month_ms: payload.month_ms,
      streak: payload.streak,
      bar_hours: payload.bar_hours,
      updated_at: payload.updated_at,
    };
    const legacy = await supabase.from('public_pace').upsert(legacyPayload, { onConflict: 'user_id' });
    error = legacy.error;
  }
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}

export async function deletePaceRow(userId: string): Promise<{ ok: boolean; missingTable?: boolean }> {
  const { error } = await supabase.from('public_pace').delete().eq('user_id', userId);
  if (error) return { ok: false, missingTable: isPaceTableMissing(error) };
  return { ok: true };
}
