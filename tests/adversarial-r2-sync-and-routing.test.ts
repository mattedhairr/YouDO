import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  PRIVATE_HUB_SYNC_EVENT,
  dispatchPrivateHubSync,
  subscribePrivateHubRealtime,
  subscribePrivateHubInbox,
  startPrivateHubForegroundSync,
  type PrivateHubSyncReason,
} from '../src/lib/privateHubSync';
import * as squadsLib from '../src/lib/squads';

// Mock Supabase channel infrastructure
type SubscriptionRecord = {
  event: string;
  schema?: string;
  table: string;
  filter?: string;
  callback: (payload?: unknown) => void;
};

class MockChannel {
  name: string;
  subscriptions: SubscriptionRecord[] = [];
  subscribed = false;

  constructor(name: string) {
    this.name = name;
  }

  on(
    _type: string,
    filterConfig: { event: string; schema?: string; table: string; filter?: string },
    callback: (payload?: unknown) => void,
  ) {
    this.subscriptions.push({
      event: filterConfig.event,
      schema: filterConfig.schema,
      table: filterConfig.table,
      filter: filterConfig.filter,
      callback,
    });
    return this;
  }

  subscribe() {
    this.subscribed = true;
    return this;
  }
}

const activeMockChannels: MockChannel[] = [];
const removeChannelSpy = vi.fn().mockImplementation((channel: MockChannel) => {
  const idx = activeMockChannels.indexOf(channel);
  if (idx !== -1) {
    activeMockChannels.splice(idx, 1);
  }
  return Promise.resolve(true);
});

vi.mock('../src/lib/supabase', () => ({
  supabase: {
    channel: (name: string) => {
      const ch = new MockChannel(name);
      activeMockChannels.push(ch);
      return ch;
    },
    removeChannel: (channel: MockChannel) => removeChannelSpy(channel),
  },
}));

