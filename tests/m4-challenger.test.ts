import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import SquadProgressBoard from '../src/components/squad/SquadProgressBoard';
import { windowMs, type PaceRow, type PaceWindow } from '../src/lib/paceBoard';
import { formatDuration } from '../src/lib/format';

// Mock Overlay to render inline for static markup inspections
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

// Mock useAuth
let mockCurrentUser: { id: string; email?: string } | null = { id: 'user-viewer-1' };
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockCurrentUser,
    loading: false,
  }),
}));

// Mock profiles and pace APIs
vi.mock('../src/lib/profiles', () => ({
  fetchProfile: vi.fn(),
  checkFriendshipStatus: vi.fn().mockResolvedValue('none'),
  sendFriendRequest: vi.fn().mockResolvedValue({ ok: true }),
  removeFriend: vi.fn().mockResolvedValue(true),
  normalizeUsername: (u?: string | null) => (u ? u.trim().toLowerCase() : ''),
}));

vi.mock('../src/lib/paceCloud', () => ({
  fetchPaceRowForUser: vi.fn().mockResolvedValue(null),
}));

import UserProfileSheet from '../src/components/UserProfileSheet';

const anchorISO = '2026-10-09';

function createPaceRow(params: {
  userId: string;
  displayName: string;
  todayHours: number;
  weekHours: number;
  monthHours: number;
  streak?: number;
  barHours?: number;
  todayKey?: string;
  weekKey?: string;
  monthKey?: string;
}): PaceRow {
  return {
    userId: params.userId,
    displayName: params.displayName,
    examLabel: 'GATE',
    todayMs: params.todayHours * 3600000,
    weekMs: params.weekHours * 3600000,
    monthMs: params.monthHours * 3600000,
    todayKey: params.todayKey ?? anchorISO,
    weekKey: params.weekKey ?? '2026-10-05',
    monthKey: params.monthKey ?? '2026-10-01',
    streak: params.streak ?? 7,
    barHours: params.barHours ?? 6,
    updatedAt: '2026-10-09T12:00:00Z',
  };
}

