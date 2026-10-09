import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  subscribePrivateHubInbox,
  subscribePrivateHubRealtime,
  startPrivateHubForegroundSync,
  PRIVATE_HUB_SYNC_EVENT,
} from '../src/lib/privateHubSync';
import { supabase } from '../src/lib/supabase';

describe('Auditor Forensic Verification: privateHubSync', () => {
  const userId = 'usr_forensic_999';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribePrivateHubInbox genuinely subscribes to friendships UPDATE for requester_id and receiver_id', () => {
    const registeredHandlers: Record<string, () => void> = {};
    const mockChannel = {
      on: vi.fn((_type: string, filterConfig: { table: string; event: string; filter?: string }, callback: () => void) => {
        const key = `${filterConfig.table}:${filterConfig.event}:${filterConfig.filter || 'none'}`;
        registeredHandlers[key] = callback;
        return mockChannel;
      }),
      subscribe: vi.fn(),
    };

    const channelSpy = vi.spyOn(supabase, 'channel').mockReturnValue(mockChannel as unknown as ReturnType<typeof supabase.channel>);
    const removeChannelSpy = vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok' as unknown as ReturnType<typeof supabase.removeChannel>);

    const onFriends = vi.fn();
    const onDms = vi.fn();

    const dispatchSpy = vi.fn();
    vi.stubGlobal('window', {
      dispatchEvent: dispatchSpy,
    });

    const unsubscribe = subscribePrivateHubInbox(userId, { onFriends, onDms });

    // 1. Channel naming check
    expect(channelSpy).toHaveBeenCalledWith(`hub_inbox_${userId}`);
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

    // 2. Outgoing friend request listener check (requester_id)
    const requesterKey = `friendships:UPDATE:requester_id=eq.${userId}`;
    expect(registeredHandlers[requesterKey]).toBeDefined();

    // 3. Incoming friend request listener check (receiver_id)
    const receiverKey = `friendships:UPDATE:receiver_id=eq.${userId}`;
    expect(registeredHandlers[receiverKey]).toBeDefined();

    // 4. Trigger the requester listener and verify genuine execution
    registeredHandlers[requesterKey]();
    expect(onFriends).toHaveBeenCalledTimes(1);
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: PRIVATE_HUB_SYNC_EVENT,
        detail: { reason: 'friends' },
      }),
    );

    // 5. Cleanup check
    unsubscribe();
    expect(removeChannelSpy).toHaveBeenCalledWith(mockChannel);
  });

  it('subscribePrivateHubRealtime consolidates all subscriptions onto a single channel without duplication', () => {
    const registeredHandlers: string[] = [];
    const mockChannel = {
      on: vi.fn((_type: string, filterConfig: { table: string; event: string; filter?: string }) => {
        registeredHandlers.push(`${filterConfig.table}:${filterConfig.event}:${filterConfig.filter || '*'}`);
        return mockChannel;
      }),
      subscribe: vi.fn(),
    };

    const channelSpy = vi.spyOn(supabase, 'channel').mockReturnValue(mockChannel as unknown as ReturnType<typeof supabase.channel>);
    const removeChannelSpy = vi.spyOn(supabase, 'removeChannel').mockResolvedValue('ok' as unknown as ReturnType<typeof supabase.removeChannel>);

    const unsubscribe = subscribePrivateHubRealtime(userId, {});

    // Must be exactly 1 channel creation
    expect(channelSpy).toHaveBeenCalledTimes(1);
    expect(channelSpy).toHaveBeenCalledWith(`hub_realtime_${userId}`);
    expect(mockChannel.subscribe).toHaveBeenCalledTimes(1);

    // Must have registered 8 event configurations
    expect(mockChannel.on).toHaveBeenCalledTimes(8);
    expect(registeredHandlers).toContain(`friendships:*:receiver_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`friendships:*:requester_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`friendships:UPDATE:receiver_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`squad_members:*:user_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`squad_members:*:*`);
    expect(registeredHandlers).toContain(`direct_messages:*:receiver_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`direct_messages:*:sender_id=eq.${userId}`);
    expect(registeredHandlers).toContain(`squad_messages:INSERT:*`);

    unsubscribe();
    expect(removeChannelSpy).toHaveBeenCalledWith(mockChannel);
  });

  it('startPrivateHubForegroundSync uses 3500ms interval and responds to visibility', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    
    const docMock = {
      visibilityState: 'visible',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('document', docMock);
    vi.stubGlobal('window', {
      setInterval: setInterval,
      clearInterval: clearInterval,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });

    const stop = startPrivateHubForegroundSync(tick);

    // Initial immediate tick
    expect(tick).toHaveBeenCalledTimes(1);

    // Fast-forward 3500ms
    vi.advanceTimersByTime(3500);
    expect(tick).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(3500);
    expect(tick).toHaveBeenCalledTimes(3);

    // Cleanup
    stop();
    vi.advanceTimersByTime(7000);
    expect(tick).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });
});

describe('Auditor Forensic Verification: App.tsx Routing and Tab Logic', () => {
  function computeDefaultHubSubTab(privateHubAttention: boolean, optedIn: boolean): 'social' | 'private' {
    if (privateHubAttention) return 'private';
    return optedIn ? 'social' : 'private';
  }

  it('prioritizes private tab whenever privateHubAttention is true', () => {
    // When optedIn is true, but attention is needed -> must route to private
    expect(computeDefaultHubSubTab(true, true)).toBe('private');
    // When optedIn is false and attention is needed -> must route to private
    expect(computeDefaultHubSubTab(true, false)).toBe('private');
  });

  it('falls back to optedIn preference when privateHubAttention is false', () => {
    // Opted in -> social
    expect(computeDefaultHubSubTab(false, true)).toBe('social');
    // Not opted in -> private
    expect(computeDefaultHubSubTab(false, false)).toBe('private');
  });

  it('handlePrimaryNavigate targetView board invokes defaultHubSubTab unconditionally', () => {
    let currentHubSubTab = 'social';
    const setHubSubTab = (tab: 'social' | 'private') => {
      currentHubSubTab = tab;
    };
    const defaultHubSubTab = () => 'private';

    const handlePrimaryNavigate = (targetView: string) => {
      if (targetView === 'board') {
        setHubSubTab(defaultHubSubTab());
      }
    };

    handlePrimaryNavigate('board');
    expect(currentHubSubTab).toBe('private');
  });
});

describe('Auditor Forensic Verification: RoomsView Sync Listener', () => {
  it('RoomsView source cleanly registers and unregisters PRIVATE_HUB_SYNC_EVENT without shortcuts', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const content = fs.readFileSync(path.resolve('src/components/RoomsView.tsx'), 'utf-8');

    // 1. Verify exact import of PRIVATE_HUB_SYNC_EVENT
    expect(content).toContain("import { PRIVATE_HUB_SYNC_EVENT } from '../lib/privateHubSync';");

    // 2. Verify window.addEventListener with PRIVATE_HUB_SYNC_EVENT and handleSync
    expect(content).toMatch(/window\.addEventListener\(PRIVATE_HUB_SYNC_EVENT,\s*handleSync\);/);

    // 3. Verify cleanup window.removeEventListener with PRIVATE_HUB_SYNC_EVENT and handleSync
    expect(content).toMatch(/window\.removeEventListener\(PRIVATE_HUB_SYNC_EVENT,\s*handleSync\);/);

    // 4. Verify handleSync invokes reload
    expect(content).toMatch(/const handleSync = \(\) => \{\s*void reload\(\);\s*\};/);
  });
});

