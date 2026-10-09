import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import SquadProgressBoard from '../src/components/squad/SquadProgressBoard';
import type { PaceRow } from '../src/lib/paceBoard';

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
    streak: 1,
    barHours,
    updatedAt: '2026-10-09T10:00:00Z',
  };
}

function renderBoard(
  membersData: { id: string; name: string; hours: number; barHours?: number }[],
  currentUserId = 'u1',
) {
  const members = membersData.map((m) => ({
    user_id: m.id,
    profiles: { display_name: m.name, avatar_url: '' },
  }));

  const paceByUserId: Record<string, PaceRow> = {};
  for (const m of membersData) {
    paceByUserId[m.id] = createPaceRow(m.id, m.hours, m.barHours ?? 8);
  }

  const emptyPaceRow = (uid: string): PaceRow => createPaceRow(uid, 0, 8);

  const element = createElement(SquadProgressBoard, {
    members,
    paceByUserId,
    squadBarHours: 8,
    paceWindow: 'today',
    anchorISO,
    currentUserId,
    viewerBarHours: 8,
    emptyPaceRow,
  });

  return renderToStaticMarkup(element);
}

/** Extracts capsule div class attributes from rendered HTML */
function extractCapsules(html: string): { title: string; classes: string; fillStyle: string; fillClasses: string }[] {
  // Regex to match capsule divs in column 2
  // <div class="w-3.5 relative flex flex-col justify-end overflow-hidden ... [classes] ..." title="[title]">
  //   <div class="[fillClasses]" style="height: [fillStyle]%" />
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

describe('M3 Empirical Challenge: Capsule UI & Visual Merging Logic', () => {
  // ---------------------------------------------------------------------------
  // 1. Combination 1: 0 completed (all in-progress / incomplete)
  // ---------------------------------------------------------------------------
  it('Combination 1: 0 completed - each member has separate rounded capsule with spacing', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 0 },
      { id: 'u2', name: 'Bob', hours: 2 },
      { id: 'u3', name: 'Charlie', hours: 4 },
      { id: 'u4', name: 'Diana', hours: 6 },
    ]);

    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(4);

    // Every capsule must retain full top and bottom rounding
    for (let i = 0; i < 4; i++) {
      expect(capsules[i].classes).toContain('rounded-t-full');
      expect(capsules[i].classes).toContain('rounded-b-full');
      expect(capsules[i].classes).not.toContain('rounded-t-none');
      expect(capsules[i].classes).not.toContain('rounded-b-none');
      // Margin should be my-0.5 to keep spacing between distinct capsules
      expect(capsules[i].classes).toContain('my-0.5');
      // Fill accent is primary (not secondary)
      expect(capsules[i].fillClasses).toContain('bg-primary');
      expect(capsules[i].fillClasses).not.toContain('bg-secondary');
    }

    // Header checks
    expect(html).toContain('0 of 4 bars reached');
    expect(html).not.toContain('Collective complete');
  });

  // ---------------------------------------------------------------------------
  // 2. Combination 2: Alternating completed members (0 & 2 complete, 1 & 3 incomplete)
  // ---------------------------------------------------------------------------
  it('Combination 2: Alternating completed members - completed capsules do NOT merge across incomplete members', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8 },   // 100% complete
      { id: 'u2', name: 'Bob', hours: 4 },     // 50% incomplete
      { id: 'u3', name: 'Charlie', hours: 8 }, // 100% complete
      { id: 'u4', name: 'Diana', hours: 2 },   // 25% incomplete
    ]);

    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(4);

    // Alice (index 0, complete): neighbor below is Bob (incomplete) -> cannot merge down!
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-full');
    expect(capsules[0].classes).not.toContain('rounded-b-none');
    expect(capsules[0].classes).toContain('my-0.5');
    expect(capsules[0].fillClasses).toContain('bg-secondary');

    // Bob (index 1, incomplete):
    expect(capsules[1].classes).toContain('rounded-t-full');
    expect(capsules[1].classes).toContain('rounded-b-full');
    expect(capsules[1].classes).toContain('my-0.5');
    expect(capsules[1].fillClasses).toContain('bg-primary');

    // Charlie (index 2, complete): neighbor above (Bob) and neighbor below (Diana) are both incomplete -> cannot merge!
    expect(capsules[2].classes).toContain('rounded-t-full');
    expect(capsules[2].classes).toContain('rounded-b-full');
    expect(capsules[2].classes).not.toContain('rounded-t-none');
    expect(capsules[2].classes).not.toContain('rounded-b-none');
    expect(capsules[2].classes).toContain('my-0.5');
    expect(capsules[2].fillClasses).toContain('bg-secondary');

    // Diana (index 3, incomplete):
    expect(capsules[3].classes).toContain('rounded-t-full');
    expect(capsules[3].classes).toContain('rounded-b-full');
    expect(capsules[3].classes).toContain('my-0.5');
    expect(capsules[3].fillClasses).toContain('bg-primary');

    // Header count
    expect(html).toContain('2 of 4 bars reached');
    expect(html).not.toContain('Collective complete');
  });

  // ---------------------------------------------------------------------------
  // 3. Combination 3: Consecutive completed members merge seamlessly
  // ---------------------------------------------------------------------------
  it('Combination 3A: Consecutive completed members in the middle (Bob & Charlie: index 1 & 2)', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 3 },   // incomplete
      { id: 'u2', name: 'Bob', hours: 8 },     // complete (index 1)
      { id: 'u3', name: 'Charlie', hours: 8 }, // complete (index 2)
      { id: 'u4', name: 'Diana', hours: 2 },   // incomplete
    ]);

    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(4);

    // Alice: untouched rounded pill
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-full');
    expect(capsules[0].classes).toContain('my-0.5');

    // Bob (index 1): complete, merges with Charlie below
    // Top stays rounded, bottom cap FLATTENS (rounded-b-none), margin collapses at bottom (mt-0.5 mb-0)
    expect(capsules[1].classes).toContain('rounded-t-full');
    expect(capsules[1].classes).toContain('rounded-b-none');
    expect(capsules[1].classes).toContain('mt-0.5 mb-0');
    expect(capsules[1].fillClasses).toContain('bg-secondary');

    // Charlie (index 2): complete, merges with Bob above
    // Top cap FLATTENS (rounded-t-none), bottom stays rounded, margin collapses at top (mt-0 mb-0.5)
    expect(capsules[2].classes).toContain('rounded-t-none');
    expect(capsules[2].classes).toContain('rounded-b-full');
    expect(capsules[2].classes).toContain('mt-0 mb-0.5');
    expect(capsules[2].fillClasses).toContain('bg-secondary');

    // Diana: untouched rounded pill
    expect(capsules[3].classes).toContain('rounded-t-full');
    expect(capsules[3].classes).toContain('rounded-b-full');
    expect(capsules[3].classes).toContain('my-0.5');

    expect(html).toContain('2 of 4 bars reached');
  });

  it('Combination 3B: Top consecutive pair (Alice & Bob: index 0 & 1)', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8 },   // complete (index 0)
      { id: 'u2', name: 'Bob', hours: 8 },     // complete (index 1)
      { id: 'u3', name: 'Charlie', hours: 3 }, // incomplete
      { id: 'u4', name: 'Diana', hours: 2 },   // incomplete
    ]);

    const capsules = extractCapsules(html);
    // Alice: top of entire board stays rounded, bottom cap flattens
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-none');
    expect(capsules[0].classes).toContain('mt-0.5 mb-0');

    // Bob: top cap flattens, bottom stays rounded
    expect(capsules[1].classes).toContain('rounded-t-none');
    expect(capsules[1].classes).toContain('rounded-b-full');
    expect(capsules[1].classes).toContain('mt-0 mb-0.5');
  });

  it('Combination 3C: Bottom consecutive pair (Charlie & Diana: index 2 & 3)', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 1 },   // incomplete
      { id: 'u2', name: 'Bob', hours: 2 },     // incomplete
      { id: 'u3', name: 'Charlie', hours: 8 }, // complete (index 2)
      { id: 'u4', name: 'Diana', hours: 8 },   // complete (index 3)
    ]);

    const capsules = extractCapsules(html);
    // Charlie: top stays rounded, bottom cap flattens
    expect(capsules[2].classes).toContain('rounded-t-full');
    expect(capsules[2].classes).toContain('rounded-b-none');
    expect(capsules[2].classes).toContain('mt-0.5 mb-0');

    // Diana: top cap flattens, bottom of entire board stays rounded
    expect(capsules[3].classes).toContain('rounded-t-none');
    expect(capsules[3].classes).toContain('rounded-b-full');
    expect(capsules[3].classes).toContain('mt-0 mb-0.5');
  });

  it('Combination 3D: 3 consecutive completed members (Alice, Bob, Charlie complete; Diana incomplete)', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8 },   // complete (index 0)
      { id: 'u2', name: 'Bob', hours: 8 },     // complete (index 1)
      { id: 'u3', name: 'Charlie', hours: 8 }, // complete (index 2)
      { id: 'u4', name: 'Diana', hours: 3 },   // incomplete (index 3)
    ]);

    const capsules = extractCapsules(html);
    // Alice (top of merged trio): rounded top, flat bottom
    expect(capsules[0].classes).toContain('rounded-t-full rounded-b-none');
    expect(capsules[0].classes).toContain('mt-0.5 mb-0');

    // Bob (middle of merged trio): flat top, flat bottom, zero margin
    expect(capsules[1].classes).toContain('rounded-t-none rounded-b-none');
    expect(capsules[1].classes).toContain('my-0');

    // Charlie (bottom of merged trio): flat top, rounded bottom
    expect(capsules[2].classes).toContain('rounded-t-none rounded-b-full');
    expect(capsules[2].classes).toContain('mt-0 mb-0.5');

    // Diana (isolated incomplete): full rounding, normal margin
    expect(capsules[3].classes).toContain('rounded-t-full rounded-b-full');
    expect(capsules[3].classes).toContain('my-0.5');
    expect(capsules[3].fillClasses).toContain('bg-primary');
  });

  it('Boundary Stress: 99% progress does NOT trigger complete styling or merge', () => {
    // 7.92h out of 8h = 99%
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8 },     // 100% complete
      { id: 'u2', name: 'Bob', hours: 7.92 },    // 99% incomplete
    ]);

    const capsules = extractCapsules(html);
    // Alice cannot merge with 99% Bob
    expect(capsules[0].classes).toContain('rounded-t-full rounded-b-full');
    expect(capsules[0].classes).toContain('my-0.5');

    // Bob remains incomplete
    expect(capsules[1].classes).toContain('rounded-t-full rounded-b-full');
    expect(capsules[1].classes).toContain('my-0.5');
    expect(capsules[1].fillClasses).toContain('bg-primary');
    expect(html).toContain('99%');
    expect(html).toContain('1 of 2 bars reached');
  });

  // ---------------------------------------------------------------------------
  // 4. Combination 4: All completed (continuous glowing unbroken bar)
  // ---------------------------------------------------------------------------
  it('Combination 4: All completed - merges into one continuous unbroken glowing bar', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 8 },
      { id: 'u2', name: 'Bob', hours: 8 },
      { id: 'u3', name: 'Charlie', hours: 8 },
      { id: 'u4', name: 'Diana', hours: 8 },
    ]);

    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(4);

    // Member 0 (top): rounded-t-full, rounded-b-none, mt-0.5 mb-0
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-none');
    expect(capsules[0].classes).toContain('mt-0.5 mb-0');

    // Member 1 (inner): rounded-t-none, rounded-b-none, my-0
    expect(capsules[1].classes).toContain('rounded-t-none');
    expect(capsules[1].classes).toContain('rounded-b-none');
    expect(capsules[1].classes).toContain('my-0');

    // Member 2 (inner): rounded-t-none, rounded-b-none, my-0
    expect(capsules[2].classes).toContain('rounded-t-none');
    expect(capsules[2].classes).toContain('rounded-b-none');
    expect(capsules[2].classes).toContain('my-0');

    // Member 3 (bottom): rounded-t-none, rounded-b-full, mt-0 mb-0.5
    expect(capsules[3].classes).toContain('rounded-t-none');
    expect(capsules[3].classes).toContain('rounded-b-full');
    expect(capsules[3].classes).toContain('mt-0 mb-0.5');

    // All fills are secondary and have the glowing shadow
    for (const c of capsules) {
      expect(c.fillClasses).toContain('bg-secondary');
      expect(c.fillClasses).toContain('shadow-[');
      expect(c.fillStyle).toBe('height:100%');
    }

    // Collective complete header
    expect(html).toContain('Collective complete');
    expect(html).toContain('text-secondary');
    expect(html).not.toContain('bars reached');
  });

  // ---------------------------------------------------------------------------
  // 5. Variable room sizes: 1, 2, and 3 members
  // ---------------------------------------------------------------------------
  it('Edge Case: 1 member room at 100% renders single complete glowing capsule', () => {
    const html = renderBoard([{ id: 'u1', name: 'Solo', hours: 8 }]);
    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(1);
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-full');
    expect(capsules[0].classes).not.toContain('rounded-t-none');
    expect(capsules[0].classes).not.toContain('rounded-b-none');
    expect(capsules[0].fillClasses).toContain('bg-secondary');
    expect(html).toContain('Collective complete');
  });

  it('Edge Case: 2 member room with both 100% merges into 2-part unbroken bar', () => {
    const html = renderBoard([
      { id: 'u1', name: 'A', hours: 8 },
      { id: 'u2', name: 'B', hours: 8 },
    ]);
    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(2);
    expect(capsules[0].classes).toContain('rounded-t-full');
    expect(capsules[0].classes).toContain('rounded-b-none');
    expect(capsules[1].classes).toContain('rounded-t-none');
    expect(capsules[1].classes).toContain('rounded-b-full');
    expect(html).toContain('Collective complete');
  });

  it('Edge Case: 3 member room with all 100% merges middle into flat capsule', () => {
    const html = renderBoard([
      { id: 'u1', name: 'A', hours: 8 },
      { id: 'u2', name: 'B', hours: 8 },
      { id: 'u3', name: 'C', hours: 8 },
    ]);
    const capsules = extractCapsules(html);
    expect(capsules.length).toBe(3);
    expect(capsules[0].classes).toContain('rounded-t-full rounded-b-none');
    expect(capsules[1].classes).toContain('rounded-t-none rounded-b-none');
    expect(capsules[2].classes).toContain('rounded-t-none rounded-b-full');
  });

  // ---------------------------------------------------------------------------
  // 6. Over-bar completion (>100% progress)
  // ---------------------------------------------------------------------------
  it('Over-bar completion: fill is capped at 100% height and displays +over time without crashing', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Overachiever', hours: 10, barHours: 8 }, // 125%
    ]);
    const capsules = extractCapsules(html);
    expect(capsules[0].fillStyle).toBe('height:100%');
    expect(capsules[0].title).toContain('125%');
    expect(html).toContain('+2h over bar');
    expect(html).toContain('10h focus');
  });

  // ---------------------------------------------------------------------------
  // 7. Complete Absence of "Live Board" DOM elements, imports, or state
  // ---------------------------------------------------------------------------
  it('Absence of Live Board: zero occurrences of "Live board" in rendered HTML', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 5 },
      { id: 'u2', name: 'Bob', hours: 8 },
    ]);
    expect(html.toLowerCase()).not.toContain('live board');
    expect(html.toLowerCase()).not.toContain('liveboard');
    expect(html).not.toContain('No synced focus yet');
    expect(html).not.toContain('Dynamic activity board');
  });

  // ---------------------------------------------------------------------------
  // 8. Elimination of redundant percentage labels from member rows
  // ---------------------------------------------------------------------------
  it('Redundancy elimination: member rows do not contain duplicate percentage text', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Incomplete', hours: 4, barHours: 8 }, // 50%
      { id: 'u2', name: 'Reached', hours: 8, barHours: 8 },    // 100%
      { id: 'u3', name: 'Over', hours: 10, barHours: 8 },       // 125%
    ]);

    // Member 1 (incomplete): shows 50% once, followed by focus duration and bar size
    expect(html).toContain('50%');
    expect(html).toContain('4h focus');
    expect(html).toContain('(8h bar)');

    // Member 2 (reached): shows "Bar reached" with NO percentage text
    expect(html).toContain('Bar reached');
    expect(html).toContain('8h focus');

    // Member 3 (over): shows "+2h over bar" with NO percentage text
    expect(html).toContain('+2h over bar');
    expect(html).toContain('10h focus');

    // No "% complete" substring
    expect(html).not.toContain('% complete');

    // No "% of today bar" or repeating bar labels
    expect(html).not.toContain('% of today bar');
    expect(html).not.toContain('% of');

    // No "Different daily bar" or separate member cards
    expect(html).not.toContain('Different daily bar');
    expect(html).not.toContain('On their own bars');
  });

  // ---------------------------------------------------------------------------
  // 9. Interactive DP button wiring
  // ---------------------------------------------------------------------------
  it('Interactive DP button wiring: each member row includes an accessible profile button', () => {
    const html = renderBoard([
      { id: 'u1', name: 'Alice', hours: 2 },
      { id: 'u2', name: 'Bob', hours: 3 },
    ]);

    expect(html).toMatch(/aria-label="View Alice(&#x27;|')s profile"/);
    expect(html).toMatch(/title="View Alice(&#x27;|')s profile"/);
    expect(html).toMatch(/aria-label="View Bob(&#x27;|')s profile"/);
    expect(html).toMatch(/title="View Bob(&#x27;|')s profile"/);
  });
});
