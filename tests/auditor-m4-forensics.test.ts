import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SquadProgressBoard from '../src/components/squad/SquadProgressBoard';
import type { PaceRow } from '../src/lib/paceBoard';

// Mock Overlay for Node/SSR static rendering
vi.mock('../src/components/Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'overlay-mock' }, children) : null,
}));

// Mock AuthContext
vi.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'test_user_id' } }),
}));

import UserProfileSheet from '../src/components/UserProfileSheet';

function createMockPaceRow(userId: string, todayMs: number, barHours: number = 4): PaceRow {
  return {
    userId,
    displayName: `User_${userId}`,
    examLabel: 'GATE',
    todayMs,
    weekMs: todayMs * 3,
    monthMs: todayMs * 10,
    todayKey: '2026-10-09',
    streak: 5,
    barHours,
    updatedAt: '2026-10-09T10:00:00Z',
  };
}

describe('Auditor Forensic Verification: Requirement R4 - Interactive Member DPs', () => {
  const squadProgressBoardPath = path.resolve('src/components/squad/SquadProgressBoard.tsx');
  const squadRoomSheetPath = path.resolve('src/components/SquadRoomSheet.tsx');

  it('verifies static source code wiring of interactive member avatar buttons in SquadProgressBoard.tsx', () => {
    const code = fs.readFileSync(squadProgressBoardPath, 'utf-8');

    // Must define onOpenProfile prop
    expect(code).toContain('onOpenProfile?: (userId: string) => void;');
    
    // Must contain interactive button wrapping avatar with click handler
    expect(code).toContain('onClick={() => onOpenProfile?.(m.userId)}');
    expect(code).toContain('aria-label={`View ${m.name}\'s profile`}');
    expect(code).toContain('title={`View ${m.name}\'s profile`}');
  });

  it('renders interactive member avatar buttons in SquadProgressBoard static markup', () => {
    const members = [
      { user_id: 'user_1', profiles: { display_name: 'Alice', avatar_url: '' } },
      { user_id: 'user_2', profiles: { display_name: 'Bob', avatar_url: '' } },
    ];
    const paceByUserId = {
      user_1: createMockPaceRow('user_1', 2 * 3600 * 1000),
      user_2: createMockPaceRow('user_2', 4 * 3600 * 1000),
    };

    const html = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 4,
        paceWindow: 'today',
        anchorISO: '2026-10-09',
        emptyPaceRow: (id: string) => createMockPaceRow(id, 0),
        onOpenProfile: () => {},
      })
    );

    // Verify accessible buttons rendered for both members
    expect(html).toContain('aria-label="View Alice&#x27;s profile"');
    expect(html).toContain('title="View Alice&#x27;s profile"');
    expect(html).toContain('aria-label="View Bob&#x27;s profile"');
    expect(html).toContain('title="View Bob&#x27;s profile"');
  });

  it('verifies wiring in SquadRoomSheet.tsx to open and close UserProfileSheet', () => {
    const code = fs.readFileSync(squadRoomSheetPath, 'utf-8');

    // Must import UserProfileSheet
    expect(code).toContain("import UserProfileSheet from './UserProfileSheet';");

    // Must maintain selected profile user state
    expect(code).toContain('const [selectedProfileUserId, setSelectedProfileUserId] = useState<string | null>(null);');

    // Must pass onOpenProfile callback to SquadProgressBoard
    expect(code).toMatch(/onOpenProfile=\{.*?setSelectedProfileUserId\(uid\).*?\}/);

    // Must render UserProfileSheet conditionally when selectedProfileUserId is active
    expect(code).toContain('<UserProfileSheet');
    expect(code).toContain('userId={selectedProfileUserId}');
    expect(code).toContain('onClose={() => setSelectedProfileUserId(null)}');
  });
});

