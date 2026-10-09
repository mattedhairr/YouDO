import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SquadProgressBoard, {
  computeSquadBarProgress,
  collectiveBarPercent,
} from '../src/components/squad/SquadProgressBoard';
import type { PaceRow } from '../src/lib/paceBoard';

function createMockPaceRow(userId: string, todayMs: number, barHours: number = 8): PaceRow {
  return {
    userId,
    displayName: `User_${userId}`,
    examLabel: 'GATE',
    todayMs,
    weekMs: todayMs,
    monthMs: todayMs,
    todayKey: '2026-10-09',
    streak: 3,
    barHours,
    updatedAt: '2026-10-09T10:00:00Z',
  };
}

describe('Auditor Forensic Verification: Requirement R3 Live Board Complete Purge', () => {
  const squadProgressBoardPath = path.resolve('src/components/squad/SquadProgressBoard.tsx');
  const squadRoomSheetPath = path.resolve('src/components/SquadRoomSheet.tsx');

  it('verifies complete absence of "Live board" code, text, or elements in SquadProgressBoard.tsx', () => {
    const code = fs.readFileSync(squadProgressBoardPath, 'utf-8');
    expect(code.toLowerCase()).not.toContain('live board');
    expect(code).not.toContain('LiveBoard');
    expect(code).not.toContain('live_board');
    expect(code).not.toContain('formatRelative');
    expect(code).not.toContain('activity.map');
    expect(code).not.toMatch(/Zap/);
  });

  it('verifies complete absence of "Live board" in SquadRoomSheet.tsx', () => {
    const code = fs.readFileSync(squadRoomSheetPath, 'utf-8');
    expect(code.toLowerCase()).not.toContain('live board');
    expect(code).not.toContain('LiveBoard');
    expect(code).not.toContain('live_board');
  });

  it('verifies that no file in src/ contains "live board" UI components', () => {
    const srcDir = path.resolve('src');
    function scanDir(dir: string): string[] {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const violations: string[] = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          violations.push(...scanDir(fullPath));
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (content.toLowerCase().includes('live board') && !entry.name.includes('test')) {
            violations.push(fullPath);
          }
        }
      }
      return violations;
    }

    const matches = scanDir(srcDir);
    expect(matches).toEqual([]);
  });

  it('verifies that member segregation ("Different daily bar" / "On their own bars") is completely eliminated', () => {
    const code = fs.readFileSync(squadProgressBoardPath, 'utf-8');
    expect(code).not.toContain('Different daily bar');
    expect(code).not.toContain('On their own bars');
    expect(code).not.toContain('separateMembers');
    expect(code).not.toContain('collectiveMembers');
  });
});

describe('Auditor Forensic Verification: Mathematical Computation of Progress', () => {
  const anchorISO = '2026-10-09';
  const targetMs8h = 8 * 60 * 60 * 1000;

  it('calculates 0% progress when focus is 0', () => {
    const row = createMockPaceRow('u1', 0, 8);
    const progress = computeSquadBarProgress(row, 8, 'today', anchorISO);
    expect(progress.focused).toBe(0);
    expect(progress.percent).toBe(0);
    expect(progress.percentRaw).toBe(0);
    expect(progress.overMs).toBe(0);
    expect(progress.targetMs).toBe(targetMs8h);
  });

  it('calculates exact mid-way progress (50%)', () => {
    const row = createMockPaceRow('u1', targetMs8h / 2, 8);
    const progress = computeSquadBarProgress(row, 8, 'today', anchorISO);
    expect(progress.focused).toBe(targetMs8h / 2);
    expect(progress.percent).toBe(50);
    expect(progress.percentRaw).toBe(50);
    expect(progress.overMs).toBe(0);
  });

  it('calculates 100% completion correctly', () => {
    const row = createMockPaceRow('u1', targetMs8h, 8);
    const progress = computeSquadBarProgress(row, 8, 'today', anchorISO);
    expect(progress.focused).toBe(targetMs8h);
    expect(progress.percent).toBe(100);
    expect(progress.percentRaw).toBe(100);
    expect(progress.overMs).toBe(0);
  });

  it('handles over-bar progress by clamping visual percent to 100 while preserving percentRaw and overMs', () => {
    const twoHoursMs = 2 * 60 * 60 * 1000;
    const row = createMockPaceRow('u1', targetMs8h + twoHoursMs, 8);
    const progress = computeSquadBarProgress(row, 8, 'today', anchorISO);
    expect(progress.percent).toBe(100);
    expect(progress.percentRaw).toBe(125);
    expect(progress.overMs).toBe(twoHoursMs);
  });

  it('collectiveBarPercent correctly averages member raw percentages and rounds mathematically', () => {
    expect(collectiveBarPercent([])).toBe(0);

    const members = [
      { progress: computeSquadBarProgress(createMockPaceRow('u1', 2 * 3600 * 1000, 8), 8, 'today', anchorISO) }, // 25%
      { progress: computeSquadBarProgress(createMockPaceRow('u2', 4 * 3600 * 1000, 8), 8, 'today', anchorISO) }, // 50%
      { progress: computeSquadBarProgress(createMockPaceRow('u3', 8 * 3600 * 1000, 8), 8, 'today', anchorISO) }, // 100%
    ];
    // (25 + 50 + 100) / 3 = 175 / 3 = 58.333... -> 58
    expect(collectiveBarPercent(members)).toBe(58);
  });
});

