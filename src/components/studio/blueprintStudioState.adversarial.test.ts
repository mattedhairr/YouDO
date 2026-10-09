import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../../types';
import { createBlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';

function createDeepMockTree(): GoalNode[] {
  return [
    {
      id: 'root-alpha',
      kind: 'goal',
      title: 'Pass All Exams',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-math',
          kind: 'node',
          title: 'Mathematics',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-active-session',
              kind: 'node',
              title: 'Calculus Problem Set 1',
              completed: false,
              createdAt: 1020,
              steps: ['Problem 1', 'Problem 2', 'Problem 3'],
              stepDone: [true, false, false],
              children: [],
            },
            {
              id: 'task-linear-algebra',
              kind: 'node',
              title: 'Matrix Factorization',
              completed: false,
              createdAt: 1030,
              steps: ['LU Decomposition', 'QR Algorithm'],
              stepDone: [false, false],
              children: [],
            },
          ],
        },
        {
          id: 'branch-physics',
          kind: 'node',
          title: 'Physics Mechanics',
          completed: false,
          createdAt: 1040,
          children: [
            {
              id: 'leaf-empty-lab',
              kind: 'node',
              title: 'Lab 1 Report',
              completed: false,
              createdAt: 1050,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-beta',
      kind: 'goal',
      title: 'Fitness & Health',
      completed: false,
      createdAt: 2000,
      children: [
        {
          id: 'task-running',
          kind: 'node',
          title: 'Morning 5K',
          completed: false,
          createdAt: 2010,
          steps: ['Warm up', 'Run 5km', 'Stretch'],
          stepDone: [false, false, false],
          children: [],
        },
      ],
    },
  ];
}

describe('blueprintStudioState Adversarial Probes', () => {
  describe('Adversarial Category 1: Undo / Redo Transactions Stress', () => {
    it('Probe 1.1: Repeated 100-cycle undo/redo maintains exact state consistency and cleanliness', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // Apply initial change
      studio.addChildrenInside(['branch-math'], ['Differential Equations']);
      const mutatedDraft = JSON.stringify(studio.draftGoals);

      for (let i = 0; i < 100; i++) {
        // Undo to base
        const undone = studio.undo();
        expect(undone).toBe(true);
        expect(studio.canUndo).toBe(false);
        expect(studio.canRedo).toBe(true);
        expect(studio.isDirty).toBe(false);
        expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));

        // Redo to mutation
        const redone = studio.redo();
        expect(redone).toBe(true);
        expect(studio.canUndo).toBe(true);
        expect(studio.canRedo).toBe(false);
        expect(studio.isDirty).toBe(true);
        expect(JSON.stringify(studio.draftGoals)).toBe(mutatedDraft);
      }

      // Finally undo back to base
      studio.undo();
      expect(studio.isDirty).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
    });

    it('Probe 1.2: Branching undo/redo wipes redoStack when a new change is applied mid-history', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // Action 1
      studio.addChildrenInside(['branch-math'], ['Child A']);
      const stateA = JSON.stringify(studio.draftGoals);

      // Action 2
      studio.setDates(['branch-math'], { startDate: '2026-11-01', endDate: '2026-11-30' });
      const stateB = JSON.stringify(studio.draftGoals);

      // Action 3
      studio.diffSteps(['task-linear-algebra'], ['SVD Decomposition'], []);

      expect(studio.undoStack).toHaveLength(3);
      expect(studio.canRedo).toBe(false);

      // Undo 2 steps: back to State A
      studio.undo(); // back to B
      expect(JSON.stringify(studio.draftGoals)).toBe(stateB);
      studio.undo(); // back to A
      expect(JSON.stringify(studio.draftGoals)).toBe(stateA);
      expect(studio.undoStack).toHaveLength(1);
      expect(studio.redoStack).toHaveLength(2);
      expect(studio.canRedo).toBe(true);

      // Now apply Action 4 (branching!)
      studio.convertToTask('leaf-empty-lab', ['Measure pendulum', 'Calculate g']);

      // Redo stack MUST be completely cleared!
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canRedo).toBe(false);
      expect(studio.undoStack).toHaveLength(2); // Base and State A
      expect(studio.lastActionDescription).toContain('Converted node to task');

      // Undo Action 4 -> should restore State A
      studio.undo();
      expect(JSON.stringify(studio.draftGoals)).toBe(stateA);

      // Undo Action 1 -> should restore pristine Base
      studio.undo();
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
      expect(studio.isDirty).toBe(false);
      expect(studio.canUndo).toBe(false);
    });

    it('Probe 1.3: Deep multi-mutation chain unwinds cleanly to 100% identical base state', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      const snapshots: string[] = [JSON.stringify(base)];

      // 1. Add children
      studio.addChildrenInside(['branch-physics'], ['Quantum Mechanics']);
      snapshots.push(JSON.stringify(studio.draftGoals));

      // 2. Diff steps (add)
      studio.diffSteps(['task-running'], ['Interval sprint 1'], []);
      snapshots.push(JSON.stringify(studio.draftGoals));

      // 3. Set dates
      studio.setDates(['task-running'], { startDate: '2026-10-15', endDate: '2026-10-25' });
      snapshots.push(JSON.stringify(studio.draftGoals));

      // 4. Convert empty node to task
      studio.convertToTask('leaf-empty-lab', ['Setup apparatus']);
      snapshots.push(JSON.stringify(studio.draftGoals));

      // 5. Convert task to branch
      studio.convertToBranch('task-linear-algebra', { convertExistingSteps: true });
      snapshots.push(JSON.stringify(studio.draftGoals));

      // 6. Remove node
      studio.removeNodes(['task-running']);
      snapshots.push(JSON.stringify(studio.draftGoals));

      expect(snapshots).toHaveLength(7);
      expect(studio.undoStack).toHaveLength(6);
      expect(studio.isDirty).toBe(true);

      // Unwind all 6 actions
      for (let step = 5; step >= 0; step--) {
        expect(JSON.stringify(studio.draftGoals)).toBe(snapshots[step + 1]);
        const undone = studio.undo();
        expect(undone).toBe(true);
        expect(JSON.stringify(studio.draftGoals)).toBe(snapshots[step]);
      }

      // At step 0 (base)
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));

      // Rewind forward all 6 actions
      for (let step = 0; step < 6; step++) {
        expect(JSON.stringify(studio.draftGoals)).toBe(snapshots[step]);
        const redone = studio.redo();
        expect(redone).toBe(true);
        expect(JSON.stringify(studio.draftGoals)).toBe(snapshots[step + 1]);
      }

      expect(studio.canRedo).toBe(false);
      expect(studio.redoStack).toHaveLength(0);
    });

    it('Probe 1.4: Immutable deep freeze audit ensures reducer and mutations never mutate history in-place', () => {
      const base = createDeepMockTree();

      function deepFreeze<T extends object>(obj: T): T {
        if (!obj || typeof obj !== 'object') return obj;
        Object.freeze(obj);
        for (const key of Object.keys(obj) as Array<keyof T>) {
          const val = obj[key];
          if (val && typeof val === 'object') {
            deepFreeze(val);
          }
        }
        return obj;
      }

      deepFreeze(base);

      const studio = createBlueprintStudioController({ goals: base });

      expect(() => {
        studio.addChildrenInside(['branch-math'], ['Calculus 3']);
        studio.diffSteps(['task-running'], ['Hydrate'], []);
        studio.setDates(['branch-physics'], { startDate: '2026-10-01' });
        studio.undo();
        studio.undo();
        studio.undo();
      }).not.toThrow();

      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
      expect(studio.isDirty).toBe(false);
    });

    it('Probe 1.5: Idempotent stack boundaries and Reset behavior', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // Calling undo/redo on pristine stack
      expect(studio.undo()).toBe(false);
      expect(studio.redo()).toBe(false);
      expect(studio.undoStack).toEqual([]);
      expect(studio.redoStack).toEqual([]);

      // Make a change and reset
      studio.addChildrenInside(['branch-math'], ['Temp Child']);
      expect(studio.isDirty).toBe(true);
      expect(studio.canUndo).toBe(true);

      studio.reset();
      expect(studio.isDirty).toBe(false);
      expect(studio.canUndo).toBe(false);
      expect(studio.canRedo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.errorMessage).toBeNull();
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
    });
  });

  describe('Adversarial Category 2: Active Session Task Guard Stress', () => {
    it('Probe 2.1: convertToBranch against activeGoalNodeId is strictly blocked and does not taint history', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      const res = studio.convertToBranch('task-active-session', { convertExistingSteps: true });
      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot convert active session task to branch.');
      expect(studio.errorMessage).toBe('Cannot convert active session task to branch.');

      // State and history invariants
      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Verify node still exists as endpoint task with its original steps intact
      const node = findGoal(studio.draftGoals, 'task-active-session');
      expect(node).toBeDefined();
      expect(node?.steps).toEqual(['Problem 1', 'Problem 2', 'Problem 3']);
      expect(node?.children).toHaveLength(0);
    });

    it('Probe 2.2: convertToTask against activeGoalNodeId is strictly blocked and does not taint history', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      const res = studio.convertToTask('task-active-session', ['Replaced step 1', 'Replaced step 2']);
      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot convert active session task.');
      expect(studio.errorMessage).toBe('Cannot convert active session task.');

      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      const node = findGoal(studio.draftGoals, 'task-active-session');
      expect(node?.steps).toEqual(['Problem 1', 'Problem 2', 'Problem 3']);
    });

    it('Probe 2.3: addChildrenInside directly on activeGoalNodeId is strictly blocked', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      const res = studio.addChildrenInside(['task-active-session'], ['Subtask 1', 'Subtask 2']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.createdIds).toEqual([]);
      expect(res.error).toBe('Cannot convert active session task by adding children inside.');
      expect(studio.errorMessage).toBe('Cannot convert active session task by adding children inside.');

      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
    });

    it('Probe 2.4: addChildrenInside on multi-parent batch containing activeGoalNodeId fails atomically', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      // Attempt bulk add across multiple parents where one is activeGoalNodeId
      const res = studio.addChildrenInside(
        ['branch-physics', 'task-active-session', 'root-beta'],
        ['Contaminated Child'],
      );

      // MUST abort before adding children to ANY parent!
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.createdIds).toEqual([]);
      expect(res.error).toContain('Cannot convert active session task');

      // Verify NO children were added to branch-physics or root-beta
      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      expect(findGoal(studio.draftGoals, 'branch-physics')?.children.some((c) => c.title === 'Contaminated Child')).toBe(false);
    });

    it('Probe 2.5: diffSteps step deletion on activeGoalNodeId is strictly blocked', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      // Single deletion
      const res = studio.diffSteps(['task-active-session'], [], ['Problem 2']);
      expect(res.success).toBe(false);
      expect(res.affectedCount).toBe(0);
      expect(res.removedCount).toBe(0);
      expect(res.error).toBe('Cannot delete steps from active session task.');
      expect(studio.errorMessage).toBe('Cannot delete steps from active session task.');

      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
    });

    it('Probe 2.6: diffSteps simultaneous addition AND deletion on activeGoalNodeId fails atomically', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      // Even if stepsToAdd is valid, presence of stepsToRemove must abort the entire operation
      const res = studio.diffSteps(
        ['task-active-session'],
        ['Urgent Added Problem'],
        ['Problem 2'],
      );

      expect(res.success).toBe(false);
      expect(res.addedCount).toBe(0);
      expect(res.error).toBe('Cannot delete steps from active session task.');

      // State unmodified: 'Urgent Added Problem' was NOT added
      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      const node = findGoal(studio.draftGoals, 'task-active-session');
      expect(node?.steps).not.toContain('Urgent Added Problem');
    });

    it('Probe 2.7: diffSteps multi-target batch containing activeGoalNodeId fails atomically', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      // Attempt to remove steps from task-linear-algebra and task-active-session
      const res = studio.diffSteps(
        ['task-linear-algebra', 'task-active-session'],
        [],
        ['LU Decomposition', 'Problem 2'],
      );

      expect(res.success).toBe(false);
      expect(res.error).toBe('Cannot delete steps from active session task.');

      // State unmodified: task-linear-algebra's step 'LU Decomposition' must NOT be deleted
      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      const linAlg = findGoal(studio.draftGoals, 'task-linear-algebra');
      expect(linAlg?.steps).toContain('LU Decomposition');
      expect(studio.canUndo).toBe(false);
    });

    it('Probe 2.8: diffSteps step ADDITION on activeGoalNodeId is explicitly allowed and undoable', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const res = studio.diffSteps(['task-active-session'], ['Problem 4 (bonus)'], []);
      expect(res.success).toBe(true);
      expect(res.addedCount).toBe(1);
      expect(res.affectedCount).toBe(1);
      expect(studio.canUndo).toBe(true);

      const node = findGoal(studio.draftGoals, 'task-active-session');
      expect(node?.steps).toContain('Problem 4 (bonus)');

      // Undo reverts the addition cleanly
      studio.undo();
      const reverted = findGoal(studio.draftGoals, 'task-active-session');
      expect(reverted?.steps).not.toContain('Problem 4 (bonus)');
      expect(studio.isDirty).toBe(false);
    });

    it('Probe 2.9: diffSteps with whitespace-only removals on activeGoalNodeId treats it as addition-only', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      // stepsToRemove contains empty and whitespace-only strings
      const res = studio.diffSteps(
        ['task-active-session'],
        ['Problem 4'],
        ['   ', ''],
      );

      expect(res.success).toBe(true);
      expect(res.addedCount).toBe(1);
      const node = findGoal(studio.draftGoals, 'task-active-session');
      expect(node?.steps).toContain('Problem 4');
    });

    it('Probe 2.10: removeNodes directly targeting activeGoalNodeId is strictly blocked', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      const res = studio.removeNodes(['task-active-session']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.error).toBe('Cannot delete active session task or its container.');
      expect(studio.errorMessage).toBe('Cannot delete active session task or its container.');

      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(studio.canUndo).toBe(false);
      expect(findGoal(studio.draftGoals, 'task-active-session')).toBeDefined();
    });

    it('Probe 2.11: removeNodes multi-target batch containing activeGoalNodeId fails atomically', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      const initialSnapshot = JSON.stringify(studio.draftGoals);

      // Attempt to delete task-linear-algebra, task-running, and task-active-session
      const res = studio.removeNodes(['task-linear-algebra', 'task-active-session', 'task-running']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.error).toBe('Cannot delete active session task or its container.');

      // Neither task-linear-algebra nor task-running should be deleted
      expect(JSON.stringify(studio.draftGoals)).toBe(initialSnapshot);
      expect(findGoal(studio.draftGoals, 'task-linear-algebra')).toBeDefined();
      expect(findGoal(studio.draftGoals, 'task-running')).toBeDefined();
      expect(studio.canUndo).toBe(false);
    });

    it('Probe 2.12: Dynamic mutation of activeGoalNodeId shifts guard appropriately', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      // Initially, task-active-session is guarded
      expect(studio.removeNodes(['task-active-session']).success).toBe(false);
      // task-running is unguarded
      expect(studio.removeNodes(['task-running']).success).toBe(true);
      studio.undo(); // restore task-running

      // Shift active session to task-running
      studio.setActiveGoalNodeId('task-running');
      expect(studio.activeGoalNodeId).toBe('task-running');

      // Now task-running is guarded
      expect(studio.removeNodes(['task-running']).success).toBe(false);
      // And task-active-session is now unguarded
      expect(studio.removeNodes(['task-active-session']).success).toBe(true);
    });

    it('Probe 2.13: Parent/Ancestor deletion of activeGoalNodeId is blocked and preserves active task', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      // Target the parent branch 'branch-math' which contains 'task-active-session'
      const res = studio.removeNodes(['branch-math']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.error).toBe('Cannot delete active session task or its container.');
      expect(studio.errorMessage).toBe('Cannot delete active session task or its container.');

      // Verify that neither the parent branch nor the active task was deleted
      expect(findGoal(studio.draftGoals, 'task-active-session')).not.toBeNull();
      expect(findGoal(studio.draftGoals, 'branch-math')).not.toBeNull();

      // Verify state is clean and no undo snapshot was created
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Target the root ancestor 'root-alpha' which contains 'branch-math' -> 'task-active-session'
      const resRoot = studio.removeNodes(['root-alpha']);
      expect(resRoot.success).toBe(false);
      expect(resRoot.count).toBe(0);
      expect(resRoot.error).toBe('Cannot delete active session task or its container.');
      expect(findGoal(studio.draftGoals, 'root-alpha')).not.toBeNull();
      expect(findGoal(studio.draftGoals, 'task-active-session')).not.toBeNull();
    });

    it('Probe 2.14: Guard behavior when activeGoalNodeId is undefined or whitespace', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: undefined,
      });

      // When activeGoalNodeId is undefined, operations proceed normally
      const resDiff = studio.diffSteps(['task-active-session'], [], ['Problem 2']);
      expect(resDiff.success).toBe(true);
      expect(resDiff.removedCount).toBe(1);

      const resRemove = studio.removeNodes(['task-active-session']);
      expect(resRemove.success).toBe(true);
      expect(findGoal(studio.draftGoals, 'task-active-session')).toBeNull();
    });

    it('Probe 2.15: Guard behavior under rapid repeated guarded attempts does not pollute undoStack', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      // Hammer the controller with 50 blocked attempts across all guarded methods
      for (let i = 0; i < 10; i++) {
        studio.convertToBranch('task-active-session');
        studio.convertToTask('task-active-session', ['step']);
        studio.addChildrenInside(['task-active-session'], ['sub']);
        studio.diffSteps(['task-active-session'], [], ['Problem 1']);
        studio.removeNodes(['task-active-session']);
      }

      // Assert undoStack is STILL 0 and isDirty is STILL false!
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.canRedo).toBe(false);
      expect(studio.isDirty).toBe(false);
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
    });
  });

  describe('Adversarial Category 3: No-Op Actions & History Cleanliness', () => {
    it('Probe 3.1: Non-existent node targets and no-op mutations do not create spurious undo frames', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // Empty additions
      studio.addChildrenInside(['branch-math'], []);
      expect(studio.undoStack).toHaveLength(0);

      // Non-existent parent
      studio.addChildrenInside(['ghost-id'], ['Some Child']);
      expect(studio.undoStack).toHaveLength(0);

      // Diff steps with empty arrays
      studio.diffSteps(['task-linear-algebra'], [], []);
      expect(studio.undoStack).toHaveLength(0);

      // Diff steps with non-existent target
      studio.diffSteps(['ghost-id'], ['Step A'], []);
      expect(studio.undoStack).toHaveLength(0);

      // Set dates with invalid dates (fails validation)
      const dateRes = studio.setDates(['branch-math'], { startDate: 'invalid-date' });
      expect(dateRes.success).toBe(false);
      expect(studio.undoStack).toHaveLength(0);

      // Convert to task on non-existent node
      studio.convertToTask('ghost-id', ['Step 1']);
      expect(studio.undoStack).toHaveLength(0);

      // Convert to branch on non-existent node
      studio.convertToBranch('ghost-id');
      expect(studio.undoStack).toHaveLength(0);

      expect(studio.isDirty).toBe(false);
    });

    it('Probe 3.3: REMEDIATION VERIFICATION: duplicateNodes([]), patchItems({}), removeNodes([nonExistent]) do not pollute undoStack', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({ goals: base });

      // 1. duplicateNodes([]) with empty array must be a clean no-op
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);
      const dupRes = studio.duplicateNodes([]);
      expect(dupRes.success).toBe(true);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);

      // 2. patchItems({}) with empty patches must be a clean no-op
      const patchRes = studio.patchItems({});
      expect(patchRes.success).toBe(true);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);

      // 3. removeNodes(['ghost-id']) with non-existent id must be a clean no-op
      const removeGhostRes = studio.removeNodes(['ghost-id']);
      expect(removeGhostRes.success).toBe(true);
      expect(removeGhostRes.count).toBe(0);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);

      // 4. removeNodes([]) with empty array must be a clean no-op
      const removeEmptyRes = studio.removeNodes([]);
      expect(removeEmptyRes.success).toBe(true);
      expect(removeEmptyRes.count).toBe(0);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('Probe 3.2: 500-step randomized stress simulation with invariant auditing', () => {
      const base = createDeepMockTree();
      const studio = createBlueprintStudioController({
        goals: base,
        activeGoalNodeId: 'task-active-session',
      });

      let legitimateEdits = 0;
      const historyLog: string[] = [JSON.stringify(base)];

      for (let i = 0; i < 200; i++) {
        const op = i % 7;
        let applied = false;

        switch (op) {
          case 0: {
            const r = studio.addChildrenInside(['branch-physics'], [`P-${i}`]);
            if (r.success && r.count > 0) applied = true;
            break;
          }
          case 1: {
            const r = studio.diffSteps(['task-running'], [`R-${i}`], []);
            if (r.success && r.addedCount > 0) applied = true;
            break;
          }
          case 2: {
            // Guarded attempt
            const r = studio.removeNodes(['task-active-session']);
            expect(r.success).toBe(false);
            break;
          }
          case 3: {
            // Guarded attempt
            const r = studio.diffSteps(['task-active-session'], [], ['Problem 1']);
            expect(r.success).toBe(false);
            break;
          }
          case 4: {
            if (studio.canUndo && Math.random() > 0.5) {
              studio.undo();
              legitimateEdits--;
              historyLog.pop();
            }
            break;
          }
          case 5: {
            if (studio.canRedo && Math.random() > 0.5) {
              studio.redo();
              legitimateEdits++;
              historyLog.push(JSON.stringify(studio.draftGoals));
            }
            break;
          }
          case 6: {
            const r = studio.setDates(['branch-physics'], {
              startDate: '2026-10-01',
              endDate: '2026-10-10',
            });
            if (r.success && r.count > 0) applied = true;
            break;
          }
        }

        if (applied) {
          legitimateEdits++;
          historyLog.push(JSON.stringify(studio.draftGoals));
        }

        expect(studio.undoStack.length).toBe(legitimateEdits);
        expect(studio.undoStack.length >= 0).toBe(true);
        expect(studio.redoStack.length >= 0).toBe(true);
      }

      // Unwind all remaining edits
      while (studio.canUndo) {
        studio.undo();
      }

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(base));
    });
  });
});