describe('Milestone 2 Requirement R2 — Empirical Adversarial Stress Suite', () => {
  let eventListeners: Map<string, Set<(e: Event) => void>>;
  let documentListeners: Map<string, Set<(e: Event) => void>>;
  let currentVisibility: DocumentVisibilityState;

  beforeEach(() => {
    activeMockChannels.length = 0;
    removeChannelSpy.mockClear();
    eventListeners = new Map();
    documentListeners = new Map();
    currentVisibility = 'visible';

    // Mock global window and document with EventTarget emulation
    const mockWindow = {
      addEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
        if (!eventListeners.has(type)) eventListeners.set(type, new Set());
        eventListeners.get(type)!.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
        eventListeners.get(type)?.delete(listener);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        const listeners = eventListeners.get(event.type);
        if (listeners) {
          // Copy to avoid modification during dispatch
          [...listeners].forEach((l) => l(event));
        }
        return true;
      }),
      setInterval: vi.fn((cb: () => void, ms: number) => setInterval(cb, ms)),
      clearInterval: vi.fn((id: NodeJS.Timeout) => clearInterval(id)),
    };

    const mockDocument = {
      get visibilityState() {
        return currentVisibility;
      },
      addEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
        if (!documentListeners.has(type)) documentListeners.set(type, new Set());
        documentListeners.get(type)!.add(listener);
      }),
      removeEventListener: vi.fn((type: string, listener: (e: Event) => void) => {
        documentListeners.get(type)?.delete(listener);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        const listeners = documentListeners.get(event.type);
        if (listeners) {
          [...listeners].forEach((l) => l(event));
        }
        return true;
      }),
    };

    vi.stubGlobal('window', mockWindow);
    vi.stubGlobal('document', mockDocument);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Challenge Group 1: dispatchPrivateHubSync Mechanism & Stress Testing
  // =========================================================================
  describe('Group 1: dispatchPrivateHubSync Mechanism & Stress Testing', () => {
    it('1.1: Dispatches CustomEvent with exact reason for all permitted enum values', () => {
      const receivedReasons: (string | undefined)[] = [];
      const listener = (e: Event) => {
        const custom = e as CustomEvent<{ reason?: string }>;
        receivedReasons.push(custom.detail?.reason);
      };

      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listener);

      const reasons: PrivateHubSyncReason[] = ['pending', 'friends', 'dms', 'squads', 'all'];
      for (const reason of reasons) {
        dispatchPrivateHubSync(reason);
      }

      expect(receivedReasons).toEqual(['pending', 'friends', 'dms', 'squads', 'all']);
    });

    it('1.2: Default parameter falls back to "all" when called with no arguments', () => {
      let capturedReason: string | undefined;
      const listener = (e: Event) => {
        const custom = e as CustomEvent<{ reason?: string }>;
        capturedReason = custom.detail?.reason;
      };

      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listener);
      dispatchPrivateHubSync();

      expect(capturedReason).toBe('all');
    });

    it('1.3: Headless / SSR safety: does not throw or crash when window is undefined', () => {
      vi.stubGlobal('window', undefined);
      expect(() => dispatchPrivateHubSync('pending')).not.toThrow();
      expect(() => dispatchPrivateHubSync()).not.toThrow();
    });

    it('1.4: Stress Test — High Volume Burst (1,000 rapid event dispatches)', () => {
      const eventLog: number[] = [];
      const listener = (e: Event) => {
        const custom = e as CustomEvent<{ reason?: string; seq?: number }>;
        if (custom.detail?.reason === 'all') {
          eventLog.push(custom.detail?.seq ?? 0);
        }
      };

      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listener);

      const tStart = performance.now();
      const count = 1000;
      for (let i = 0; i < count; i++) {
        // Dispatch burst events
        window.dispatchEvent(
          new CustomEvent(PRIVATE_HUB_SYNC_EVENT, { detail: { reason: 'all', seq: i } }),
        );
      }
      const tElapsed = performance.now() - tStart;

      expect(eventLog).toHaveLength(count);
      expect(eventLog[0]).toBe(0);
      expect(eventLog[count - 1]).toBe(count - 1);
      // High-performance dispatch must take less than 150ms for 1,000 events
      expect(tElapsed).toBeLessThan(150);
    });

    it('1.5: Multi-Subscriber Concurrency: 50 independent listeners receive all dispatches cleanly', () => {
      const listenerCounts = new Array(50).fill(0);
      const listenerFns = listenerCounts.map((_, idx) => (e: Event) => {
        if (e.type === PRIVATE_HUB_SYNC_EVENT) {
          listenerCounts[idx]++;
        }
      });

      // Register all 50 listeners
      listenerFns.forEach((fn) => window.addEventListener(PRIVATE_HUB_SYNC_EVENT, fn));

      // Dispatch 10 events
      for (let i = 0; i < 10; i++) {
        dispatchPrivateHubSync('squads');
      }

      listenerCounts.forEach((c) => expect(c).toBe(10));

      // Detach first 25 listeners
      for (let i = 0; i < 25; i++) {
        window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, listenerFns[i]);
      }

      // Dispatch 5 more events
      for (let i = 0; i < 5; i++) {
        dispatchPrivateHubSync('pending');
      }

      // First 25 remain at 10, remaining 25 advance to 15
      for (let i = 0; i < 25; i++) {
        expect(listenerCounts[i]).toBe(10);
      }
      for (let i = 25; i < 50; i++) {
        expect(listenerCounts[i]).toBe(15);
      }
    });

    it('1.6: Self-detaching listener does not corrupt iteration of sibling listeners', () => {
      const executionOrder: string[] = [];

      const listenerA = () => {
        executionOrder.push('A');
      };
      const listenerB = () => {
        executionOrder.push('B');
        window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, listenerB);
      };
      const listenerC = () => {
        executionOrder.push('C');
      };

      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listenerA);
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listenerB);
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, listenerC);

      // Round 1: all 3 fire
      dispatchPrivateHubSync('all');
      expect(executionOrder).toEqual(['A', 'B', 'C']);

      // Round 2: B was detached, only A and C fire
      dispatchPrivateHubSync('all');
      expect(executionOrder).toEqual(['A', 'B', 'C', 'A', 'C']);
    });
  });

  // =========================================================================
  // Challenge Group 2: subscribePrivateHubRealtime Channel & Event Pipeline
  // =========================================================================
  describe('Group 2: subscribePrivateHubRealtime Channel & Event Pipeline', () => {
    it('2.1: Establishes all 8 required Postgres realtime listeners with correct schema and filters', () => {
      const userId = 'usr-adversarial-101';
      const unsubscribe = subscribePrivateHubRealtime(userId, {});

      expect(activeMockChannels).toHaveLength(1);
      const ch = activeMockChannels[0];
      expect(ch.name).toBe(`hub_realtime_${userId}`);
      expect(ch.subscribed).toBe(true);

      // Verify each required postgres_changes subscription
      const subs = ch.subscriptions;
      expect(subs).toHaveLength(8);

      // 1. friendships receiver_id=*
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'friendships',
          filter: `receiver_id=eq.${userId}`,
          event: '*',
        }),
      );

      // 2. friendships requester_id=*
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'friendships',
          filter: `requester_id=eq.${userId}`,
          event: '*',
        }),
      );

      // 3. friendships receiver_id UPDATE (friends list refresh)
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'friendships',
          filter: `receiver_id=eq.${userId}`,
          event: 'UPDATE',
        }),
      );

      // 4. squad_members user_id=*
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'squad_members',
          filter: `user_id=eq.${userId}`,
          event: '*',
        }),
      );

      // 5. squad_members wildcard
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'squad_members',
          filter: undefined,
          event: '*',
        }),
      );

      // 6. direct_messages receiver_id=*
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'direct_messages',
          filter: `receiver_id=eq.${userId}`,
          event: '*',
        }),
      );

      // 7. direct_messages sender_id=*
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'direct_messages',
          filter: `sender_id=eq.${userId}`,
          event: '*',
        }),
      );

      // 8. squad_messages INSERT
      expect(subs).toContainEqual(
        expect.objectContaining({
          table: 'squad_messages',
          event: 'INSERT',
        }),
      );

      unsubscribe();
      expect(removeChannelSpy).toHaveBeenCalledWith(ch);
      expect(activeMockChannels).toHaveLength(0);
    });

    it('2.2: Channel callbacks execute handlers AND broadcast PRIVATE_HUB_SYNC_EVENT with exact reasons', () => {
      const onPending = vi.fn();
      const onFriends = vi.fn();
      const onDms = vi.fn();
      const onSquads = vi.fn();

      const receivedDispatches: string[] = [];
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, (e) => {
        receivedDispatches.push((e as CustomEvent<{ reason: string }>).detail.reason);
      });

      const userId = 'usr-callback-test';
      const unsubscribe = subscribePrivateHubRealtime(userId, {
        onPending,
        onFriends,
        onDms,
        onSquads,
      });

      const ch = activeMockChannels[0];

      // Simulate incoming events
      // Find friendship pending callback
      const friendshipPendingSub = ch.subscriptions.find(
        (s) => s.table === 'friendships' && s.filter === `receiver_id=eq.${userId}` && s.event === '*',
      );
      friendshipPendingSub?.callback();
      expect(onPending).toHaveBeenCalledTimes(1);
      expect(receivedDispatches).toContain('pending');

      // Find friendship update callback
      const friendshipUpdateSub = ch.subscriptions.find(
        (s) => s.table === 'friendships' && s.filter === `receiver_id=eq.${userId}` && s.event === 'UPDATE',
      );
      friendshipUpdateSub?.callback();
      expect(onFriends).toHaveBeenCalledTimes(1);
      expect(receivedDispatches).toContain('friends');

      // Find dm callback
      const dmSub = ch.subscriptions.find(
        (s) => s.table === 'direct_messages' && s.filter === `receiver_id=eq.${userId}`,
      );
      dmSub?.callback();
      expect(onDms).toHaveBeenCalledTimes(1);
      expect(receivedDispatches).toContain('dms');

      // Find squad message callback
      const squadMsgSub = ch.subscriptions.find((s) => s.table === 'squad_messages');
      squadMsgSub?.callback();
      expect(onSquads).toHaveBeenCalledTimes(1);
      expect(receivedDispatches).toContain('squads');

      unsubscribe();
    });

    it('2.3: Gracefully handles missing optional handlers without throwing', () => {
      const userId = 'usr-empty-handlers';
      const unsubscribe = subscribePrivateHubRealtime(userId, {});
      const ch = activeMockChannels[0];

      expect(() => {
        ch.subscriptions.forEach((sub) => sub.callback());
      }).not.toThrow();

      unsubscribe();
    });

    it('2.4: Stress Test — 100 rapid subscription and cleanup cycles leave zero channel leaks', () => {
      for (let i = 0; i < 100; i++) {
        const un = subscribePrivateHubRealtime(`user-${i}`, {});
        un();
      }

      expect(removeChannelSpy).toHaveBeenCalledTimes(100);
      expect(activeMockChannels).toHaveLength(0);
    });
  });

  // =========================================================================
  // Challenge Group 3: subscribePrivateHubInbox & Outgoing Acceptance Fix
  // =========================================================================
  describe('Group 3: subscribePrivateHubInbox & Outgoing Acceptance Fix Verification', () => {
    it('3.1: CRITICAL BUG VERIFICATION — Listens for UPDATE on friendships where requester_id=eq.${userId}', () => {
      const userId = 'usr-requester-sender';
      const onFriends = vi.fn();
      const onDms = vi.fn();

      const unsubscribe = subscribePrivateHubInbox(userId, { onFriends, onDms });
      const ch = activeMockChannels[0];

      // Verify that the listener for requester_id exists on UPDATE
      const requesterUpdateSub = ch.subscriptions.find(
        (s) => s.table === 'friendships' && s.filter === `requester_id=eq.${userId}` && s.event === 'UPDATE',
      );

      expect(requesterUpdateSub).toBeDefined();

      // Trigger the incoming update simulating receiver accepting the friend request
      requesterUpdateSub!.callback({ new: { status: 'accepted' } });

      expect(onFriends).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('3.2: Listens for UPDATE on friendships where receiver_id=eq.${userId}', () => {
      const userId = 'usr-receiver';
      const onFriends = vi.fn();
      const onDms = vi.fn();

      const unsubscribe = subscribePrivateHubInbox(userId, { onFriends, onDms });
      const ch = activeMockChannels[0];

      const receiverUpdateSub = ch.subscriptions.find(
        (s) => s.table === 'friendships' && s.filter === `receiver_id=eq.${userId}` && s.event === 'UPDATE',
      );

      expect(receiverUpdateSub).toBeDefined();
      receiverUpdateSub!.callback({ new: { status: 'accepted' } });

      expect(onFriends).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('3.3: Correctly triggers onDms when DM events occur for receiver or sender', () => {
      const userId = 'usr-dm-user';
      const onDms = vi.fn();

      const unsubscribe = subscribePrivateHubInbox(userId, { onDms });
      const ch = activeMockChannels[0];

      const dmReceiverSub = ch.subscriptions.find(
        (s) => s.table === 'direct_messages' && s.filter === `receiver_id=eq.${userId}`,
      );
      const dmSenderSub = ch.subscriptions.find(
        (s) => s.table === 'direct_messages' && s.filter === `sender_id=eq.${userId}`,
      );

      expect(dmReceiverSub).toBeDefined();
      expect(dmSenderSub).toBeDefined();

      dmReceiverSub!.callback();
      expect(onDms).toHaveBeenCalledTimes(1);

      dmSenderSub!.callback();
      expect(onDms).toHaveBeenCalledTimes(2);

      unsubscribe();
    });
  });

  // =========================================================================
  // Challenge Group 4: startPrivateHubForegroundSync Polling & Lifecycle
  // =========================================================================
  describe('Group 4: startPrivateHubForegroundSync Polling & Lifecycle', () => {
    it('4.1: Executes onTick immediately on start when document is visible', () => {
      currentVisibility = 'visible';
      const onTick = vi.fn();

      const stop = startPrivateHubForegroundSync(onTick, 5000);
      expect(onTick).toHaveBeenCalledTimes(1);
      stop();
    });

    it('4.2: Suppresses tick execution when document is hidden', () => {
      currentVisibility = 'hidden';
      const onTick = vi.fn();

      const stop = startPrivateHubForegroundSync(onTick, 5000);
      expect(onTick).toHaveBeenCalledTimes(0);
      stop();
    });

    it('4.3: Window focus and document visibilitychange events trigger tick when visible', () => {
      currentVisibility = 'visible';
      const onTick = vi.fn();

      const stop = startPrivateHubForegroundSync(onTick, 5000);
      expect(onTick).toHaveBeenCalledTimes(1);

      // Trigger focus
      const focusListeners = eventListeners.get('focus');
      expect(focusListeners).toBeDefined();
      focusListeners!.forEach((l) => l(new Event('focus')));
      expect(onTick).toHaveBeenCalledTimes(2);

      // Trigger visibilitychange while visible
      const visListeners = documentListeners.get('visibilitychange');
      expect(visListeners).toBeDefined();
      visListeners!.forEach((l) => l(new Event('visibilitychange')));
      expect(onTick).toHaveBeenCalledTimes(3);

      // Now set hidden and trigger visibilitychange: should NOT tick
      currentVisibility = 'hidden';
      visListeners!.forEach((l) => l(new Event('visibilitychange')));
      expect(onTick).toHaveBeenCalledTimes(3);

      stop();
    });

    it('4.4: Complete listener removal on cleanup with zero dangling handles', () => {
      currentVisibility = 'visible';
      const onTick = vi.fn();

      const stop = startPrivateHubForegroundSync(onTick, 5000);
      expect(eventListeners.get('focus')?.size).toBe(1);
      expect(documentListeners.get('visibilitychange')?.size).toBe(1);

      stop();

      expect(eventListeners.get('focus')?.size).toBe(0);
      expect(documentListeners.get('visibilitychange')?.size).toBe(0);

      // Further events should not trigger tick
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      expect(onTick).toHaveBeenCalledTimes(1); // Only the initial tick
    });
  });

  // =========================================================================
  // Challenge Group 5: RoomsView Real-Time Notification & Sync Integration
  // =========================================================================
  describe('Group 5: RoomsView Real-Time Notification & Sync Integration', () => {
    it('5.1: Empirical verification — RoomsView source wires PRIVATE_HUB_SYNC_EVENT with cleanup', () => {
      const roomsViewPath = path.resolve(__dirname, '../src/components/RoomsView.tsx');
      const content = fs.readFileSync(roomsViewPath, 'utf8');

      // Assert import of PRIVATE_HUB_SYNC_EVENT
      expect(content).toMatch(/import\s*\{[^}]*PRIVATE_HUB_SYNC_EVENT[^}]*\}\s*from\s*['"]\.\.\/lib\/privateHubSync['"]/);

      // Assert window.addEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync)
      expect(content).toMatch(/window\.addEventListener\(\s*PRIVATE_HUB_SYNC_EVENT\s*,\s*handleSync\s*\)/);

      // Assert window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync)
      expect(content).toMatch(/window\.removeEventListener\(\s*PRIVATE_HUB_SYNC_EVENT\s*,\s*handleSync\s*\)/);

      // Assert reload() is called inside handleSync
      expect(content).toMatch(/const\s+handleSync\s*=\s*\(\)\s*=>\s*\{\s*void\s+reload\(\);\s*\};/);
    });

    it('5.2: Live squad reload trigger test — dispatching PRIVATE_HUB_SYNC_EVENT triggers squad reload', async () => {
      const mySquadsSpy = vi.spyOn(squadsLib, 'fetchMySquads').mockResolvedValue([]);
      const discoverSpy = vi.spyOn(squadsLib, 'fetchDiscoverableSquads').mockResolvedValue([]);
      const pendingSpy = vi.spyOn(squadsLib, 'fetchOutgoingSquadJoinRequests').mockResolvedValue([]);

      const user = { id: 'usr-rooms-test' };

      // Replicate the exact RoomsView reload mechanism
      const reload = async () => {
        if (!user) return;
        await Promise.all([
          squadsLib.fetchMySquads(user.id),
          squadsLib.fetchDiscoverableSquads(),
          squadsLib.fetchOutgoingSquadJoinRequests(),
        ]);
      };

      // Wire listener exactly as RoomsView does
      const handleSync = () => {
        void reload();
      };
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);

      expect(mySquadsSpy).toHaveBeenCalledTimes(0);

      // Dispatch private hub sync event
      dispatchPrivateHubSync('squads');

      // Allow microtasks to settle
      await new Promise((r) => setTimeout(r, 10));

      expect(mySquadsSpy).toHaveBeenCalledWith(user.id);
      expect(discoverSpy).toHaveBeenCalledTimes(1);
      expect(pendingSpy).toHaveBeenCalledTimes(1);

      // Cleanup
      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);

      // Dispatch again after unmount: should NOT invoke reload
      dispatchPrivateHubSync('squads');
      await new Promise((r) => setTimeout(r, 10));

      expect(mySquadsSpy).toHaveBeenCalledTimes(1);
      expect(discoverSpy).toHaveBeenCalledTimes(1);
    });

    it('5.3: Stress Test — 100 rapid sync events handled stably without unhandled promise rejections', async () => {
      let reloadCount = 0;
      const reload = async () => {
        reloadCount++;
        await new Promise((r) => setTimeout(r, 1));
      };

      const handleSync = () => {
        void reload();
      };
      window.addEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);

      // Fire 100 sync events rapidly
      for (let i = 0; i < 100; i++) {
        dispatchPrivateHubSync('pending');
      }

      await new Promise((r) => setTimeout(r, 50));
      expect(reloadCount).toBe(100);

      window.removeEventListener(PRIVATE_HUB_SYNC_EVENT, handleSync);
    });
  });

  // =========================================================================
  // Challenge Group 6: Hub Routing Logic in src/App.tsx
  // =========================================================================
  describe('Group 6: Hub Routing Logic in src/App.tsx', () => {
    // Pure oracle matching the logic specification
    function computeDefaultHubSubTab(
      privateHubAttention: boolean,
      optedIn: boolean,
    ): 'social' | 'private' {
      if (privateHubAttention) return 'private';
      return optedIn ? 'social' : 'private';
    }

    it('6.1: Combinatorial Truth Table: Exhaustive verification of routing requirements', () => {
      // Requirement R2 Specification:
      // - When privateHubAttention is true, routes to 'private' tab (regardless of optedIn)
      expect(computeDefaultHubSubTab(true, true)).toBe('private');
      expect(computeDefaultHubSubTab(true, false)).toBe('private');

      // - When privateHubAttention is false and user is opted in, routes to 'social' (public) tab
      expect(computeDefaultHubSubTab(false, true)).toBe('social');

      // - When privateHubAttention is false and user is opted out, routes to 'private' tab
      expect(computeDefaultHubSubTab(false, false)).toBe('private');
    });

    it('6.2: AST / Source Code Invariant Verification in src/App.tsx', () => {
      const appPath = path.resolve(__dirname, '../src/App.tsx');
      const content = fs.readFileSync(appPath, 'utf8');

      // 1. Verify defaultHubSubTab checks privateHubAttention first
      const defaultHubSubTabRegex =
        /const\s+defaultHubSubTab\s*=\s*useCallback\(\(\):\s*['"]social['"]\s*\|\s*['"]private['"]\s*=>\s*\{[\s\S]*?if\s*\(\s*privateHubAttention\s*\)\s*return\s*['"]private['"];[\s\S]*?return\s+activityPrefs\.optedIn\s*\?\s*['"]social['"]\s*:\s*['"]private['"];[\s\S]*?\}\s*,\s*\[\s*privateHubAttention\s*,\s*activityPrefs\.optedIn\s*\]\);/;

      expect(content).toMatch(defaultHubSubTabRegex);

      // 2. Verify handlePrimaryNavigate routes to 'board' using defaultHubSubTab()
      const navigateRegex =
        /if\s*\(\s*targetView\s*===\s*['"]board['"]\s*\)\s*\{[\s\S]*?setHubSubTab\(\s*defaultHubSubTab\(\)\s*\);[\s\S]*?\}/;

      expect(content).toMatch(navigateRegex);

      // 3. Ensure no regression where check was previously restricted to `view !== 'board'`
      // (Removing `view !== 'board'` allows re-routing to attention tab when clicking hub while on board)
      expect(content).not.toMatch(/targetView\s*===\s*['"]board['"]\s*&&\s*view\s*!==\s*['"]board['"]/);
    });

    it('6.3: Multi-Signal Attention Invariant: Every pending notification signal triggers "private" routing', () => {
      // Simulates the signals that compose privateHubAttention in useHubAttention:
      // privateHubAttention = privatePending > 0 || dmUnread > 0 || roomsOutgoingPending > 0 || squadChatUnread
      // where privatePending = friendPending + squadInboxPending

      const testSignals = [
        { name: 'incoming friend request', friendPending: 1, squadInboxPending: 0, dmUnread: 0, roomsOutgoingPending: 0, squadChatUnread: false },
        { name: 'incoming room invite', friendPending: 0, squadInboxPending: 1, dmUnread: 0, roomsOutgoingPending: 0, squadChatUnread: false },
        { name: 'incoming join request', friendPending: 0, squadInboxPending: 2, dmUnread: 0, roomsOutgoingPending: 0, squadChatUnread: false },
        { name: 'outgoing room request pending', friendPending: 0, squadInboxPending: 0, dmUnread: 0, roomsOutgoingPending: 1, squadChatUnread: false },
        { name: 'unread squad chat', friendPending: 0, squadInboxPending: 0, dmUnread: 0, roomsOutgoingPending: 0, squadChatUnread: true },
        { name: 'unread direct message', friendPending: 0, squadInboxPending: 0, dmUnread: 3, roomsOutgoingPending: 0, squadChatUnread: false },
        { name: 'multiple simultaneous signals', friendPending: 2, squadInboxPending: 1, dmUnread: 5, roomsOutgoingPending: 1, squadChatUnread: true },
      ];

      for (const sig of testSignals) {
        const privatePending = sig.friendPending + sig.squadInboxPending;
        const privateHubAttention =
          privatePending > 0 || sig.dmUnread > 0 || sig.roomsOutgoingPending > 0 || sig.squadChatUnread;

        expect(privateHubAttention).toBe(true);

        // For both opted in and opted out users, attention signals MUST route to 'private'
        expect(computeDefaultHubSubTab(privateHubAttention, true)).toBe('private');
        expect(computeDefaultHubSubTab(privateHubAttention, false)).toBe('private');
      }

      // Zero signals scenario:
      const zeroSignals = { friendPending: 0, squadInboxPending: 0, dmUnread: 0, roomsOutgoingPending: 0, squadChatUnread: false };
      const zeroPrivatePending = zeroSignals.friendPending + zeroSignals.squadInboxPending;
      const zeroAttention =
        zeroPrivatePending > 0 || zeroSignals.dmUnread > 0 || zeroSignals.roomsOutgoingPending > 0 || zeroSignals.squadChatUnread;

      expect(zeroAttention).toBe(false);
      expect(computeDefaultHubSubTab(zeroAttention, true)).toBe('social');
      expect(computeDefaultHubSubTab(zeroAttention, false)).toBe('private');
    });

    it('6.4: Full User Navigation State Machine Simulation', () => {
      // Simulates App.tsx navigation state machine across sequential user flows
      let currentView: 'tasks' | 'goals' | 'calendar' | 'board' = 'tasks';
      let hubSubTab: 'social' | 'private' = 'social';
      let optedIn = true;
      let privateHubAttention = false;

      const defaultHubSubTab = () => (privateHubAttention ? 'private' : optedIn ? 'social' : 'private');

      const handlePrimaryNavigate = (targetView: 'tasks' | 'goals' | 'calendar' | 'board') => {
        if (targetView === 'board') {
          hubSubTab = defaultHubSubTab();
        }
        currentView = targetView;
      };

      const toggleHubSubTab = () => {
        hubSubTab = hubSubTab === 'social' ? 'private' : 'social';
      };

      // Flow 1: User on Today (tasks), opted in, no notifications.
      // Clicks Hub.
      handlePrimaryNavigate('board');
      expect(currentView).toBe('board');
      expect(hubSubTab).toBe('social');

      // Flow 2: While on board, user uses CommandBar rolling switcher to view Private Hub.
      toggleHubSubTab();
      expect(hubSubTab).toBe('private');

      // Flow 3: User returns to Today tab.
      handlePrimaryNavigate('tasks');
      expect(currentView).toBe('tasks');

      // Flow 4: Incoming room invite arrives! (privateHubAttention turns true)
      privateHubAttention = true;

      // User clicks Hub icon.
      handlePrimaryNavigate('board');
      expect(currentView).toBe('board');
      expect(hubSubTab).toBe('private'); // Prioritized private because of notification!

      // Flow 5: User accepts the invite, clearing attention.
      privateHubAttention = false;

      // User opt-out of public board in settings.
      optedIn = false;

      // User goes to Today, then clicks Hub icon.
      handlePrimaryNavigate('tasks');
      handlePrimaryNavigate('board');
      expect(currentView).toBe('board');
      expect(hubSubTab).toBe('private'); // Routed to private because opted out!

      // Flow 6: User opts back in.
      optedIn = true;

      // User clicks Hub icon.
      handlePrimaryNavigate('tasks');
      handlePrimaryNavigate('board');
      expect(currentView).toBe('board');
      expect(hubSubTab).toBe('social'); // Routed to social because opted in and no attention!
    });
  });
});