describe('Auditor Forensic Verification: Stacked Capsules & Dynamic Merge Mechanics', () => {
  const anchorISO = '2026-10-09';

  function renderBoard(memberData: Array<{ id: string; name: string; hours: number; doneHours: number }>) {
    const members = memberData.map((m) => ({
      user_id: m.id,
      profiles: { display_name: m.name, avatar_url: `https://example.com/${m.id}.jpg` },
    }));
    const paceByUserId: Record<string, PaceRow> = {};
    for (const m of memberData) {
      paceByUserId[m.id] = createMockPaceRow(m.id, m.doneHours * 3600 * 1000, m.hours);
    }

    return renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 8,
        paceWindow: 'today',
        anchorISO,
        currentUserId: 'u1',
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 8),
      }),
    );
  }

  it('renders stacked capsules for individual users with distinct progress fills', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8, doneHours: 4 }, // 50%
      { id: 'u2', name: 'Bob', hours: 8, doneHours: 2 },   // 25%
    ]);

    expect(html).toContain('title="Alice: 50%"');
    expect(html).toContain('title="Bob: 25%"');
    expect(html).toContain('style="height:50%"');
    expect(html).toContain('style="height:25%"');
    // Both incomplete -> both have full rounded caps
    expect(html).toContain('rounded-t-full rounded-b-full my-0.5');
  });

  it('does NOT merge capsules when only one of adjacent members has completed their bar', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8, doneHours: 8 }, // 100% (complete)
      { id: 'u2', name: 'Bob', hours: 8, doneHours: 4 },   // 50% (incomplete)
    ]);

    // Alice is complete but Bob is not -> Alice stays rounded at bottom, Bob stays rounded at top
    // Neither should have rounded-b-none or rounded-t-none
    expect(html).not.toContain('rounded-b-none');
    expect(html).not.toContain('rounded-t-none');
  });

  it('flattens adjacent caps and collapses margin when two neighboring members reach 100%', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8, doneHours: 8 }, // 100% (top)
      { id: 'u2', name: 'Bob', hours: 8, doneHours: 8 },   // 100% (bottom)
    ]);

    // Top capsule: top rounded, bottom flattened! Margin collapses at bottom (mt-0.5 mb-0)
    expect(html).toContain('rounded-t-full rounded-b-none mt-0.5 mb-0');
    // Bottom capsule: top flattened, bottom rounded! Margin collapses at top (mt-0 mb-0.5)
    expect(html).toContain('rounded-t-none rounded-b-full mt-0 mb-0.5');
    // Both completed capsules use secondary accent color
    expect(html).toContain('bg-secondary');
    // Banner indicates completion
    expect(html).toContain('Collective complete');
  });

  it('merges 3 contiguous completed capsules into one continuous pillar with flat inner joints and 0 margin', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8, doneHours: 8 },   // top (100%)
      { id: 'u2', name: 'Bob', hours: 8, doneHours: 8 },     // middle (100%)
      { id: 'u3', name: 'Charlie', hours: 8, doneHours: 8 }, // bottom (100%)
    ]);

    // Top capsule: rounded-t-full, rounded-b-none, mt-0.5 mb-0
    expect(html).toContain('rounded-t-full rounded-b-none mt-0.5 mb-0');
    // Middle capsule: flattened both top and bottom! Zero margin!
    expect(html).toContain('rounded-t-none rounded-b-none my-0');
    // Bottom capsule: rounded-t-none, rounded-b-full, mt-0 mb-0.5
    expect(html).toContain('rounded-t-none rounded-b-full mt-0 mb-0.5');
  });

  it('merges only contiguous completed capsules in a 4-member squad', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8, doneHours: 8 },   // complete (100%)
      { id: 'u2', name: 'Bob', hours: 8, doneHours: 3 },     // incomplete (38%)
      { id: 'u3', name: 'Charlie', hours: 8, doneHours: 8 }, // complete (100%)
      { id: 'u4', name: 'David', hours: 8, doneHours: 8 },   // complete (100%)
    ]);

    // Alice is separated from Bob, so Alice is not merged with Bob: rounded-t-full rounded-b-full my-0.5
    // Charlie (index 2) merges with David (index 3), but NOT Bob (index 1)
    // Charlie top is rounded-t-full because above (Bob) is NOT complete; bottom is rounded-b-none
    expect(html).toContain('rounded-t-full rounded-b-none mt-0.5 mb-0');
    // David top is rounded-t-none; bottom is rounded-b-full
    expect(html).toContain('rounded-t-none rounded-b-full mt-0 mb-0.5');
  });
});

