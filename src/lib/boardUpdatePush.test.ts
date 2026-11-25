import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), upsert: vi.fn() }));
vi.mock('./supabase', () => ({
  supabase: { rpc: mocks.rpc, from: () => ({ upsert: mocks.upsert }) },
}));

import { notifyCommunityUpdate } from './community';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from './notifications';
import { syncPushPreferences } from './pushPreferences';

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.upsert.mockReset();
});

const prefs = (publicHub: Partial<NotificationPreferences['publicHub']>, enabled = true): NotificationPreferences => ({
  ...DEFAULT_NOTIFICATION_PREFERENCES,
  enabled,
  publicHub: { ...DEFAULT_NOTIFICATION_PREFERENCES.publicHub, ...publicHub },
});

describe('Board update push preference', () => {
  it('is on by default', () => {
    expect(DEFAULT_NOTIFICATION_PREFERENCES.publicHub.boardUpdates).toBe(true);
  });

  it('syncs the switch, and follows the master and Public Hub switches', async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    await syncPushPreferences('u1', prefs({ boardUpdates: true }));
    await syncPushPreferences('u1', prefs({ boardUpdates: false }));
    await syncPushPreferences('u1', prefs({ enabled: false, boardUpdates: true }));
    await syncPushPreferences('u1', prefs({ boardUpdates: true }, false));
    expect(mocks.upsert.mock.calls.map(([row]) => row.board_updates)).toEqual([true, false, false, false]);
  });

  it('keeps syncing the community switches before the server has the backer-claim column', async () => {
    mocks.upsert.mockResolvedValueOnce({ error: { code: 'PGRST204' } }).mockResolvedValueOnce({ error: null });
    await syncPushPreferences('u1', prefs({}));
    expect(mocks.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.upsert.mock.calls[0][0]).toHaveProperty('admin_backers', true);
    expect(mocks.upsert.mock.calls[1][0]).not.toHaveProperty('admin_backers');
    expect(mocks.upsert.mock.calls[1][0]).toMatchObject({ user_id: 'u1', community_messages: 'mentions', board_updates: true });
  });

  it('keeps syncing Board updates before the server has the community columns', async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValueOnce({ error: null });
    await syncPushPreferences('u1', prefs({}));
    expect(mocks.upsert).toHaveBeenCalledTimes(3);
    expect(mocks.upsert.mock.calls[2][0]).not.toHaveProperty('community_messages');
    expect(mocks.upsert.mock.calls[2][0]).toMatchObject({ user_id: 'u1', board_updates: true });
  });

  it('keeps syncing the other switches before the server has the column', async () => {
    mocks.upsert
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValueOnce({ error: { code: 'PGRST204' } })
      .mockResolvedValueOnce({ error: null });
    await syncPushPreferences('u1', prefs({}));
    expect(mocks.upsert).toHaveBeenCalledTimes(4);
    expect(mocks.upsert.mock.calls[3][0]).not.toHaveProperty('board_updates');
    expect(mocks.upsert.mock.calls[3][0]).toMatchObject({ user_id: 'u1', direct_messages: true });
  });
});

describe('notifyCommunityUpdate', () => {
  it('reports how many members were notified', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: 12, error: null });
    await expect(notifyCommunityUpdate()).resolves.toEqual({ ok: true, sent: 12 });
    expect(mocks.rpc).toHaveBeenCalledWith('notify_community_update');
  });

  it('explains a server that has not been updated yet', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202', message: 'not found' } });
    await expect(notifyCommunityUpdate()).resolves.toMatchObject({ ok: false, error: 'Notifications for updates need a server update first.' });
  });
});