describe('Auditor Forensic Verification: Requirement R4 - UserProfileSheet Redesign & Styling', () => {
  const userProfileSheetPath = path.resolve('src/components/UserProfileSheet.tsx');
  const code = fs.readFileSync(userProfileSheetPath, 'utf-8');

  it('verifies rounded-[28px] capsule contour and animation on profile card container', () => {
    expect(code).toContain('rounded-[28px]');
    expect(code).toContain('shadow-2xl');
    expect(code).toContain('animate-in');
    expect(code).toContain('zoom-in-95');
  });

  it('verifies glowing avatar ring and visual styling', () => {
    expect(code).toContain('ring-4 ring-primary/10');
    expect(code).toContain('border-primary/25');
    expect(code).toContain('rounded-full');
  });

  it('verifies verified username pill badge formatting', () => {
    expect(code).toContain('@{privateHandle}');
    expect(code).toContain('bg-primary-soft/90');
    expect(code).toContain('border-primary/20');
    expect(code).toContain('rounded-full');
  });

  it('verifies segmented pill dock for focus windows (Today / Week / Month)', () => {
    // Must declare FOCUS_WINDOWS with today, week, month
    expect(code).toContain("id: 'today', label: 'Today'");
    expect(code).toContain("id: 'week', label: 'Week'");
    expect(code).toContain("id: 'month', label: 'Month'");

    // Must render segmented buttons inside rounded dock
    expect(code).toContain('rounded-[10px]');
    expect(code).toContain('FOCUS_WINDOWS.map');
    expect(code).toContain('setFocusWindow(w.id)');

    // Must dynamically compute duration from windowMs(paceRow, focusWindow)
    expect(code).toContain('formatDuration(windowMs(paceRow, focusWindow))');
  });

  it('verifies absolute absence of legacy HTML select element', () => {
    // Requirement replaces select with segmented pill dock
    expect(code).not.toContain('<select');
    expect(code).not.toContain('</select>');
    expect(code).not.toContain('<option');
  });

  it('verifies grab bar, header typography, and stats structure in source code', () => {
    expect(code).toContain('w-10 h-1 rounded-full bg-subtle');
    expect(code).toContain('Profile Card');
    expect(code).toContain('Focus Stats');
    expect(code).toContain('Streak');
    expect(code).toContain('Lock size={18}');
    expect(code).toContain('This user keeps their focus stats private');
  });

  it('renders UserProfileSheet container markup cleanly', () => {
    const preview = createMockPaceRow('user_preview', 3 * 3600 * 1000);
    preview.displayName = 'Test Aspirant';
    preview.streak = 7;

    const html = renderToStaticMarkup(
      createElement(UserProfileSheet, {
        open: true,
        userId: 'user_preview',
        boardPreview: preview,
        boardPaceWindow: 'week',
        onClose: () => {},
      })
    );

    expect(html).toContain('rounded-[28px]');
    expect(html).toContain('Profile Card');
    expect(html).toContain('Close profile');
  });
});

describe('Auditor Forensic Verification: Absence of Hardcoded Test Results & Facades', () => {
  const userProfileSheetPath = path.resolve('src/components/UserProfileSheet.tsx');
  const squadProgressBoardPath = path.resolve('src/components/squad/SquadProgressBoard.tsx');
  const squadRoomSheetPath = path.resolve('src/components/SquadRoomSheet.tsx');

  it('ensures UserProfileSheet does not contain hardcoded mock bypasses or static fake responses', () => {
    const code = fs.readFileSync(userProfileSheetPath, 'utf-8');

    expect(code).not.toContain('__mock__');
    expect(code).not.toContain('test-override');
    expect(code).not.toContain('mockProfile');
    expect(code).not.toContain('bypassed');

    // Genuine imports and Supabase service calls
    expect(code).toContain('fetchProfile');
    expect(code).toContain('checkFriendshipStatus');
    expect(code).toContain('sendFriendRequest');
    expect(code).toContain('removeFriend');
    expect(code).toContain('fetchPaceRowForUser');
  });

  it('ensures SquadProgressBoard does not contain dummy facade implementations', () => {
    const code = fs.readFileSync(squadProgressBoardPath, 'utf-8');

    expect(code).not.toContain('__mock__');
    expect(code).not.toContain('test-override');
    expect(code).not.toContain('bypassed');
    expect(code).toContain('computeSquadBarProgress');
    expect(code).toContain('collectiveBarPercent');
  });

  it('ensures SquadRoomSheet does not bypass profile interaction', () => {
    const code = fs.readFileSync(squadRoomSheetPath, 'utf-8');

    expect(code).not.toContain('bypassed');
    expect(code).toContain('onOpenProfile={(uid) => setSelectedProfileUserId(uid)}');
  });
});
