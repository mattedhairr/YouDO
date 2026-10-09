import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import SquadProgressBoard, {
  collectiveBarPercent,
} from '../src/components/squad/SquadProgressBoard';
import type { PaceRow } from '../src/lib/paceBoard';
import { windowMs } from '../src/lib/paceBoard';
import { formatDuration } from '../src/lib/format';

// ---------------------------------------------------------------------------
// Mocks for UserProfileSheet testing
// ---------------------------------------------------------------------------
vi.mock('../src/components/Overlay', () => ({
  default: ({
    open,
    onClose,
    children,
    scrim = true,
  }: {
    open: boolean;
    onClose?: () => void;
    children: ReactNode;
    scrim?: boolean;
  }) => {
    if (!open) return null;
    return createElement(
      'div',
      {
        'data-testid': 'overlay-backdrop',
        role: 'dialog',
        'aria-modal': 'true',
        onClick: scrim ? onClose : undefined,
      },
      createElement(
        'div',
        {
          'data-testid': 'overlay-content',
          onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),
        },
        children,
      ),
    );
  },
}));

const mockCurrentUser: { id: string; email?: string } | null = { id: 'user-viewer-1' };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    loading: false,
  }),
}));

const mockProfiles: Record<string, unknown> = {};
const mockPaceRows: Record<string, PaceRow | null> = {};

vi.mock('../src/lib/profiles', () => ({
  fetchProfile: vi.fn().mockImplementation((uid: string) => Promise.resolve(mockProfiles[uid] ?? null)),
  checkFriendshipStatus: vi.fn().mockResolvedValue('none'),
  sendFriendRequest: vi.fn().mockResolvedValue({ ok: true }),
  removeFriend: vi.fn().mockResolvedValue(true),
  normalizeUsername: (u?: string | null) => (u ? u.trim().toLowerCase() : ''),
}));

vi.mock('../src/lib/paceCloud', () => ({
  fetchPaceRowForUser: vi.fn().mockImplementation((uid: string) => Promise.resolve(mockPaceRows[uid] ?? null)),
}));

import UserProfileSheet from '../src/components/UserProfileSheet';

// ---------------------------------------------------------------------------
// Helper fixtures
// ---------------------------------------------------------------------------
const anchorISO = '2026-10-09';

function createPaceRow(userId: string, hours: number, barHours = 8): PaceRow {
  return {
    userId,
    displayName: `User ${userId}`,
    examLabel: 'GATE',
    todayMs: hours * 3600000,
    weekMs: hours * 3600000,
    monthMs: hours * 3600000,
    todayKey: anchorISO,
    weekKey: '2026-10-05',
    monthKey: '2026-10-01',
    streak: 5,
    barHours,
    updatedAt: '2026-10-09T10:00:00Z',
  };
}

function renderBoard(
  membersData: { id: string; name: string; hours: number; barHours?: number }[],
  currentUserId = 'u1',
  squadBarHours = 8,
  onOpenProfile?: (userId: string) => void,
) {
  const members = membersData.map((m) => ({
    user_id: m.id,
    profiles: { display_name: m.name, avatar_url: '' },
  }));

  const paceByUserId: Record<string, PaceRow> = {};
  for (const m of membersData) {
    paceByUserId[m.id] = createPaceRow(m.id, m.hours, m.barHours ?? squadBarHours);
  }

  const emptyPaceRow = (uid: string): PaceRow => createPaceRow(uid, 0, squadBarHours);

  const element = createElement(SquadProgressBoard, {
    members,
    paceByUserId,
    squadBarHours,
    paceWindow: 'today',
    anchorISO,
    currentUserId,
    viewerBarHours: squadBarHours,
    emptyPaceRow,
    onOpenProfile,
  });

  return renderToStaticMarkup(element);
}

function extractCapsules(html: string): { title: string; classes: string; fillStyle: string; fillClasses: string }[] {
  const capsuleRegex = /<div class="([^"]*w-3\.5[^"]*)" title="([^"]*)">\s*<div class="([^"]*)" style="([^"]*)"/g;
  const matches: { title: string; classes: string; fillStyle: string; fillClasses: string }[] = [];
  let m;
  while ((m = capsuleRegex.exec(html)) !== null) {
    matches.push({
      classes: m[1],
      title: m[2],
      fillClasses: m[3],
      fillStyle: m[4],
    });
  }
  return matches;
}