describe('Auditor Forensic Verification: Redundant Percentage Text Purge', () => {
  const anchorISO = '2026-10-09';

  it('eliminates redundant percentage labels and displays clean progress states', () => {
    const members = [
      { user_id: 'u1', profiles: { display_name: 'Alice' } },
      { user_id: 'u2', profiles: { display_name: 'Bob' } },
      { user_id: 'u3', profiles: { display_name: 'Charlie' } },
    ];
    const paceByUserId: Record<string, PaceRow> = {
      u1: createMockPaceRow('u1', 8 * 3600 * 1000, 8), // 100% (Bar reached)
      u2: createMockPaceRow('u2', 10 * 3600 * 1000, 8), // 125% (+2h over bar)
      u3: createMockPaceRow('u3', 4 * 3600 * 1000, 8), // 50%
    };

    const html = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 8,
        paceWindow: 'today',
        anchorISO,
        currentUserId: 'u1',
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 8),
      }),
    );

    // Completed member shows "Bar reached" without repeating 100% in row summary
    expect(html).toContain('Bar reached');
    // Over member shows "+2h over bar"
    expect(html).toContain('+2h over bar');
    // Incomplete member shows single percentage
    expect(html).toContain('50%');

    // Confirm elimination of old verbose repeating lines:
    expect(html).not.toContain('% complete');
    expect(html).not.toContain('No synced bar');
  });
});

describe('Auditor Forensic Verification: Interactive DP Avatar Button Wiring', () => {
  const anchorISO = '2026-10-09';

  it('renders interactive button for each member DP with proper aria-label and click handler', () => {
    const members = [
      { user_id: 'u1', profiles: { display_name: 'Alice', avatar_url: 'https://example.com/a.png' } },
      { user_id: 'u2', profiles: { display_name: 'Bob', avatar_url: 'https://example.com/b.png' } },
    ];
    const paceByUserId = {
      u1: createMockPaceRow('u1', 4 * 3600 * 1000, 8),
      u2: createMockPaceRow('u2', 4 * 3600 * 1000, 8),
    };

    const html = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 8,
        paceWindow: 'today',
        anchorISO,
        currentUserId: 'u1',
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 8),
        onOpenProfile: () => {},
      }),
    );

    // Both members should have interactive DP buttons
    expect(html).toContain('aria-label="View Alice&#x27;s profile"');
    expect(html).toContain('aria-label="View Bob&#x27;s profile"');
    expect(html).toContain('title="View Alice&#x27;s profile"');
    expect(html).toContain('title="View Bob&#x27;s profile"');
  });
});

describe('Auditor Forensic Verification: Unification of All Room Members', () => {
  const anchorISO = '2026-10-09';

  it('renders all squad members in a single collective board even when their individual barHours differ', () => {
    const members = [
      { user_id: 'u1', profiles: { display_name: 'Alice' } },
      { user_id: 'u2', profiles: { display_name: 'Bob' } },
      { user_id: 'u3', profiles: { display_name: 'Charlie' } },
    ];
    // Different bar hours for each member:
    const paceByUserId = {
      u1: createMockPaceRow('u1', 4 * 3600 * 1000, 4),  // 4h bar
      u2: createMockPaceRow('u2', 8 * 3600 * 1000, 8),  // 8h bar
      u3: createMockPaceRow('u3', 12 * 3600 * 1000, 12), // 12h bar
    };

    const html = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId,
        squadBarHours: 8,
        paceWindow: 'today',
        anchorISO,
        currentUserId: 'u1',
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 8),
      }),
    );

    // All 3 members rendered on the collective board
    expect(html).toContain('1. Alice');
    expect(html).toContain('2. Bob');
    expect(html).toContain('3. Charlie');

    // No segregated lists or cards exist
    expect(html).not.toContain('Different daily bar');
    expect(html).not.toContain('On their own bars');
  });
});

describe('Auditor Forensic Verification: Zero Hardcoding and Dynamic Computation', () => {
  const anchorISO = '2026-10-09';

  it('empirically computes different heights and styles strictly from runtime props', () => {
    const members = [
      { user_id: 'user_dynamic_1', profiles: { display_name: 'DynamicUser' } },
    ];

    // Test with 3 hours on a 6 hour bar = 50%
    const pace1 = {
      user_dynamic_1: createMockPaceRow('user_dynamic_1', 3 * 3600 * 1000, 6),
    };
    const html1 = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId: pace1,
        squadBarHours: 6,
        paceWindow: 'today',
        anchorISO,
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 6),
      }),
    );
    expect(html1).toContain('style="height:50%"');
    expect(html1).toContain('title="DynamicUser: 50%"');
    expect(html1).toContain('bg-primary');

    // Test with 6 hours on a 6 hour bar = 100%
    const pace2 = {
      user_dynamic_1: createMockPaceRow('user_dynamic_1', 6 * 3600 * 1000, 6),
    };
    const html2 = renderToStaticMarkup(
      createElement(SquadProgressBoard, {
        members,
        paceByUserId: pace2,
        squadBarHours: 6,
        paceWindow: 'today',
        anchorISO,
        emptyPaceRow: (uid: string) => createMockPaceRow(uid, 0, 6),
      }),
    );
    expect(html2).toContain('style="height:100%"');
    expect(html2).toContain('title="DynamicUser: 100%"');
    expect(html2).toContain('bg-secondary');
  });
});
