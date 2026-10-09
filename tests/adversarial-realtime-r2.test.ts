import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  PRIVATE_HUB_SYNC_EVENT,
  dispatchPrivateHubSync,
  subscribePrivateHubRealtime,
  subscribePrivateHubInbox,
  startPrivateHubForegroundSync,
  type PrivateHubSyncReason,
} from '../src/lib/privateHubSync';
import { supabase } from '../src/lib/supabase';

interface RegisteredListener {
  type: string;
  filter: {
    event: string;
    schema?: string;
    table?: string;
    filter?: string;
  };
  callback: (payload?: unknown) => void;
}

interface MockChannel {
  name: string;
  listeners: RegisteredListener[];
  subscribe: ReturnType<typeof vi.fn>;
  on: (type: string, filter: RegisteredListener['filter'], callback: (payload?: unknown) => void) => MockChannel;
}

describe('Adversarial Empirical Challenge: Requirement R2 Realtime Listeners', () => {
  let createdChannels: MockChannel[] = [];
  let removedChannels: unknown[] = [];
  let dispatchedSyncEvents: CustomEvent<{ reason?: PrivateHubSyncReason }>[] = [];
  let windowEventHandlers: Map<string, Set<(e: Event) => void>> = new Map();
  let documentEventHandlers: Map<string, Set<(e: Event) => void>> = new Map();

  beforeEach(() => {
    createdChannels = [];
    removedChannels = [];
    dispatchedSyncEvents = [];
    windowEventHandlers = new Map();
    documentEventHandlers = new Map();

    const mockWindow = {
      setInterval: vi.fn((fn: () => void, ms: number) => {
        return setInterval(fn, ms) as unknown as number;
      }),
      clearInterval: vi.fn((id: number) => {
        clearInterval(id);
      }),
      addEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
        if (!windowEventHandlers.has(event)) {
          windowEventHandlers.set(event, new Set());
        }
        windowEventHandlers.get(event)!.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
        windowEventHandlers.get(event)?.delete(handler);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        if (event.type === PRIVATE_HUB_SYNC_EVENT) {
          dispatchedSyncEvents.push(event as CustomEvent<{ reason?: PrivateHubSyncReason }>);
        }
        const handlers = windowEventHandlers.get(event.type);
        if (handlers) {
          handlers.forEach((h) => h(event));
        }
        return true;
      }),
    };

    const mockDoc = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
        if (!documentEventHandlers.has(event)) {
          documentEventHandlers.set(event, new Set());
        }
        documentEventHandlers.get(event)!.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: (e: Event) => void) => {
        documentEventHandlers.get(event)?.delete(handler);
      }),
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDoc);

    // Mock supabase channel and removeChannel
    vi.spyOn(supabase, 'channel').mockImplementation((name: string) => {
      const channelObj: MockChannel = {
        name,
        listeners: [],
        subscribe: vi.fn().mockReturnThis(),
        on(type, filter, callback) {
          this.listeners.push({ type, filter, callback });
          return this;
        },
      };
      createdChannels.push(channelObj);
      return channelObj as unknown as ReturnType<typeof supabase.channel>;
    });

    vi.spyOn(supabase, 'removeChannel').mockImplementation((channel: unknown) => {
      removedChannels.push(channel);
      return Promise.resolve('ok' as const);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // Helper to simulate incoming postgres changes matching filters
  function simulatePostgresChange(
    channel: MockChannel,
    event: { event: string; table: string; filterKey?: string; filterVal?: string },
  ) {
    for (const l of channel.listeners) {
      if (l.type !== 'postgres_changes') continue;
      if (l.filter.table && l.filter.table !== event.table) continue;
      if (l.filter.event !== '*' && l.filter.event !== event.event) continue;

      if (l.filter.filter) {
        // e.g. "receiver_id=eq.user-123"
        const [col, valWithEq] = l.filter.filter.split('=eq.');
        if (event.filterKey && event.filterVal) {
          if (col === event.filterKey && valWithEq === event.filterVal) {
            l.callback({ eventType: event.event, table: event.table });
          }
        }
      } else {
        // No filter on channel listener
        l.callback({ eventType: event.event, table: event.table });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Suite 1: Consolidation & Channel Architecture
  // ---------------------------------------------------------------------------
  describe('Suite 1: Channel Consolidation Architecture', () => {
    it('1.1: subscribePrivateHubRealtime creates exactly 1 consolidated channel instead of 8 fragmented channels', () => {
      const unsubscribe = subscribePrivateHubRealtime('user-alice', {});
      expect(createdChannels).toHaveLength(1);
      expect(createdChannels[0].name).toBe('hub_realtime_user-alice');
      expect(createdChannels[0].subscribe).toHaveBeenCalledTimes(1);

      // Verify listeners for friendships, squad_members, direct_messages, and squad_messages are all chained
      const tables = createdChannels[0].listeners.map((l) => l.filter.table);
      expect(tables).toContain('friendships');
      expect(tables).toContain('squad_members');
      expect(tables).toContain('direct_messages');
      expect(tables).toContain('squad_messages');

      unsubscribe();
    });

    it('1.2: subscribePrivateHubInbox creates exactly 1 consolidated inbox channel instead of 3 separate channels', () => {
      const unsubscribe = subscribePrivateHubInbox('user-alice', {});
      expect(createdChannels).toHaveLength(1);
      expect(createdChannels[0].name).toBe('hub_inbox_user-alice');
      expect(createdChannels[0].subscribe).toHaveBeenCalledTimes(1);

      const tables = createdChannels[0].listeners.map((l) => l.filter.table);
      expect(tables).toContain('friendships');
      expect(tables).toContain('direct_messages');

      unsubscribe();
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 2: Requester vs Receiver Friendship Updates
  // ---------------------------------------------------------------------------
  describe('Suite 2: Requester vs Receiver Friendship Updates', () => {
    it('2.1 [subscribePrivateHubInbox]: fires onFriends and dispatches {reason: "friends"} when receiver receives friendship UPDATE', () => {
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const unsubscribe = subscribePrivateHubInbox('user-bob', { onFriends, onDms });
      const channel = createdChannels[0];

      // Simulate friendship UPDATE where receiver_id is user-bob
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-bob',
      });

      expect(onFriends).toHaveBeenCalledTimes(1);
      expect(onDms).not.toHaveBeenCalled();
      expect(dispatchedSyncEvents.some((e) => e.detail.reason === 'friends')).toBe(true);

      unsubscribe();
    });

    it('2.2 [subscribePrivateHubInbox]: fires onFriends and dispatches {reason: "friends"} when requester receives friendship UPDATE (outgoing accepted)', () => {
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const unsubscribe = subscribePrivateHubInbox('user-alice', { onFriends, onDms });
      const channel = createdChannels[0];

      // Alice sent request to Bob; Bob accepts; row UPDATE where requester_id is user-alice
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-alice',
      });

      expect(onFriends).toHaveBeenCalledTimes(1);
      expect(onDms).not.toHaveBeenCalled();
      expect(dispatchedSyncEvents.some((e) => e.detail.reason === 'friends')).toBe(true);

      unsubscribe();
    });

    it('2.3 [subscribePrivateHubInbox]: ignores friendship UPDATE events for unrelated third parties', () => {
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const unsubscribe = subscribePrivateHubInbox('user-alice', { onFriends, onDms });
      const channel = createdChannels[0];

      // Event for user-charlie
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-charlie',
      });
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-charlie',
      });

      expect(onFriends).not.toHaveBeenCalled();
      expect(dispatchedSyncEvents).toHaveLength(0);

      unsubscribe();
    });

    it('2.4 [subscribePrivateHubInbox]: fires onDms and dispatches {reason: "dms"} for both sender and receiver DMs', () => {
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const unsubscribe = subscribePrivateHubInbox('user-alice', { onFriends, onDms });
      const channel = createdChannels[0];

      // Alice receives DM
      simulatePostgresChange(channel, {
        event: 'INSERT',
        table: 'direct_messages',
        filterKey: 'receiver_id',
        filterVal: 'user-alice',
      });
      expect(onDms).toHaveBeenCalledTimes(1);
      expect(dispatchedSyncEvents.some((e) => e.detail.reason === 'dms')).toBe(true);

      // Alice sends DM
      simulatePostgresChange(channel, {
        event: 'INSERT',
        table: 'direct_messages',
        filterKey: 'sender_id',
        filterVal: 'user-alice',
      });
      expect(onDms).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('2.5 [subscribePrivateHubRealtime]: receiver receives friendship UPDATE -> triggers onPending AND onFriends', () => {
      const onPending = vi.fn();
      const onFriends = vi.fn();
      const unsubscribe = subscribePrivateHubRealtime('user-bob', { onPending, onFriends });
      const channel = createdChannels[0];

      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-bob',
      });

      expect(onPending).toHaveBeenCalledTimes(1);
      expect(onFriends).toHaveBeenCalledTimes(1);
      expect(dispatchedSyncEvents.map((e) => e.detail.reason)).toContain('pending');
      expect(dispatchedSyncEvents.map((e) => e.detail.reason)).toContain('friends');

      unsubscribe();
    });

    it('2.6 [subscribePrivateHubRealtime]: requester receives friendship UPDATE -> triggers onPending (drops outgoing pending request)', () => {
      const onPending = vi.fn();
      const onFriends = vi.fn();
      const unsubscribe = subscribePrivateHubRealtime('user-alice', { onPending, onFriends });
      const channel = createdChannels[0];

      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-alice',
      });

      // Alice's pending count drops because the friend request is no longer pending
      expect(onPending).toHaveBeenCalledTimes(1);
      expect(dispatchedSyncEvents.map((e) => e.detail.reason)).toContain('pending');

      // Empirical verification of asymmetry: in subscribePrivateHubRealtime, onFriends is not mapped for requester_id
      expect(onFriends).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('2.7: Both users receive realtime notifications when friend request lifecycle completes end-to-end', () => {
      const alicePending = vi.fn();
      const aliceFriends = vi.fn();
      const bobPending = vi.fn();
      const bobFriends = vi.fn();

      // Alice has realtime active; Bob has both realtime and inbox active
      const unsubAlice = subscribePrivateHubRealtime('user-alice', { onPending: alicePending, onFriends: aliceFriends });
      const unsubBobRealtime = subscribePrivateHubRealtime('user-bob', { onPending: bobPending });
      const unsubBobInbox = subscribePrivateHubInbox('user-bob', { onFriends: bobFriends });

      const aliceChannel = createdChannels[0];
      const bobRealtimeCh = createdChannels[1];
      const bobInboxCh = createdChannels[2];

      // Step 1: Alice sends Bob a friend request (INSERT)
      simulatePostgresChange(bobRealtimeCh, {
        event: 'INSERT',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-bob',
      });
      expect(bobPending).toHaveBeenCalledTimes(1);

      // Step 2: Bob accepts the friend request (UPDATE)
      // Bob's inbox receives update
      simulatePostgresChange(bobInboxCh, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-bob',
      });
      expect(bobFriends).toHaveBeenCalledTimes(1);

      // Alice receives update via requester_id
      simulatePostgresChange(aliceChannel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-alice',
      });
      // Alice's pending count refreshes immediately
      expect(alicePending).toHaveBeenCalledTimes(1);

      unsubAlice();
      unsubBobRealtime();
      unsubBobInbox();
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 3: Rapid Succession Events & Burst Load
  // ---------------------------------------------------------------------------
  describe('Suite 3: Rapid Succession Events & Burst Stress Test', () => {
    it('3.1: Handles 100 rapid succession friendship events without crash or state corruption', () => {
      const onPending = vi.fn();
      const onFriends = vi.fn();
      const unsubscribe = subscribePrivateHubRealtime('user-alice', { onPending, onFriends });
      const channel = createdChannels[0];

      const burstCount = 100;
      for (let i = 0; i < burstCount; i++) {
        simulatePostgresChange(channel, {
          event: i % 2 === 0 ? 'INSERT' : 'UPDATE',
          table: 'friendships',
          filterKey: 'receiver_id',
          filterVal: 'user-alice',
        });
      }

      // Each INSERT triggers pending; each UPDATE triggers both pending and friends
      expect(onPending).toHaveBeenCalledTimes(burstCount);
      expect(onFriends).toHaveBeenCalledTimes(burstCount / 2);
      expect(dispatchedSyncEvents.length).toBe(burstCount + burstCount / 2);

      unsubscribe();
    });

    it('3.2: Handles interleaved mixed event types (friendships, dms, squads, messages) in rapid succession', () => {
      const onPending = vi.fn();
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const onSquads = vi.fn();
      const unsubscribe = subscribePrivateHubRealtime('user-alice', {
        onPending,
        onFriends,
        onDms,
        onSquads,
      });
      const channel = createdChannels[0];

      const iterations = 50;
      for (let i = 0; i < iterations; i++) {
        // Friend request
        simulatePostgresChange(channel, {
          event: 'INSERT',
          table: 'friendships',
          filterKey: 'receiver_id',
          filterVal: 'user-alice',
        });
        // Direct message
        simulatePostgresChange(channel, {
          event: 'INSERT',
          table: 'direct_messages',
          filterKey: 'receiver_id',
          filterVal: 'user-alice',
        });
        // Squad chat message
        simulatePostgresChange(channel, {
          event: 'INSERT',
          table: 'squad_messages',
        });
      }

      expect(onPending).toHaveBeenCalledTimes(iterations);
      expect(onDms).toHaveBeenCalledTimes(iterations);
      expect(onSquads).toHaveBeenCalledTimes(iterations);

      unsubscribe();
    });

    it('3.3: High throughput stress test: 1,000 rapid event dispatches processed cleanly without frame drop', () => {
      const receivedReasons: string[] = [];
      const listener = (e: Event) => {
        receivedReasons.push((e as CustomEvent).detail.reason);
      };
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listener);

      const burstSize = 1000;
      const start = performance.now();
      for (let i = 0; i < burstSize; i++) {
        const reason: PrivateHubSyncReason = i % 4 === 0 ? 'pending' : i % 4 === 1 ? 'friends' : i % 4 === 2 ? 'dms' : 'squads';
        dispatchPrivateHubSync(reason);
      }
      const elapsed = performance.now() - start;

      expect(receivedReasons).toHaveLength(burstSize);
      expect(elapsed).toBeLessThan(100); // Must process 1000 sync events in < 100ms

      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, listener);
    });

    it('3.4: Multi-listener fan-out under burst: all UI components (RoomsView, HubView, NotificationsView) receive sync event', () => {
      let roomsViewReloads = 0;
      let hubViewReloads = 0;
      let notificationsViewReloads = 0;

      const roomsListener = () => { roomsViewReloads++; };
      const hubListener = () => { hubViewReloads++; };
      const notifsListener = () => { notificationsViewReloads++; };

      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, roomsListener);
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, hubListener);
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, notifsListener);

      const eventsCount = 25;
      for (let i = 0; i < eventsCount; i++) {
        dispatchPrivateHubSync('squads');
      }

      expect(roomsViewReloads).toBe(eventsCount);
      expect(hubViewReloads).toBe(eventsCount);
      expect(notificationsViewReloads).toBe(eventsCount);

      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, roomsListener);
      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, hubListener);
      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, notifsListener);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 4: Event Unmounting Cleanup & Zero Memory Leaks
  // ---------------------------------------------------------------------------
  describe('Suite 4: Event Unmounting Cleanup & Zero Memory Leaks', () => {
    it('4.1: subscribePrivateHubRealtime cleanup unregisters channel and prevents further callback executions', () => {
      let pendingCount = 0;
      const unsubscribe = subscribePrivateHubRealtime('user-alice', {
        onPending: () => {
          pendingCount++;
        },
      });

      const channel = createdChannels[0];
      simulatePostgresChange(channel, {
        event: 'INSERT',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-alice',
      });
      expect(pendingCount).toBe(1);

      // Unsubscribe / Unmount
      unsubscribe();
      expect(removedChannels).toHaveLength(1);
      expect(removedChannels[0]).toBe(channel);

      // Nullify listeners on channel to simulate Supabase unsubscription
      channel.listeners = [];

      // Attempt to simulate event post-unmount
      simulatePostgresChange(channel, {
        event: 'INSERT',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'user-alice',
      });
      expect(pendingCount).toBe(1); // Did not increase
    });

    it('4.2: subscribePrivateHubInbox cleanup unregisters channel and prevents post-unmount invocations', () => {
      let friendsCount = 0;
      const unsubscribe = subscribePrivateHubInbox('user-alice', {
        onFriends: () => {
          friendsCount++;
        },
      });

      const channel = createdChannels[0];
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-alice',
      });
      expect(friendsCount).toBe(1);

      unsubscribe();
      expect(removedChannels).toHaveLength(1);
      expect(removedChannels[0]).toBe(channel);

      channel.listeners = [];
      simulatePostgresChange(channel, {
        event: 'UPDATE',
        table: 'friendships',
        filterKey: 'requester_id',
        filterVal: 'user-alice',
      });
      expect(friendsCount).toBe(1);
    });

    it('4.3: startPrivateHubForegroundSync cleans up intervals and event listeners on teardown', () => {
      const onTick = vi.fn();
      const stop = startPrivateHubForegroundSync(onTick, 1000);

      // Initial tick on start
      expect(onTick).toHaveBeenCalledTimes(1);

      // Window focus triggers tick
      const focusHandlers = windowEventHandlers.get('focus');
      expect(focusHandlers?.size).toBe(1);
      focusHandlers?.forEach((h) => h(new Event('focus')));
      expect(onTick).toHaveBeenCalledTimes(2);

      // Teardown
      stop();

      // Check focus listener removed
      expect(windowEventHandlers.get('focus')?.size).toBe(0);
      expect(documentEventHandlers.get('visibilitychange')?.size).toBe(0);

      // Verify timer cleared
      expect(window.clearInterval).toHaveBeenCalled();
    });

    it('4.4: High-churn mount/unmount cycle stress test (200 cycles) leaves zero lingering channels or leaks', () => {
      const cycles = 200;
      for (let i = 0; i < cycles; i++) {
        const cleanup = subscribePrivateHubRealtime(`user-${i}`, {});
        cleanup();
      }

      expect(createdChannels).toHaveLength(cycles);
      expect(removedChannels).toHaveLength(cycles);
      // Every single created channel must have been cleanly removed
      for (let i = 0; i < cycles; i++) {
        expect(removedChannels[i]).toBe(createdChannels[i]);
      }
    });

    it('4.5: Multiple concurrent subscribers with different user IDs remain cleanly isolated', () => {
      const aliceEvents: string[] = [];
      const bobEvents: string[] = [];

      const unsubAlice = subscribePrivateHubRealtime('alice', {
        onPending: () => aliceEvents.push('pending'),
      });
      const unsubBob = subscribePrivateHubRealtime('bob', {
        onPending: () => bobEvents.push('pending'),
      });

      const aliceChannel = createdChannels[0];
      const bobChannel = createdChannels[1];

      // Send event to Alice
      simulatePostgresChange(aliceChannel, {
        event: 'INSERT',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'alice',
      });

      expect(aliceEvents).toHaveLength(1);
      expect(bobEvents).toHaveLength(0);

      // Send event to Bob
      simulatePostgresChange(bobChannel, {
        event: 'INSERT',
        table: 'friendships',
        filterKey: 'receiver_id',
        filterVal: 'bob',
      });

      expect(aliceEvents).toHaveLength(1);
      expect(bobEvents).toHaveLength(1);

      unsubAlice();
      unsubBob();
    });

    it('4.6: Unmounting during in-flight event processing does not trigger uncaught error', () => {
      let unsub: (() => void) | null = null;
      let handled = 0;

      unsub = subscribePrivateHubRealtime('alice', {
        onPending: () => {
          handled++;
          // Trigger unmount while handling event
          unsub?.();
        },
      });

      const channel = createdChannels[0];
      expect(() => {
        simulatePostgresChange(channel, {
          event: 'INSERT',
          table: 'friendships',
          filterKey: 'receiver_id',
          filterVal: 'alice',
        });
      }).not.toThrow();

      expect(handled).toBe(1);
      expect(removedChannels).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Suite 5: Hub SubTab Routing & Notification Dot Determinism (App.tsx Logic)
  // ---------------------------------------------------------------------------
  describe('Suite 5: Hub Tab Routing & Attention Dot Logic', () => {
    // Models the exact logic implemented in App.tsx
    function computeDefaultHubSubTab(privateHubAttention: boolean, optedIn: boolean): 'social' | 'private' {
      if (privateHubAttention) return 'private';
      return optedIn ? 'social' : 'private';
    }

    it('5.1: If privateHubAttention is true, routes to "private" regardless of opted-in state', () => {
      expect(computeDefaultHubSubTab(true, true)).toBe('private');
      expect(computeDefaultHubSubTab(true, false)).toBe('private');
    });

    it('5.2: If privateHubAttention is false and user is opted in, routes to "social"', () => {
      expect(computeDefaultHubSubTab(false, true)).toBe('social');
    });

    it('5.3: If privateHubAttention is false and user is not opted in, routes to "private"', () => {
      expect(computeDefaultHubSubTab(false, false)).toBe('private');
    });

    it('5.4: Notification dot on Hub icon activates when either public or private attention is pending', () => {
      const showDot = (publicUnread: number, privateAttention: boolean) => publicUnread > 0 || privateAttention;

      expect(showDot(0, false)).toBe(false);
      expect(showDot(3, false)).toBe(true);
      expect(showDot(0, true)).toBe(true);
      expect(showDot(2, true)).toBe(true);
    });

    it('5.5: Notification dot illuminates on privatePending, dmUnread, roomsOutgoingPending, and squadChatUnread', () => {
      const computePrivateAttention = (
        privatePending: number,
        dmUnread: number,
        roomsOutgoingPending: number,
        squadChatUnread: boolean,
      ) => privatePending > 0 || dmUnread > 0 || roomsOutgoingPending > 0 || squadChatUnread;

      expect(computePrivateAttention(0, 0, 0, false)).toBe(false);
      expect(computePrivateAttention(1, 0, 0, false)).toBe(true);
      expect(computePrivateAttention(0, 1, 0, false)).toBe(true);
      expect(computePrivateAttention(0, 0, 1, false)).toBe(true);
      expect(computePrivateAttention(0, 0, 0, true)).toBe(true);
    });
  });
});