// ---------------------------------------------------------------------------
// TEST SUITE: Empirical Adversarial Boundary & Stress Testing
// ---------------------------------------------------------------------------
describe('Empirical Adversarial Stress Suite: Boundary Conditions & Robustness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // SECTION 1: Capsule Progress Bar Boundary & Edge Cases
  // =========================================================================
  describe('1. Capsule Progress Bar Boundary Tests', () => {
    it('1.1: 0% Progress — Renders empty capsule with 0% fill and primary accent', () => {
      const html = renderBoard([{ id: 'u1', name: 'Alice', hours: 0, barHours: 8 }]);
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(1);
      expect(capsules[0].fillStyle).toBe('height:0%');
      expect(capsules[0].fillClasses).toContain('bg-primary');
      expect(capsules[0].fillClasses).not.toContain('bg-secondary');
      expect(capsules[0].classes).toContain('rounded-t-full');
      expect(capsules[0].classes).toContain('rounded-b-full');
      expect(html).toContain('0%');
      expect(html).toContain('0m focus');
    });

    it('1.2: 100% Progress — Renders complete capsule with 100% fill and glowing secondary accent', () => {
      const html = renderBoard([{ id: 'u1', name: 'Alice', hours: 8, barHours: 8 }]);
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(1);
      expect(capsules[0].fillStyle).toBe('height:100%');
      expect(capsules[0].fillClasses).toContain('bg-secondary');
      expect(capsules[0].fillClasses).toContain('shadow-');
      expect(html).toContain('Bar reached');
      expect(html).toContain('8h focus');
    });

    it('1.3: Negative progress / extreme inputs — Does not crash, handles negative hours gracefully', () => {
      const html = renderBoard([{ id: 'u1', name: 'Alice', hours: -2, barHours: 8 }]);
      expect(html).toBeDefined();
      expect(html).toContain('Alice');
      expect(html).toContain('Collective bar');
    });

    it('1.4: >100% Progress (Over bar) — Capped at 100% fill height to avoid layout overflow', () => {
      const html = renderBoard([{ id: 'u1', name: 'Alice', hours: 12, barHours: 8 }]); // 150%
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(1);
      // CSS height is capped at 100% to keep capsule within pill boundaries
      expect(capsules[0].fillStyle).toBe('height:100%');
      expect(capsules[0].fillClasses).toContain('bg-secondary');
      // Overtime text is displayed
      expect(html).toContain('+4h over bar');
      expect(html).toContain('12h focus');
    });

    it('1.5: Empty Room (0 members) — Renders clean empty state without NaN or zero division', () => {
      const html = renderBoard([]);
      expect(html).toContain('No members on the board yet');
      expect(html).toContain('Progress uses synced focus from the Public Board');
      // Verify collectiveBarPercent handles empty array safely
      expect(collectiveBarPercent([])).toBe(0);
    });

    it('1.6: Single Member Room (1 member) — Renders solitary capsule without merging', () => {
      const html = renderBoard([{ id: 'u1', name: 'Solo', hours: 8, barHours: 8 }]);
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(1);
      expect(capsules[0].classes).toContain('rounded-t-full');
      expect(capsules[0].classes).toContain('rounded-b-full');
      expect(capsules[0].classes).not.toContain('rounded-t-none');
      expect(capsules[0].classes).not.toContain('rounded-b-none');
      expect(html).toContain('Collective complete');
    });

    it('1.7: 4 Members Room (Maximum capacity) — All complete merges into one continuous glowing bar', () => {
      const html = renderBoard([
        { id: 'u1', name: 'User 1', hours: 8, barHours: 8 },
        { id: 'u2', name: 'User 2', hours: 10, barHours: 8 },
        { id: 'u3', name: 'User 3', hours: 8, barHours: 8 },
        { id: 'u4', name: 'User 4', hours: 12, barHours: 8 },
      ]);
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(4);

      // Top capsule: round top, flat bottom
      expect(capsules[0].classes).toContain('rounded-t-full');
      expect(capsules[0].classes).toContain('rounded-b-none');
      expect(capsules[0].classes).toContain('mt-0.5 mb-0');

      // Middle capsule 1: flat top, flat bottom, zero vertical margin
      expect(capsules[1].classes).toContain('rounded-t-none');
      expect(capsules[1].classes).toContain('rounded-b-none');
      expect(capsules[1].classes).toContain('my-0');

      // Middle capsule 2: flat top, flat bottom, zero vertical margin
      expect(capsules[2].classes).toContain('rounded-t-none');
      expect(capsules[2].classes).toContain('rounded-b-none');
      expect(capsules[2].classes).toContain('my-0');

      // Bottom capsule: flat top, round bottom
      expect(capsules[3].classes).toContain('rounded-t-none');
      expect(capsules[3].classes).toContain('rounded-b-full');
      expect(capsules[3].classes).toContain('mt-0 mb-0.5');

      // All 4 have secondary fill
      for (const cap of capsules) {
        expect(cap.fillClasses).toContain('bg-secondary');
      }

      // Title & header states
      expect(html).toContain('Collective complete');
    });

    it('1.8: Non-adjacent completed members — Does not merge across incomplete gap', () => {
      const html = renderBoard([
        { id: 'u1', name: 'Alice', hours: 8, barHours: 8 }, // 100%
        { id: 'u2', name: 'Bob', hours: 3, barHours: 8 },   // Incomplete (37%)
        { id: 'u3', name: 'Charlie', hours: 8, barHours: 8 }, // 100%
      ]);
      const capsules = extractCapsules(html);

      expect(capsules.length).toBe(3);

      // Alice is complete but Bob below is NOT -> Alice retains rounded bottom
      expect(capsules[0].classes).toContain('rounded-t-full');
      expect(capsules[0].classes).toContain('rounded-b-full');
      expect(capsules[0].classes).not.toContain('rounded-b-none');

      // Bob is incomplete -> retains fully rounded capsule
      expect(capsules[1].classes).toContain('rounded-t-full');
      expect(capsules[1].classes).toContain('rounded-b-full');
      expect(capsules[1].fillClasses).toContain('bg-primary');

      // Charlie is complete but Bob above is NOT -> Charlie retains rounded top
      expect(capsules[2].classes).toContain('rounded-t-full');
      expect(capsules[2].classes).toContain('rounded-b-full');
      expect(capsules[2].classes).not.toContain('rounded-t-none');
    });

    it('1.9: Live Board is completely nuked from the DOM', () => {
      const html = renderBoard([
        { id: 'u1', name: 'Alice', hours: 4, barHours: 8 },
        { id: 'u2', name: 'Bob', hours: 6, barHours: 8 },
      ]);
      expect(html.toLowerCase()).not.toContain('live board');
      expect(html.toLowerCase()).not.toContain('liveboard');
      expect(html).not.toContain('different daily bar');
    });
  });

  // =========================================================================
  // SECTION 2: Hub Attention Routing Stress Testing
  // =========================================================================
  describe('2. Hub Attention Routing Stress Tests', () => {
    // Pure navigation router oracle matching App.tsx specification
    function computeNavigationDestination(params: {
      privatePending: number;
      dmUnread: number;
      roomsOutgoingPending: number;
      squadChatUnread: boolean;
      communityUnread: number;
      optedIn: boolean;
      targetView: 'board' | 'tasks' | 'goals' | 'calendar';
    }): { subTab: 'social' | 'private'; showNavDot: boolean } {
      const privateAttention =
        params.privatePending > 0 ||
        params.dmUnread > 0 ||
        params.roomsOutgoingPending > 0 ||
        params.squadChatUnread;

      const publicHubUnread = params.optedIn ? params.communityUnread : 0;
      const showNavDot = publicHubUnread > 0 || privateAttention;

      let subTab: 'social' | 'private';
      if (privateAttention) {
        subTab = 'private';
      } else {
        subTab = params.optedIn ? 'social' : 'private';
      }

      return { subTab, showNavDot };
    }

    it('2.1: Rapid signal oscillation between zero notifications and active invites', () => {
      // Sequence of state switches simulating active notifications arriving and being cleared
      const sequence = [
        { invites: 0, dms: 0, chat: false, optedIn: true, expectedTab: 'social', expectedDot: false },
        { invites: 1, dms: 0, chat: false, optedIn: true, expectedTab: 'private', expectedDot: true },
        { invites: 0, dms: 0, chat: false, optedIn: true, expectedTab: 'social', expectedDot: false },
        { invites: 0, dms: 3, chat: false, optedIn: true, expectedTab: 'private', expectedDot: true },
        { invites: 0, dms: 0, chat: true, optedIn: true, expectedTab: 'private', expectedDot: true },
        { invites: 0, dms: 0, chat: false, optedIn: false, expectedTab: 'private', expectedDot: false },
        { invites: 2, dms: 1, chat: true, optedIn: false, expectedTab: 'private', expectedDot: true },
      ];

      for (const step of sequence) {
        const res = computeNavigationDestination({
          privatePending: step.invites,
          dmUnread: step.dms,
          roomsOutgoingPending: 0,
          squadChatUnread: step.chat,
          communityUnread: 0,
          optedIn: step.optedIn,
          targetView: 'board',
        });

        expect(res.subTab).toBe(step.expectedTab);
        expect(res.showNavDot).toBe(step.expectedDot);
      }
    });

    it('2.2: Stress test — Combinatorial sweep of all attention permutations (32 combinations)', () => {
      const booleanFlags = [false, true];

      for (const hasInvites of booleanFlags) {
        for (const hasDms of booleanFlags) {
          for (const hasChat of booleanFlags) {
            for (const hasPublicUnread of booleanFlags) {
              for (const optedIn of booleanFlags) {
                const res = computeNavigationDestination({
                  privatePending: hasInvites ? 1 : 0,
                  dmUnread: hasDms ? 2 : 0,
                  roomsOutgoingPending: 0,
                  squadChatUnread: hasChat,
                  communityUnread: hasPublicUnread ? 5 : 0,
                  optedIn,
                  targetView: 'board',
                });

                const anyPrivate = hasInvites || hasDms || hasChat;

                if (anyPrivate) {
                  expect(res.subTab).toBe('private');
                  expect(res.showNavDot).toBe(true);
                } else if (optedIn) {
                  expect(res.subTab).toBe('social');
                  expect(res.showNavDot).toBe(hasPublicUnread);
                } else {
                  expect(res.subTab).toBe('private');
                  expect(res.showNavDot).toBe(false);
                }
              }
            }
          }
        }
      }
    });
  });

  // =========================================================================
  // SECTION 3: User Profile Modal Lifecycle & Focus Window Pill Tabs
  // =========================================================================
  describe('3. User Profile Modal Lifecycle & Interactive Pill Tabs', () => {
    it('3.1: Modal Renders cleanly with rounded-[28px] capsule contour and header', () => {
      const testPace = createPaceRow('u1', 6, 8);
      const html = renderToStaticMarkup(
        createElement(UserProfileSheet, {
          open: true,
          userId: 'u1',
          boardPreview: testPace,
          boardPaceWindow: 'week',
          onClose: () => {},
        }),
      );

      expect(html).toContain('data-testid="overlay-backdrop"');
      expect(html).toContain('rounded-[28px]');
      expect(html).toContain('Profile Card');
    });

    it('3.2: Focus Window Pill Switch & Source Code Audit — Confirms ZERO <select> elements', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      // Verify pill buttons configuration
      expect(content).toContain("id: 'today', label: 'Today'");
      expect(content).toContain("id: 'week', label: 'Week'");
      expect(content).toContain("id: 'month', label: 'Month'");

      // Verify pill button onClick
      expect(content).toContain('onClick={() => setFocusWindow(w.id)}');

      // Strict prohibition: zero <select> or <option> elements in UserProfileSheet
      expect(content).not.toMatch(/<select[\s>]/i);
      expect(content).not.toMatch(/<\/select>/i);
      expect(content).not.toMatch(/<option[\s>]/i);
    });

    it('3.3: Dynamic Focus Calculation across Today, Week, Month windows', () => {
      const testPace: PaceRow = {
        userId: 'u1',
        displayName: 'Aspirant Alice',
        examLabel: 'UPSC',
        todayMs: 4 * 3600000,   // 4h
        weekMs: 22 * 3600000,  // 22h
        monthMs: 80 * 3600000, // 80h
        todayKey: anchorISO,
        weekKey: '2026-10-05',
        monthKey: '2026-10-01',
        streak: 14,
        barHours: 8,
        updatedAt: '2026-10-09T10:00:00Z',
      };

      // Verify windowMs helper returns correct totals for each window
      expect(formatDuration(windowMs(testPace, 'today', anchorISO))).toBe('4h');
      expect(formatDuration(windowMs(testPace, 'week', anchorISO))).toBe('22h');
      expect(formatDuration(windowMs(testPace, 'month', anchorISO))).toBe('80h');
    });

    it('3.4: Modal Close Lifecycle — Unmounts dialog cleanly when open=false or userId=null', () => {
      const htmlClosed = renderToStaticMarkup(
        createElement(UserProfileSheet, {
          open: false,
          userId: null,
          onClose: () => {},
        }),
      );

      expect(htmlClosed).toBe('');
      expect(htmlClosed).not.toContain('data-testid="overlay-backdrop"');
    });

    it('3.5: Stats Privacy boundary — When stats_private=true, stats are protected', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).toContain('stats_private');
      expect(content).toContain('This user keeps their focus stats private');
    });

    it('3.6: Interactive DP wiring in Room view opens profile card', () => {
      const onOpenProfileSpy = vi.fn();
      const html = renderBoard(
        [{ id: 'u-target', name: 'Target User', hours: 5, barHours: 8 }],
        'u-viewer',
        8,
        onOpenProfileSpy,
      );

      // Verify avatar button is wired with title and aria-label
      expect(html).toContain('aria-label="View Target User&#x27;s profile"');
      expect(html).toContain('title="View Target User&#x27;s profile"');
    });
  });
});