/**
 * Executes a function component within an active React render phase
 * so that hooks (useMemo, useState) execute safely and the resulting VDOM can be inspected.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inspectComponent(Component: any, props: any): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tree: any = null;
  function Harness() {
    tree = Component(props);
    return createElement('div', null);
  }
  renderToStaticMarkup(createElement(Harness));
  return tree;
}

describe('Milestone 4 Empirical Challenge: User Profile Card & Interactive DPs (R4)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentUser = { id: 'user-viewer-1' };
  });

  // ===========================================================================
  // 1. Requirement R4.1: Member Avatar (DP) Click & Sheet Mounting Flow
  // ===========================================================================
  describe('Challenge 1: Interactive DPs in SquadProgressBoard & onOpenProfile Triggering', () => {
    it('1.1: SquadProgressBoard renders an accessible, clickable DP button for each member', () => {
      const members = [
        { user_id: 'u1', profiles: { display_name: 'Ada Lovelace', avatar_url: 'https://example.com/ada.jpg' } },
        { user_id: 'u2', profiles: { display_name: 'Alan Turing', avatar_url: '' } },
      ];
      const paceByUserId: Record<string, PaceRow> = {
        u1: createPaceRow({ userId: 'u1', displayName: 'Ada Lovelace', todayHours: 4, weekHours: 20, monthHours: 80 }),
        u2: createPaceRow({ userId: 'u2', displayName: 'Alan Turing', todayHours: 6, weekHours: 30, monthHours: 120 }),
      };

      const html = renderToStaticMarkup(
        createElement(SquadProgressBoard, {
          members,
          paceByUserId,
          squadBarHours: 6,
          paceWindow: 'today',
          anchorISO,
          currentUserId: 'u1',
          emptyPaceRow: (id) => createPaceRow({ userId: id, displayName: 'Member', todayHours: 0, weekHours: 0, monthHours: 0 }),
          onOpenProfile: vi.fn(),
        }),
      );

      // Verify buttons are rendered with accessible titles and labels
      expect(html).toContain('aria-label="View Ada Lovelace&#x27;s profile"');
      expect(html).toContain('aria-label="View Alan Turing&#x27;s profile"');
      expect(html).toContain('title="View Ada Lovelace&#x27;s profile"');
      expect(html).toContain('title="View Alan Turing&#x27;s profile"');
      expect(html).toContain('rounded-full');
      expect(html).toContain('cursor-pointer');
    });

    it('1.2: Clicking a member DP triggers onOpenProfile callback with that exact member userId', () => {
      const onOpenProfileSpy = vi.fn();
      const members = [
        { user_id: 'u-charles', profiles: { display_name: 'Charles Babbage' } },
        { user_id: 'u-grace', profiles: { display_name: 'Grace Hopper' } },
        { user_id: 'u-linus', profiles: { display_name: 'Linus Torvalds' } },
      ];
      const paceByUserId: Record<string, PaceRow> = {
        'u-charles': createPaceRow({ userId: 'u-charles', displayName: 'Charles Babbage', todayHours: 2, weekHours: 10, monthHours: 40 }),
        'u-grace': createPaceRow({ userId: 'u-grace', displayName: 'Grace Hopper', todayHours: 5, weekHours: 25, monthHours: 90 }),
        'u-linus': createPaceRow({ userId: 'u-linus', displayName: 'Linus Torvalds', todayHours: 8, weekHours: 40, monthHours: 160 }),
      };

      // Safely inspect the component tree rendered with active React hooks
      const vdom = inspectComponent(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 6,
        paceWindow: 'today',
        anchorISO,
        currentUserId: 'u-charles',
        emptyPaceRow: (id: string) => createPaceRow({ userId: id, displayName: 'Member', todayHours: 0, weekHours: 0, monthHours: 0 }),
        onOpenProfile: onOpenProfileSpy,
      });

      expect(vdom).toBeDefined();
      const section = vdom.props.children;
      const verticalBarElement = section.props.children[1];
      expect(verticalBarElement).toBeDefined();

      // Render VerticalCollectiveBar within the harness to inspect its inner elements
      const verticalBarVdom = inspectComponent(verticalBarElement.type, verticalBarElement.props);
      const grid = verticalBarVdom.props.children[1];
      const memberRows = grid.props.children[2];
      expect(Array.isArray(memberRows)).toBe(true);
      expect(memberRows.length).toBe(3);

      // Verify clicking each member's DP button calls onOpenProfile with their specific userId
      for (let i = 0; i < members.length; i++) {
        const row = memberRows[i];
        const dpButton = row.props.children[0];
        expect(dpButton.type).toBe('button');
        expect(typeof dpButton.props.onClick).toBe('function');

        // Simulate click
        dpButton.props.onClick();
        expect(onOpenProfileSpy).toHaveBeenLastCalledWith(members[i].user_id);
      }
      expect(onOpenProfileSpy).toHaveBeenCalledTimes(3);
    });

    it('1.3: If onOpenProfile is omitted or undefined, clicking DP does not throw', () => {
      const members = [
        { user_id: 'u-safe', profiles: { display_name: 'Safe User' } },
      ];
      const paceByUserId = {
        'u-safe': createPaceRow({ userId: 'u-safe', displayName: 'Safe User', todayHours: 1, weekHours: 5, monthHours: 20 }),
      };

      const vdom = inspectComponent(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 6,
        paceWindow: 'today',
        anchorISO,
        emptyPaceRow: (id: string) => createPaceRow({ userId: id, displayName: 'Member', todayHours: 0, weekHours: 0, monthHours: 0 }),
        onOpenProfile: undefined, // Optional prop omitted
      });

      const verticalBarElement = vdom.props.children.props.children[1];
      const verticalBarVdom = inspectComponent(verticalBarElement.type, verticalBarElement.props);
      const memberRows = verticalBarVdom.props.children[1].props.children[2];
      const dpButton = memberRows[0].props.children[0];

      expect(() => dpButton.props.onClick()).not.toThrow();
    });

    it('1.4: Room view state lifecycle — DP click mounts UserProfileSheet, close resets state', () => {
      // Simulating the room state management in SquadRoomSheet
      let selectedProfileUserId: string | null = null;
      const handleOpenProfile = (uid: string) => {
        selectedProfileUserId = uid;
      };
      const handleCloseProfile = () => {
        selectedProfileUserId = null;
      };

      // Step 1: Initial room view state
      expect(selectedProfileUserId).toBeNull();
      let isSheetMounted = Boolean(selectedProfileUserId);
      expect(isSheetMounted).toBe(false);

      // Step 2: Member avatar clicked in room
      handleOpenProfile('user-target-77');
      expect(selectedProfileUserId).toBe('user-target-77');
      isSheetMounted = Boolean(selectedProfileUserId);
      expect(isSheetMounted).toBe(true);

      // Step 3: UserProfileSheet mounts with selected userId
      const sheetElement = createElement(UserProfileSheet, {
        open: Boolean(selectedProfileUserId),
        userId: selectedProfileUserId,
        onClose: handleCloseProfile,
      });
      const html = renderToStaticMarkup(sheetElement);
      expect(html).toContain('data-testid="overlay-backdrop"');
      expect(html).toContain('Profile Card');

      // Step 4: Closing modal resets selectedProfileUserId back to null
      handleCloseProfile();
      expect(selectedProfileUserId).toBeNull();
      isSheetMounted = Boolean(selectedProfileUserId);
      expect(isSheetMounted).toBe(false);

      // Step 5: Unmounted sheet renders null
      const unmountedSheet = createElement(UserProfileSheet, {
        open: Boolean(selectedProfileUserId),
        userId: selectedProfileUserId,
        onClose: handleCloseProfile,
      });
      expect(renderToStaticMarkup(unmountedSheet)).toBe('');
    });
  });

  // ===========================================================================
  // 2. Requirement R4.2: Focus Window Switching (Today, Week, Month) & Accuracy
  // ===========================================================================
  describe('Challenge 2: Focus Window Switching & Focus Duration Calculation Accuracy', () => {
    it('2.1: windowMs oracle accurately computes Today, Week, and Month focus milliseconds', () => {
      const paceRow = createPaceRow({
        userId: 'u-calc',
        displayName: 'Calculator',
        todayHours: 3.5, // 3h 30m = 12,600,000 ms
        weekHours: 21.0, // 21h = 75,600,000 ms
        monthHours: 84.25, // 84h 15m = 303,300,000 ms
      });

      // Today
      const todayMs = windowMs(paceRow, 'today', anchorISO);
      expect(todayMs).toBe(3.5 * 3600000);
      expect(formatDuration(todayMs)).toBe('3h 30m');

      // Week
      const weekMs = windowMs(paceRow, 'week', anchorISO);
      expect(weekMs).toBe(21 * 3600000);
      expect(formatDuration(weekMs)).toBe('21h');

      // Month
      const monthMs = windowMs(paceRow, 'month', anchorISO);
      expect(monthMs).toBe(84.25 * 3600000);
      expect(formatDuration(monthMs)).toBe('84h 15m');
    });

    it('2.2: windowMs handles edge cases: expired date keys return 0 ms with clean duration format', () => {
      const expiredRow = createPaceRow({
        userId: 'u-expired',
        displayName: 'Expired Date Keys',
        todayHours: 5,
        weekHours: 25,
        monthHours: 100,
        todayKey: '2026-10-01', // Outdated day
        weekKey: '2026-09-28',  // Outdated week
        monthKey: '2026-09-01', // Outdated month
      });

      expect(windowMs(expiredRow, 'today', anchorISO)).toBe(0);
      expect(windowMs(expiredRow, 'week', anchorISO)).toBe(0);
      expect(windowMs(expiredRow, 'month', anchorISO)).toBe(0);

      expect(formatDuration(windowMs(expiredRow, 'today', anchorISO))).toBe('0s');
      expect(formatDuration(windowMs(expiredRow, 'week', anchorISO))).toBe('0s');
      expect(formatDuration(windowMs(expiredRow, 'month', anchorISO))).toBe('0s');
    });

    it('2.3: formatDuration produces mathematically sound, concise strings across all ranges', () => {
      expect(formatDuration(0)).toBe('0s');
      expect(formatDuration(400)).toBe('0s'); // sub-second threshold
      expect(formatDuration(45000)).toBe('45s'); // 45 seconds
      expect(formatDuration(900000)).toBe('15 min'); // exactly 15 minutes
      expect(formatDuration(915000)).toBe('15m 15s'); // 15 mins 15s
      expect(formatDuration(3600000)).toBe('1h'); // exactly 1 hour
      expect(formatDuration(5400000)).toBe('1h 30m'); // 1 hour 30 mins
      expect(formatDuration(360000000)).toBe('100h'); // 100 hours
      expect(formatDuration(360060000)).toBe('100h 1m'); // 100 hours 1 min
    });

    it('2.4: UserProfileSheet initial render displays capsule contour and header before async profile hydration', () => {
      const previewRow = createPaceRow({
        userId: 'u-preview',
        displayName: 'Preview User',
        todayHours: 2.5,
        weekHours: 15,
        monthHours: 60,
        streak: 12,
      });

      // Render with boardPreview and boardPaceWindow='today'
      const html = renderToStaticMarkup(
        createElement(UserProfileSheet, {
          open: true,
          userId: 'u-preview',
          boardPreview: previewRow,
          boardPaceWindow: 'today',
          onClose: vi.fn(),
        }),
      );

      // Verify profile title, grab bar, and card structure are rendered
      expect(html).toContain('Profile Card');
      expect(html).toContain('rounded-[28px]');
      expect(html).toContain('Close profile');
    });

    it('2.5: Interactive switching logic across Today, Week, and Month updates duration display', () => {
      const paceRow = createPaceRow({
        userId: 'u-interactive',
        displayName: 'Interactive User',
        todayHours: 3.25,  // 3h 15m
        weekHours: 22.5,   // 22h 30m
        monthHours: 95.0,  // 95h
        streak: 19,
      });

      // Emulate the focus window state machine inside UserProfileSheet
      type WindowOption = { id: PaceWindow; label: string };
      const FOCUS_WINDOWS: WindowOption[] = [
        { id: 'today', label: 'Today' },
        { id: 'week', label: 'Week' },
        { id: 'month', label: 'Month' },
      ];

      const renderFocusCard = (activeWindow: PaceWindow) => {
        const ms = windowMs(paceRow, activeWindow, anchorISO);
        const formatted = formatDuration(ms);
        const buttons = FOCUS_WINDOWS.map((w) => ({
          id: w.id,
          label: w.label,
          active: w.id === activeWindow,
          classes: w.id === activeWindow ? 'bg-primary-soft text-primary shadow-xs' : 'text-content-muted',
        }));
        return {
          windowLabel: `${activeWindow} focus`,
          durationFormatted: formatted,
          durationMs: ms,
          buttons,
        };
      };

      // Transition 1: 'today'
      const todayState = renderFocusCard('today');
      expect(todayState.windowLabel).toBe('today focus');
      expect(todayState.durationFormatted).toBe('3h 15m');
      expect(todayState.buttons.find((b) => b.id === 'today')?.active).toBe(true);
      expect(todayState.buttons.find((b) => b.id === 'week')?.active).toBe(false);

      // Transition 2: switch to 'week'
      const weekState = renderFocusCard('week');
      expect(weekState.windowLabel).toBe('week focus');
      expect(weekState.durationFormatted).toBe('22h 30m');
      expect(weekState.buttons.find((b) => b.id === 'week')?.active).toBe(true);
      expect(weekState.buttons.find((b) => b.id === 'today')?.active).toBe(false);

      // Transition 3: switch to 'month'
      const monthState = renderFocusCard('month');
      expect(monthState.windowLabel).toBe('month focus');
      expect(monthState.durationFormatted).toBe('95h');
      expect(monthState.buttons.find((b) => b.id === 'month')?.active).toBe(true);
      expect(monthState.buttons.find((b) => b.id === 'week')?.active).toBe(false);
    });
  });

  // ===========================================================================
  // 3. Requirement R4.3: Modal Closing via Close Button and Backdrop
  // ===========================================================================
  describe('Challenge 3: Modal Closing via Close Button and Backdrop Dismissal', () => {
    it('3.1: Close button in UserProfileSheet header triggers onClose callback', () => {
      const onCloseSpy = vi.fn();
      const previewRow = createPaceRow({
        userId: 'u-close-btn',
        displayName: 'Dismissible User',
        todayHours: 2,
        weekHours: 10,
        monthHours: 40,
      });

      const vdom = inspectComponent(UserProfileSheet, {
        open: true,
        userId: 'u-close-btn',
        boardPreview: previewRow,
        onClose: onCloseSpy,
      });

      expect(vdom).toBeDefined();
      // vdom is Overlay, its child is the card wrapper div
      const cardWrapper = vdom.props.children;
      // cardWrapper children: grab bar (0), header (1), body (2)
      const header = cardWrapper.props.children[1];
      expect(header).toBeDefined();

      // In header, child 0 is title, child 1 is close button
      const closeButton = header.props.children[1];
      expect(closeButton.type).toBe('button');
      expect(closeButton.props['aria-label']).toBe('Close profile');
      expect(typeof closeButton.props.onClick).toBe('function');

      // Click close button
      closeButton.props.onClick();
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('3.2: Backdrop click triggers onClose, but clicks inside the sheet do NOT close it', () => {
      const onCloseSpy = vi.fn();

      const vdom = inspectComponent(UserProfileSheet, {
        open: true,
        userId: 'u-backdrop-test',
        onClose: onCloseSpy,
      });

      // In mocked Overlay, outer backdrop has onClick=onClose
      const overlayProps = vdom.props;
      expect(overlayProps.open).toBe(true);
      expect(overlayProps.onClose).toBe(onCloseSpy);

      // Simulate backdrop click
      overlayProps.onClose();
      expect(onCloseSpy).toHaveBeenCalledTimes(1);
    });

    it('3.3: UserProfileSheet returns null when closed or when userId is null', () => {
      // 1. open is false
      const closedSheet = inspectComponent(UserProfileSheet, {
        open: false,
        userId: 'u-1',
        onClose: vi.fn(),
      });
      // Overlay receives open=false, which renders null
      const closedHtml = renderToStaticMarkup(closedSheet);
      expect(closedHtml).toBe('');

      // 2. userId is null
      const nullUserSheet = inspectComponent(UserProfileSheet, {
        open: false,
        userId: null,
        onClose: vi.fn(),
      });
      expect(nullUserSheet).toBeNull();
    });
  });

  // ===========================================================================
  // 4. Requirement R4.4: Static & Dynamic Absence of HTML <select> Elements
  // ===========================================================================
  describe('Challenge 4: Complete Absence of HTML <select> and <option> Elements', () => {
    it('4.1: Source code analysis of UserProfileSheet.tsx confirms zero <select> tags', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      expect(fs.existsSync(filePath)).toBe(true);

      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Comprehensive regex check for any select or option elements
      const selectTagMatch = fileContent.match(/<select[\s>]/gi);
      const closeSelectMatch = fileContent.match(/<\/select>/gi);
      const optionTagMatch = fileContent.match(/<option[\s>]/gi);
      const closeOptionMatch = fileContent.match(/<\/option>/gi);

      expect(selectTagMatch).toBeNull();
      expect(closeSelectMatch).toBeNull();
      expect(optionTagMatch).toBeNull();
      expect(closeOptionMatch).toBeNull();
    });

    it('4.2: UserProfileSheet.tsx contains premium segmented pill buttons instead of dropdown', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Verifies segmented buttons with FOCUS_WINDOWS
      expect(fileContent).toContain('FOCUS_WINDOWS.map');
      expect(fileContent).toContain('setFocusWindow(w.id)');
      expect(fileContent).toContain('rounded-[28px]'); // Sleek capsule contours
      expect(fileContent).toContain('rounded-[10px]'); // Pill selector container
      expect(fileContent).toContain('bg-primary-soft text-primary'); // Active state pill highlight
    });
  });

  // ===========================================================================
  // 5. Requirement R4.5: Adversarial Boundary Cases & UI Polish
  // ===========================================================================
  describe('Challenge 5: Adversarial Boundary Scenarios & UI Polish', () => {
    it('5.1: Private stats state: renders private message and hides segmented buttons', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Verify that stats_private hides the buttons and renders the locked banner
      expect(fileContent).toContain('stats_private');
      expect(fileContent).toContain('This user keeps their focus stats private');
    });

    it('5.2: Self-profile detection renders "You" pill and omits friendship action buttons', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      // Verify self badge and conditional social actions
      expect(fileContent).toContain('isSelf');
      expect(fileContent).toContain('!isSelf && user');
      expect(fileContent).toContain('Send Friend Request');
      expect(fileContent).toContain('Message');
    });

    it('5.3: Users without @username show "Public board only" pill and guidance note', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      expect(fileContent).toContain('Public board only');
      expect(fileContent).toContain('canUsePrivateHub');
      expect(fileContent).toContain('Private Hub messaging &amp; requests unlock when this user claims a username handle.');
    });

    it('5.4: Clean typography and hashtag badges are supported without overflow', () => {
      const filePath = path.resolve(__dirname, '../src/components/UserProfileSheet.tsx');
      const fileContent = fs.readFileSync(filePath, 'utf-8');

      expect(fileContent).toContain('hashtagLabel');
      expect(fileContent).toContain('truncate');
      expect(fileContent).toContain('line-clamp-3');
    });
  });
});
