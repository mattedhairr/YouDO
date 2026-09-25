import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { from: mocks.from, rpc: mocks.rpc } }));
import { fetchPaceRows, reconcileBoardEvidence, upsertPaceRow } from './paceCloud';

beforeEach(() => vi.resetAllMocks());

describe('public Board request boundaries', () => {
  it('accepts derived server rows with the viewer timezone', async () => {
    mocks.rpc.mockResolvedValue({ data: [{
      user_id: 'u1', display_name: 'Aspirant', exam_label: '',
      today_ms: 3600000, week_ms: 3600000, month_ms: 3600000,
      today_key: '2026-09-24', week_key: '2026-09-21', month_key: '2026-09-01',
      streak: 1, bar_hours: 1, updated_at: '2026-09-24T12:00:00Z',
    }], error: null });
    const result = await fetchPaceRows('Asia/Kolkata');
    expect(mocks.rpc).toHaveBeenCalledWith('board_pace_rows', { board_timezone: 'Asia/Kolkata' });
    expect(result).toMatchObject({ ok: true, rows: [{ userId: 'u1', todayMs: 3600000 }] });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('never falls back to untrusted raw totals when the RPC is unavailable', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'RPC missing' } });
    expect(await fetchPaceRows('UTC')).toEqual({ ok: false, missingTable: true });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('uploads profile fields without any computed focus totals', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ upsert });
    expect(await upsertPaceRow({ userId: 'u1', displayName: ' A ', examLabel: 'GATE', barHours: 1 })).toEqual({ ok: true });
    expect(upsert).toHaveBeenCalledWith({
      user_id: 'u1', display_name: ' A ', exam_label: 'GATE', bar_hours: 1,
    }, { onConflict: 'user_id' });
  });

  it('reports reconciliation failure without changing the private backup', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'offline' } });
    expect(await reconcileBoardEvidence()).toEqual({ ok: false });
    expect(mocks.rpc).toHaveBeenCalledWith('reconcile_board_evidence');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('returns excluded-session count for an honest Board status', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ status: 'current', accepted: 2, rejected: 1 }], error: null });
    expect(await reconcileBoardEvidence()).toEqual({ ok: true, status: 'current', rejected: 1 });
  });
});
