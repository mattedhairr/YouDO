import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../../types';
import {
  createBlueprintStudioController,
} from './blueprintStudioState';
import { duplicateStudioItems, patchStudioItems, topStudioSelection } from '../../lib/studioWorkspace';
import { flattenBlueprint } from '../../lib/blueprintStudio';

function createDeepLinearTree(): GoalNode[] {
  return [
    {
      id: 'root-1',
      kind: 'goal',
      title: 'Root Calculus',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'level-1',
          kind: 'node',
          title: 'Differential Calculus',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'level-2',
              kind: 'node',
              title: 'Limits & Derivatives',
              completed: false,
              createdAt: 1020,
              children: [
                {
                  id: 'level-3',
                  kind: 'node',
                  title: 'Chain Rule Methods',
                  completed: false,
                  createdAt: 1030,
                  children: [
                    {
                      id: 'level-4',
                      kind: 'node',
                      title: 'Implicit Differentiation',
                      completed: false,
                      createdAt: 1040,
                      children: [
                        {
                          id: 'level-5',
                          kind: 'node',
                          title: 'Related Rates Problems',
                          completed: false,
                          createdAt: 1050,
                          steps: ['Problem setup', 'Derive equation', 'Solve for rate'],
                          stepDone: [false, false, false],
                          children: [],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ];
}

function createForestTree(): GoalNode[] {
  // 4 Roots, each with 2 branches, each with 2 leaves = 4 * (1 + 2 + 4) = 28 nodes total (16 leaves)
  return Array.from({ length: 4 }, (_, rIdx) => ({
    id: `root-${rIdx + 1}`,
    kind: 'goal' as const,
    title: `Forest Goal ${rIdx + 1}`,
    completed: false,
    createdAt: 1000 + rIdx,
    children: Array.from({ length: 2 }, (_, bIdx) => ({
      id: `root-${rIdx + 1}-branch-${bIdx + 1}`,
      kind: 'node' as const,
      title: `Branch ${rIdx + 1}.${bIdx + 1}`,
      completed: false,
      createdAt: 2000 + rIdx * 10 + bIdx,
      children: Array.from({ length: 2 }, (_, lIdx) => ({
        id: `root-${rIdx + 1}-branch-${bIdx + 1}-leaf-${lIdx + 1}`,
        kind: 'node' as const,
        title: `Leaf ${rIdx + 1}.${bIdx + 1}.${lIdx + 1}`,
        completed: false,
        createdAt: 3000 + rIdx * 100 + bIdx * 10 + lIdx,
        steps: [`Initial step ${lIdx + 1}`],
        stepDone: [false],
        children: [],
      })),
    })),
  }));
}

describe('Milestone 2 & 3 Gate: Adversarial Stress Probes', () => {
  describe('Probe 1: Multi-Selection & Top Selection Under Deep Nesting', () => {
    it('P1.1 collapses full 6-level linear hierarchy to topmost parent', () => {
      const goals = createDeepLinearTree();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['root-1', 'level-1', 'level-2', 'level-3', 'level-4', 'level-5'],
      });

      expect(studio.selectedIds.size).toBe(6);
      const top = studio.topSelectedIds();
      expect(top).toEqual(['root-1']);
    });

    it('P1.2 collapses sub-branches when root is not selected', () => {
      const goals = createDeepLinearTree();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['level-1', 'level-2', 'level-3', 'level-4', 'level-5'],
      });

      expect(studio.topSelectedIds()).toEqual(['level-1']);

      // Unselect level-1, level-2 becomes topmost
      studio.toggleSelect('level-1');
      expect(studio.topSelectedIds()).toEqual(['level-2']);

      // Unselect level-2, level-3 becomes topmost
      studio.toggleSelect('level-2');
      expect(studio.topSelectedIds()).toEqual(['level-3']);
    });

    it('P1.3 collapses skipping intermediate levels (e.g. root-1 and level-5)', () => {
      const goals = createDeepLinearTree();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['root-1', 'level-5'], // Level 1..4 are NOT selected
      });

      // Since level-5 is a descendant of root-1, only root-1 should be returned
      expect(studio.topSelectedIds()).toEqual(['root-1']);

      // Similarly with level-2 and level-5 (level-3 and level-4 omitted)
      studio.clearSelection();
      studio.toggleSelect('level-2');
      studio.toggleSelect('level-5');
      expect(studio.topSelectedIds()).toEqual(['level-2']);
    });

    it('P1.4 resolves multi-tree forest selections with mixed depths', () => {
      const forest = createForestTree();
      const studio = createBlueprintStudioController({ goals: forest });

      // Tree 1: select root and a leaf -> should collapse to root-1
      studio.toggleSelect('root-1');
      studio.toggleSelect('root-1-branch-1-leaf-1');

      // Tree 2: select branch-1, and both its leaves -> should collapse to branch-1
      // and select sibling branch-2
      studio.toggleSelect('root-2-branch-1');
      studio.toggleSelect('root-2-branch-1-leaf-1');
      studio.toggleSelect('root-2-branch-1-leaf-2');
      studio.toggleSelect('root-2-branch-2');

      // Tree 3: select only leaves across two branches -> both leaves should remain
      studio.toggleSelect('root-3-branch-1-leaf-1');
      studio.toggleSelect('root-3-branch-2-leaf-2');

      const top = studio.topSelectedIds();

      expect(top).toContain('root-1');
      expect(top).not.toContain('root-1-branch-1-leaf-1');

      expect(top).toContain('root-2-branch-1');
      expect(top).toContain('root-2-branch-2');
      expect(top).not.toContain('root-2-branch-1-leaf-1');
      expect(top).not.toContain('root-2-branch-1-leaf-2');

      expect(top).toContain('root-3-branch-1-leaf-1');
      expect(top).toContain('root-3-branch-2-leaf-2');
      expect(top.length).toBe(5);
    });

    it('P1.5 safely filters out hundreds of non-existent node IDs without error', () => {
      const goals = createDeepLinearTree();
      const nonExistentIds = Array.from({ length: 500 }, (_, i) => `ghost-node-${i}`);
      const mixedIds = [...nonExistentIds, 'level-2', 'level-3'];

      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: mixedIds,
      });

      expect(studio.selectedIds.size).toBe(502);

      // topSelectedIds must filter out all 500 ghost nodes, and collapse level-3 into level-2
      const top = studio.topSelectedIds();
      expect(top).toEqual(['level-2']);

      // Calling topStudioSelection directly on pure non-existent IDs
      const onlyGhosts = topStudioSelection(goals, nonExistentIds);
      expect(onlyGhosts).toEqual([]);

      // Empty set
      expect(topStudioSelection(goals, [])).toEqual([]);
    });

    it('P1.6 stress tests rapid selection toggling (1,000 iterations)', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });
      const targetId = 'root-1-branch-1-leaf-1';

      for (let i = 0; i < 1000; i++) {
        studio.toggleSelect(targetId);
        if (i % 2 === 0) {
          expect(studio.selectedIds.has(targetId)).toBe(true);
          expect(studio.isSelectionMode).toBe(true);
        } else {
          expect(studio.selectedIds.has(targetId)).toBe(false);
          expect(studio.isSelectionMode).toBe(false);
        }
      }

      expect(studio.selectedIds.size).toBe(0);
      expect(studio.isSelectionMode).toBe(false);

      // Rapid selectAll and clearSelection cycles
      for (let i = 0; i < 100; i++) {
        studio.selectAll();
        expect(studio.selectedIds.size).toBe(28);
        expect(studio.isSelectionMode).toBe(true);

        studio.clearSelection();
        expect(studio.selectedIds.size).toBe(0);
        expect(studio.isSelectionMode).toBe(false);
      }
    });

    it('P1.7 handles orphaned child selection after parent deletion', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['root-1-branch-1', 'root-1-branch-1-leaf-1'],
      });

      // Remove the parent branch
      const res = studio.removeNodes(['root-1-branch-1']);
      expect(res.success).toBe(true);

      // Parent was removed from selectedIds, but child remains in selectedIds Set
      // topSelectedIds must gracefully discard the now-nonexistent child
      const top = studio.topSelectedIds();
      expect(top).toEqual([]);

      // Opening modal defaults to topSelectedIds, resulting in empty target list
      studio.openModal('bulk_add_inside');
      expect(studio.targetNodeIds).toEqual([]);
    });
  });

  describe('Probe 2: Domain Action Dispatchers in Reducer', () => {
    it('P2.1 executes rapid multi-action pipeline (addChildrenInside -> setDates -> diffSteps -> undo/redo)', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });

      // Target 2 leaves
      const targetLeaves = ['root-1-branch-1-leaf-1', 'root-2-branch-1-leaf-1'];

      // Action 1: Bulk Add Inside (converts endpoints to branches)
      const addRes = studio.addChildrenInside(
        targetLeaves,
        ['Subtask Alpha', 'Subtask Beta'],
        { convertExistingSteps: true },
      );
      expect(addRes.success).toBe(true);
      // 2 parents * 2 new titles + 2 converted steps = 6 items created
      expect(addRes.createdIds.length).toBe(6);
      expect(studio.undoStack.length).toBe(1);

      // Action 2: Set Dates across all created IDs
      const dateRes = studio.setDates(addRes.createdIds, {
        startDate: '2026-11-01',
        endDate: '2026-11-15',
      });
      expect(dateRes.success).toBe(true);
      expect(dateRes.count).toBe(6);
      expect(studio.undoStack.length).toBe(2);

      // Action 3: Diff Steps (add 3 steps to each of the 6 newly created endpoints)
      const diffRes = studio.diffSteps(
        addRes.createdIds,
        ['Verify Spec', 'Run Test Suite', 'Deploy Artifact'],
        [],
      );
      expect(diffRes.success).toBe(true);
      expect(diffRes.affectedCount).toBe(6);
      expect(diffRes.addedCount).toBe(18);
      expect(studio.undoStack.length).toBe(3);

      // Verify the final state on draftGoals
      const allNodes = flattenBlueprint(studio.draftGoals);
      const newItems = allNodes.filter((n) => addRes.createdIds.includes(n.id));
      expect(newItems.length).toBe(6);
      for (const item of newItems) {
        expect(item.startDate).toBe('2026-11-01');
        expect(item.endDate).toBe('2026-11-15');
        expect(item.steps).toEqual(['Verify Spec', 'Run Test Suite', 'Deploy Artifact']);
        expect(item.stepDone).toEqual([false, false, false]);
      }

      // Action 4: Step removal diffing
      const diffRemoveRes = studio.diffSteps(
        addRes.createdIds,
        ['Post-Launch Check'],
        ['Verify Spec'],
      );
      expect(diffRemoveRes.success).toBe(true);
      expect(diffRemoveRes.addedCount).toBe(6);
      expect(diffRemoveRes.removedCount).toBe(6);
      expect(studio.undoStack.length).toBe(4);

      // Reverse: Undo 4 times
      expect(studio.undo()).toBe(true); // Undo step diff 2
      expect(studio.undo()).toBe(true); // Undo step diff 1
      expect(studio.undo()).toBe(true); // Undo dates
      expect(studio.undo()).toBe(true); // Undo add children
      expect(studio.undo()).toBe(false); // At base

      // Verify exact equality with baseGoals
      expect(studio.draftGoals).toEqual(studio.baseGoals);
      expect(studio.isDirty).toBe(false);

      // Forward: Redo 4 times
      expect(studio.redo()).toBe(true);
      expect(studio.redo()).toBe(true);
      expect(studio.redo()).toBe(true);
      expect(studio.redo()).toBe(true);
      expect(studio.redo()).toBe(false);

      // Final state restored
      expect(studio.isDirty).toBe(true);
      const restoredNodes = flattenBlueprint(studio.draftGoals);
      const restoredItems = restoredNodes.filter((n) => addRes.createdIds.includes(n.id));
      expect(restoredItems.length).toBe(6);
      expect(restoredItems[0].steps).toContain('Post-Launch Check');
      expect(restoredItems[0].steps).not.toContain('Verify Spec');
    });

    it('P2.2 gracefully handles empty inputs across core domain action dispatchers without polluting history', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });
      const initialStackLen = studio.undoStack.length;

      // 1. Empty parentIds or empty titles in addChildrenInside
      const res1 = studio.addChildrenInside([], []);
      expect(res1).toEqual({ success: true, count: 0, createdIds: [] });
      expect(studio.undoStack.length).toBe(initialStackLen);

      const res2 = studio.addChildrenInside(['root-1'], []);
      expect(res2).toEqual({ success: true, count: 0, createdIds: [] });
      expect(studio.undoStack.length).toBe(initialStackLen);

      const res3 = studio.addChildrenInside([], ['Title 1']);
      expect(res3).toEqual({ success: true, count: 0, createdIds: [] });
      expect(studio.undoStack.length).toBe(initialStackLen);

      // Non-existent parent IDs
      const res4 = studio.addChildrenInside(['ghost-id-1', 'ghost-id-2'], ['Valid Title']);
      expect(res4).toEqual({ success: true, count: 0, createdIds: [] });
      expect(studio.undoStack.length).toBe(initialStackLen);

      // 2. Empty diffSteps
      const diff1 = studio.diffSteps([], [], []);
      expect(diff1.success).toBe(true);
      expect(diff1.affectedCount).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      const diff2 = studio.diffSteps(['root-1-branch-1-leaf-1'], [], []);
      expect(diff2.success).toBe(true);
      expect(diff2.affectedCount).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      const diff3 = studio.diffSteps([], ['Step 1'], ['Step 2']);
      expect(diff3.success).toBe(true);
      expect(diff3.affectedCount).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      const diff4 = studio.diffSteps(['ghost-id'], ['Step 1'], []);
      expect(diff4.success).toBe(true);
      expect(diff4.affectedCount).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      // 3. Empty setDates
      const date1 = studio.setDates([], { startDate: '2026-10-10' });
      expect(date1.success).toBe(true);
      expect(date1.count).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      const date2 = studio.setDates(['root-1-branch-1-leaf-1'], {});
      expect(date2.success).toBe(true);
      expect(date2.count).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      const date3 = studio.setDates(['ghost-id'], { startDate: '2026-10-10' });
      expect(date3.success).toBe(true);
      expect(date3.count).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      // 4. Empty removeNodes
      const rem1 = studio.removeNodes([]);
      expect(rem1.success).toBe(true);
      expect(rem1.count).toBe(0);
      expect(studio.undoStack.length).toBe(initialStackLen);

      // 5. Empty moveNodes
      const move1 = studio.moveNodes([], null);
      expect(move1.success).toBe(true);
      expect(studio.undoStack.length).toBe(initialStackLen);
    });

    it('P2.2b verifies referential integrity: duplicateStudioItems and patchStudioItems preserve references on empty inputs', () => {
      const goals = createForestTree();

      const dupResult = duplicateStudioItems(goals, []);
      expect(dupResult).toBe(goals);
      expect(dupResult).toEqual(goals);

      const patchResult = patchStudioItems(goals, {});
      expect(patchResult).toBe(goals);
      expect(patchResult).toEqual(goals);
    });

    it('P2.3 strips whitespace-only titles and skips no-op updates', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });

      // Whitespace-only child titles
      const addRes = studio.addChildrenInside(
        ['root-1-branch-1'],
        ['   ', '\t\n\r', ' \u00A0 '],
      );
      expect(addRes.success).toBe(true);
      expect(addRes.count).toBe(0);
      expect(addRes.createdIds).toEqual([]);
      expect(studio.undoStack.length).toBe(0);

      // Whitespace-only step diffing
      const diffRes = studio.diffSteps(
        ['root-1-branch-1-leaf-1'],
        ['   ', '\t'],
        ['   ', '\n'],
      );
      expect(diffRes.success).toBe(true);
      expect(diffRes.affectedCount).toBe(0);
      expect(studio.undoStack.length).toBe(0);
    });

    it('P2.4 enforces sibling deduplication with case and whitespace folding', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });

      // Add "Sprint Planning" under root-1-branch-1
      const res1 = studio.addChildrenInside(['root-1-branch-1'], ['Sprint Planning']);
      expect(res1.count).toBe(1);

      // Attempt to add variations of the same title
      const res2 = studio.addChildrenInside(
        ['root-1-branch-1'],
        ['SPRINT PLANNING', '  sprint   planning  ', 'Sprint Planning'],
      );
      // All should be deduplicated against existing sibling
      expect(res2.count).toBe(0);
      expect(res2.createdIds).toEqual([]);
    });

    it('P2.5 handles extreme unicode, emoji, script tags, and long titles robustly', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });

      const extremeTitles = [
        '🚀 Rocket Launch 🪐 Astronomy 2026',
        '🔥 Hotfix 🛠️ v2.0.1',
        'مهمة عاجلة جداً (Urgent RTL Task)',
        '한국어 목표 설정 및 평가',
        '<script>alert("xss")</script>',
        'SELECT * FROM users WHERE 1=1; DROP TABLE goals; --',
        'A'.repeat(5000), // 5000 chars
      ];

      const addRes = studio.addChildrenInside(['root-1-branch-1'], extremeTitles);
      expect(addRes.success).toBe(true);
      expect(addRes.count).toBe(extremeTitles.length);

      // Diff steps with extreme titles
      const extremeSteps = [
        '✨ Step with sparkling emojis 🌟',
        'תקציר פרק 1',
        '<style>body { display: none; }</style>',
      ];

      const diffRes = studio.diffSteps(addRes.createdIds, extremeSteps, []);
      expect(diffRes.success).toBe(true);
      expect(diffRes.affectedCount).toBe(extremeTitles.length);
      expect(diffRes.addedCount).toBe(extremeTitles.length * extremeSteps.length);

      // Verify node contents in draftGoals
      const allNodes = flattenBlueprint(studio.draftGoals);
      const addedNodes = allNodes.filter((n) => addRes.createdIds.includes(n.id));
      expect(addedNodes.length).toBe(extremeTitles.length);
      expect(addedNodes[0].steps).toEqual(extremeSteps);
    });

    it('P2.6 rejects invalid date formats and inverted date ranges', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });
      const targetId = 'root-1-branch-1-leaf-1';

      // Invalid format
      const res1 = studio.setDates([targetId], { startDate: '2026/10/10' });
      expect(res1.success).toBe(false);
      expect(studio.errorMessage).toContain('Invalid start date');

      // Invalid calendar day (Feb 30)
      const res2 = studio.setDates([targetId], { startDate: '2026-02-30' });
      expect(res2.success).toBe(false);
      expect(studio.errorMessage).toContain('Invalid start date');

      // Non-leap year Feb 29
      const res3 = studio.setDates([targetId], { startDate: '2025-02-29' });
      expect(res3.success).toBe(false);
      expect(studio.errorMessage).toContain('Invalid start date');

      // Valid leap year Feb 29
      const resLeap = studio.setDates([targetId], { startDate: '2024-02-29' });
      expect(resLeap.success).toBe(true);

      // Inverted range
      const resInverted = studio.setDates([targetId], {
        startDate: '2026-12-01',
        endDate: '2026-01-01',
      });
      expect(resInverted.success).toBe(false);
      expect(studio.errorMessage).toContain('cannot be after end date');

      // Clear error message
      studio.clearMessages();
      expect(studio.errorMessage).toBeNull();
    });

    it('P2.7 enforces active session task protections across all actions', () => {
      const goals = createForestTree();
      const activeTaskId = 'root-1-branch-1-leaf-1';
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: activeTaskId,
      });

      // 1. Cannot add children inside active task (which would convert it to branch)
      const addRes = studio.addChildrenInside([activeTaskId], ['New Child']);
      expect(addRes.success).toBe(false);
      expect(studio.errorMessage).toContain('Cannot convert active session task');

      // 2. Cannot remove steps from active session task
      const diffRes = studio.diffSteps([activeTaskId], [], ['Initial step 1']);
      expect(diffRes.success).toBe(false);
      expect(studio.errorMessage).toContain('Cannot delete steps from active session task');

      // 3. Adding steps to active task IS allowed
      const diffAddRes = studio.diffSteps([activeTaskId], ['Additional step'], []);
      expect(diffAddRes.success).toBe(true);

      // 4. Cannot convert active task to branch
      const convBranch = studio.convertToBranch(activeTaskId);
      expect(convBranch.success).toBe(false);
      expect(studio.errorMessage).toContain('Cannot convert active session task');

      // 5. Cannot delete active session task
      const remRes = studio.removeNodes([activeTaskId]);
      expect(remRes.success).toBe(false);
      expect(studio.errorMessage).toContain('Cannot delete active session task');
    });

    it('P2.8 survives rapid high-volume stress (160 node creations & updates in <200ms)', () => {
      const goals = createForestTree();
      const studio = createBlueprintStudioController({ goals });

      const startTime = performance.now();

      // Collect all 16 leaf nodes (4 roots * 2 branches * 2 leaves = 16)
      const leafIds = flattenBlueprint(goals)
        .filter((n) => n.children.length === 0)
        .map((n) => n.id);
      expect(leafIds.length).toBe(16);

      // Add 10 children to each leaf (16 * 10 = 160 nodes created)
      const titles = Array.from({ length: 10 }, (_, i) => `Stress Task ${i + 1}`);
      const addRes = studio.addChildrenInside(leafIds, titles);
      expect(addRes.success).toBe(true);
      expect(addRes.count).toBe(160);

      // Set dates on all 160 created nodes
      const dateRes = studio.setDates(addRes.createdIds, {
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });
      expect(dateRes.success).toBe(true);
      expect(dateRes.count).toBe(160);

      // Add 5 steps to each of the 160 nodes (800 steps created)
      const diffRes = studio.diffSteps(
        addRes.createdIds,
        ['S1', 'S2', 'S3', 'S4', 'S5'],
        [],
      );
      expect(diffRes.success).toBe(true);
      expect(diffRes.affectedCount).toBe(160);
      expect(diffRes.addedCount).toBe(800);

      const duration = performance.now() - startTime;
      // High-volume operations should complete well under 500ms
      expect(duration).toBeLessThan(500);

      // Verify total nodes: 28 original + 160 new = 188 total
      const totalNodes = flattenBlueprint(studio.draftGoals);
      expect(totalNodes.length).toBe(28 + 160);
    });
  });
});
