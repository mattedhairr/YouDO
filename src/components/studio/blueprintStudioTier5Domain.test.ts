import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../../types';
import {
  addBlueprintChildrenBulk,
  closestBlueprintPathIds,
  collectBlueprintStepsSummary,
  convertNodeToBranch,
  convertNodeToTask,
  countBlueprintNodes,
  diffBlueprintSteps,
  findBlueprintPath,
  isValidISODate,
  maxBlueprintDepth,
  numberedBlueprintTitles,
  removeBlueprintNodes,
  setGoalDatesBulk,
  validateGoalDates,
} from '../../lib/blueprintStudio';
import {
  canMoveStudioItems,
  moveStudioItems,
  patchStudioItems,
  reorderStudioItems,
} from '../../lib/studioWorkspace';
import { createBlueprintStudioController } from './blueprintStudioState';
import { findGoal } from '../../lib/goalTree';

/** Helper to deep freeze an object graph to enforce pure immutability */
function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}

/** Helper to construct a deep linear tree of specified depth */
function buildDeepChain(depth: number, idPrefix = 'chain'): GoalNode[] {
  let leaf: GoalNode = {
    id: `${idPrefix}-${depth}`,
    kind: 'node',
    title: `Level ${depth}`,
    children: [],
    completed: false,
    createdAt: 1000 + depth,
    steps: ['Initial Step'],
    stepDone: [false],
  };

  for (let d = depth - 1; d >= 2; d--) {
    leaf = {
      id: `${idPrefix}-${d}`,
      kind: 'node',
      title: `Level ${d}`,
      children: [leaf],
      completed: false,
      createdAt: 1000 + d,
    };
  }

  const root: GoalNode = {
    id: `${idPrefix}-1`,
    kind: 'goal',
    title: 'Root Goal',
    children: [leaf],
    completed: false,
    createdAt: 1001,
  };

  return [root];
}

/** Helper to construct a multi-branch test fixture */
function createFixtureTree(): GoalNode[] {
  return [
    {
      id: 'root-alpha',
      kind: 'goal',
      title: 'Master Quantum Physics',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-foundations',
          kind: 'node',
          title: 'Quantum Foundations',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-wavemechanics',
              kind: 'node',
              title: 'Wave Mechanics',
              completed: false,
              createdAt: 1020,
              steps: ['Schrodinger equation', 'Wave packet dispersion', 'Infinite square well'],
              stepDone: [true, false, false],
              children: [],
            },
            {
              id: 'task-operators',
              kind: 'node',
              title: 'Hilbert Space & Operators',
              completed: false,
              createdAt: 1030,
              steps: ['Hermitian operators', 'Commutation relations'],
              stepDone: [true, true],
              children: [],
            },
          ],
        },
        {
          id: 'branch-applications',
          kind: 'node',
          title: 'Quantum Applications',
          completed: false,
          createdAt: 1040,
          children: [
            {
              id: 'task-computing',
              kind: 'node',
              title: 'Quantum Computing Basics',
              completed: false,
              createdAt: 1050,
              steps: ['Qubits & Bloch Sphere', 'Bell States'],
              stepDone: [false, false],
              children: [],
            },
            {
              id: 'leaf-empty',
              kind: 'node',
              title: 'Quantum Cryptography',
              completed: false,
              createdAt: 1060,
              children: [],
            },
          ],
        },
      ],
    },
  ];
}

describe('Tier 5 Adversarial Hardening — Domain Logic & State Controller', () => {
  describe('1. Deep Tree Mutations, Circular Reference Guards, and Ghost/Empty Targets', () => {
    it('1.1 should prevent circular references: self-move and descendant-move', () => {
      const tree = createFixtureTree();

      // Attempt self-move
      expect(canMoveStudioItems(tree, ['branch-foundations'], 'branch-foundations')).toBe(false);
      const afterSelfMove = moveStudioItems(tree, ['branch-foundations'], 'branch-foundations');
      expect(afterSelfMove).toEqual(tree);

      // Attempt move into immediate child
      expect(canMoveStudioItems(tree, ['branch-foundations'], 'task-wavemechanics')).toBe(false);
      const afterChildMove = moveStudioItems(tree, ['branch-foundations'], 'task-wavemechanics');
      expect(afterChildMove).toEqual(tree);

      // Attempt move of root into deep descendant
      expect(canMoveStudioItems(tree, ['root-alpha'], 'task-wavemechanics')).toBe(false);
      expect(moveStudioItems(tree, ['root-alpha'], 'task-wavemechanics')).toEqual(tree);

      // Attempt move into current parent (already there)
      expect(canMoveStudioItems(tree, ['task-wavemechanics'], 'branch-foundations')).toBe(false);
    });

    it('1.2 should prevent circular references across deep recursive chains (depth > 20)', () => {
      const deepChain = buildDeepChain(25, 'deep');

      // Attempt moving level 3 into level 20
      expect(canMoveStudioItems(deepChain, ['deep-3'], 'deep-20')).toBe(false);
      expect(moveStudioItems(deepChain, ['deep-3'], 'deep-20')).toEqual(deepChain);

      // Attempt moving level 10 into level 25 (the deepest leaf)
      expect(canMoveStudioItems(deepChain, ['deep-10'], 'deep-25')).toBe(false);
      expect(moveStudioItems(deepChain, ['deep-10'], 'deep-25')).toEqual(deepChain);
    });

    it('1.3 should safely handle empty, ghost, and nonexistent target arrays across domain operations', () => {
      const tree = createFixtureTree();

      // addBlueprintChildrenBulk with empty or ghost parentIds
      expect(addBlueprintChildrenBulk(tree, [], ['New Node'])).toEqual({ goals: tree, count: 0, createdIds: [] });
      expect(addBlueprintChildrenBulk(tree, ['ghost-p1', 'ghost-p2'], ['New Node'])).toEqual({
        goals: tree,
        count: 0,
        createdIds: [],
      });

      // addBlueprintChildrenBulk with mixed valid and ghost parentIds
      const mixedBulk = addBlueprintChildrenBulk(tree, ['ghost-p1', 'branch-applications'], ['Quantum Teleportation']);
      expect(mixedBulk.count).toBe(1);
      expect(mixedBulk.createdIds).toHaveLength(1);
      const updatedBranch = findGoal(mixedBulk.goals, 'branch-applications');
      expect(updatedBranch?.children.some((c) => c.title === 'Quantum Teleportation')).toBe(true);

      // diffBlueprintSteps with empty or ghost targets
      expect(diffBlueprintSteps(tree, [], ['Step A'], ['Step B'])).toEqual({
        goals: tree,
        affectedCount: 0,
        addedCount: 0,
        removedCount: 0,
        protectedCompletedCount: 0,
        protectedCount: 0,
      });
      expect(diffBlueprintSteps(tree, ['ghost-1', 'ghost-2'], ['Step A'], ['Step B'])).toEqual({
        goals: tree,
        affectedCount: 0,
        addedCount: 0,
        removedCount: 0,
        protectedCompletedCount: 0,
        protectedCount: 0,
      });

      // setGoalDatesBulk with empty or ghost targets
      expect(setGoalDatesBulk(tree, [], { startDate: '2026-05-01' })).toEqual({
        goals: tree,
        count: 0,
        adjustedCount: 0,
      });
      expect(setGoalDatesBulk(tree, ['ghost-1'], { startDate: '2026-05-01' })).toEqual({
        goals: tree,
        count: 0,
        adjustedCount: 0,
      });

      // removeBlueprintNodes with empty or ghost targets
      expect(removeBlueprintNodes(tree, [])).toBe(tree);
      expect(removeBlueprintNodes(tree, ['ghost-1', 'ghost-2'])).toEqual(tree);
    });

    it('1.4 should maintain depth and count invariants on deep recursive scaling (depth 35)', () => {
      const deepChain = buildDeepChain(35, 'scale');

      expect(maxBlueprintDepth(deepChain)).toBe(35);
      expect(countBlueprintNodes(deepChain)).toBe(35);

      const path = findBlueprintPath(deepChain, 'scale-35');
      expect(path).toHaveLength(35);
      expect(path[0].id).toBe('scale-1');
      expect(path[34].id).toBe('scale-35');

      // closestBlueprintPathIds with intermediate ghost IDs
      const closest = closestBlueprintPathIds(deepChain, ['scale-1', 'ghost-mid', 'scale-20', 'ghost-tail']);
      expect(closest).toHaveLength(20);
      expect(closest[closest.length - 1]).toBe('scale-20');

      // Add child at deepest level
      const addedDeep = addBlueprintChildrenBulk(deepChain, ['scale-35'], ['Sub-level 36']);
      expect(addedDeep.count).toBe(1);
      expect(maxBlueprintDepth(addedDeep.goals)).toBe(36);
      expect(countBlueprintNodes(addedDeep.goals)).toBe(36);

      // Prune intermediate subtree at level 15
      const pruned = removeBlueprintNodes(deepChain, ['scale-15']);
      expect(maxBlueprintDepth(pruned)).toBe(14);
      expect(countBlueprintNodes(pruned)).toBe(14);
    });

    it('1.5 should handle high-fanout bulk operations (50 children per parent)', () => {
      const tree = createFixtureTree();
      const parentId = 'branch-foundations';
      const titles = numberedBlueprintTitles('Experiment', 1, 50);

      const res = addBlueprintChildrenBulk(tree, [parentId], titles);
      expect(res.count).toBe(50);
      expect(res.createdIds).toHaveLength(50);

      const uniqueIds = new Set(res.createdIds);
      expect(uniqueIds.size).toBe(50);

      const parent = findGoal(res.goals, parentId);
      expect(parent?.children).toHaveLength(52); // 2 existing + 50 new
    });
  });

  describe('2. Set-Union / Set-Difference Step Diffing (Edge Cases & Invariants)', () => {
    it('2.1 should handle whitespace variations, case insensitivity, and deduplication chaos', () => {
      const tree = createFixtureTree();
      const targetIds = ['task-wavemechanics'];

      // Chaotic additions: mixed whitespace, tabs, newlines, duplicate casings
      const rawAdditions = [
        '  \tWave packet dispersion   ', // already exists
        'wave packet dispersion', // duplicate of existing
        '  Phase Velocity  ',
        'phase velocity', // duplicate in input
        'PHASE   VELOCITY', // duplicate after whitespace normalization
        'Group Velocity\n',
        '   ', // blank should be ignored
      ];

      const diffResult = diffBlueprintSteps(tree, targetIds, rawAdditions, []);
      // Existing steps: ['Schrodinger equation', 'Wave packet dispersion', 'Infinite square well']
      // 'Wave packet dispersion' is skipped.
      // 'Phase Velocity' is added once.
      // 'Group Velocity' is added once.
      expect(diffResult.addedCount).toBe(2);
      expect(diffResult.affectedCount).toBe(1);

      const target = findGoal(diffResult.goals, 'task-wavemechanics');
      expect(target?.steps).toEqual([
        'Schrodinger equation',
        'Wave packet dispersion',
        'Infinite square well',
        'Phase Velocity',
        'Group Velocity',
      ]);
      expect(target?.stepDone).toEqual([true, false, false, false, false]);

      // Chaotic removals: matching regardless of case and spacing
      const rawRemovals = [
        '  SCHRODINGER   EQUATION  ', // completed -> protected by default!
        'phase velocity', // added step -> should be removed
        '   UNKNOWN STEP   ', // non-existent -> silent skip
      ];

      const diff2 = diffBlueprintSteps(diffResult.goals, targetIds, [], rawRemovals, {
        forceRemoveCompleted: false,
      });
      expect(diff2.removedCount).toBe(1); // 'Phase Velocity' removed
      expect(diff2.protectedCompletedCount).toBe(1); // 'Schrodinger equation' protected!

      const target2 = findGoal(diff2.goals, 'task-wavemechanics');
      expect(target2?.steps).toEqual([
        'Schrodinger equation',
        'Wave packet dispersion',
        'Infinite square well',
        'Group Velocity',
      ]);
      expect(target2?.stepDone).toEqual([true, false, false, false]);
    });

    it('2.2 should preserve and remove punctuation, unicode, markdown, and emoji steps', () => {
      const tree = createFixtureTree();
      const targetIds = ['task-wavemechanics'];

      const exoticSteps = [
        '🚀 Quantum Entanglement (2.0)',
        'E = mc² & ℏ / 2',
        'Test: "Double-Slit" <Interference>',
        'State |ψ⟩ = α|0⟩ + β|1⟩',
      ];

      const res1 = diffBlueprintSteps(tree, targetIds, exoticSteps, []);
      expect(res1.addedCount).toBe(4);

      const target = findGoal(res1.goals, 'task-wavemechanics');
      expect(target?.steps).toEqual(expect.arrayContaining(exoticSteps));

      // Remove with slightly varied casing
      const res2 = diffBlueprintSteps(res1.goals, targetIds, [], [
        '🚀 quantum entanglement (2.0)',
        'State |ψ⟩ = α|0⟩ + β|1⟩',
      ]);
      expect(res2.removedCount).toBe(2);

      const target2 = findGoal(res2.goals, 'task-wavemechanics');
      expect(target2?.steps).not.toContain('🚀 Quantum Entanglement (2.0)');
      expect(target2?.steps).not.toContain('State |ψ⟩ = α|0⟩ + β|1⟩');
      expect(target2?.steps).toContain('E = mc² & ℏ / 2');
      expect(target2?.steps).toContain('Test: "Double-Slit" <Interference>');
    });

    it('2.3 should protect heterogeneous non-endpoint nodes (roots and branch containers)', () => {
      const tree = createFixtureTree();
      // Target mixed nodes: root goal, branch folder, endpoint task, empty leaf, ghost ID
      const targets = [
        'root-alpha', // Root Goal -> must be protected
        'branch-foundations', // Branch container -> must be protected
        'task-wavemechanics', // Endpoint task -> eligible
        'leaf-empty', // Empty endpoint leaf -> eligible
        'ghost-node-999', // Ghost -> ignored
      ];

      const res = diffBlueprintSteps(tree, targets, ['Universal Checklist Item'], []);
      expect(res.affectedCount).toBe(2); // Only task-wavemechanics and leaf-empty
      expect(res.addedCount).toBe(2);

      const root = findGoal(res.goals, 'root-alpha');
      expect(root?.steps).toBeUndefined();

      const branch = findGoal(res.goals, 'branch-foundations');
      expect(branch?.steps).toBeUndefined();

      const task = findGoal(res.goals, 'task-wavemechanics');
      expect(task?.steps).toContain('Universal Checklist Item');

      const leaf = findGoal(res.goals, 'leaf-empty');
      expect(leaf?.steps).toEqual(['Universal Checklist Item']);
      expect(leaf?.stepDone).toEqual([false]);
    });

    it('2.4 should enforce completion state rollup transitions during step additions and removals', () => {
      const tree = createFixtureTree();
      // task-operators initially has 2 steps: ['Hermitian operators', 'Commutation relations'], both done!
      const initialTask = findGoal(tree, 'task-operators')!;
      expect(initialTask.stepDone).toEqual([true, true]);

      // Add a 3rd step -> task completion state must become false
      const stepAdded = diffBlueprintSteps(tree, ['task-operators'], ['Uncertainty principle'], []);
      const taskAfterAdd = findGoal(stepAdded.goals, 'task-operators')!;
      expect(taskAfterAdd.steps).toHaveLength(3);
      expect(taskAfterAdd.stepDone).toEqual([true, true, false]);
      expect(taskAfterAdd.completed).toBe(false);

      // Remove the newly added undone step -> task completion state must become true again
      const stepRemoved = diffBlueprintSteps(stepAdded.goals, ['task-operators'], [], ['Uncertainty principle']);
      const taskAfterRemove = findGoal(stepRemoved.goals, 'task-operators')!;
      expect(taskAfterRemove.steps).toHaveLength(2);
      expect(taskAfterRemove.stepDone).toEqual([true, true]);
      expect(taskAfterRemove.completed).toBe(true);

      // Force-remove all steps -> task has 0 steps, completed is false
      const forceAll = diffBlueprintSteps(
        stepRemoved.goals,
        ['task-operators'],
        [],
        ['Hermitian operators', 'Commutation relations'],
        { forceRemoveCompleted: true },
      );
      const emptyTask = findGoal(forceAll.goals, 'task-operators')!;
      expect(emptyTask.steps).toEqual([]);
      expect(emptyTask.stepDone).toEqual([]);
      expect(emptyTask.completed).toBe(false);
    });

    it('2.5 should correctly aggregate summary statistics via collectBlueprintStepsSummary', () => {
      const tree = createFixtureTree();
      // Eligible nodes: task-wavemechanics, task-operators, task-computing, leaf-empty
      const targetIds = ['task-wavemechanics', 'task-operators', 'root-alpha', 'branch-foundations'];

      const summary = collectBlueprintStepsSummary(tree, targetIds);
      // Only task-wavemechanics and task-operators are eligible endpoints
      expect(summary.totalEligibleNodes).toBe(2);

      const items = summary.items;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((it) => it.totalNodes === 2)).toBe(true);

      // Both tasks have distinct steps, none are universal across both
      expect(items.every((it) => it.isUniversal === false)).toBe(true);

      // Add common step to both
      const commonAdded = diffBlueprintSteps(tree, ['task-wavemechanics', 'task-operators'], ['Lab Report'], []);
      const summary2 = collectBlueprintStepsSummary(commonAdded.goals, ['task-wavemechanics', 'task-operators']);
      const labReport = summary2.items.find((it) => it.key === 'lab report');
      expect(labReport).toBeDefined();
      expect(labReport?.isUniversal).toBe(true);
      expect(labReport?.occurrences).toBe(2);
    });
  });

  describe('3. Undo / Redo Branching, Stacks, and History Invariants', () => {
    it('3.1 should properly fork history when applying actions mid-stack (clearing redo branch)', () => {
      const controller = createBlueprintStudioController({
        goals: createFixtureTree(),
      });

      expect(controller.undoStack).toHaveLength(0);
      expect(controller.redoStack).toHaveLength(0);

      // Action 1: Add children
      controller.addChildrenInside(['branch-foundations'], ['Child One']);
      expect(controller.undoStack).toHaveLength(1);
      expect(controller.redoStack).toHaveLength(0);

      // Action 2: Set dates
      controller.setDates(['task-wavemechanics'], { startDate: '2026-06-01', endDate: '2026-06-10' });
      expect(controller.undoStack).toHaveLength(2);

      // Action 3: Add step
      controller.diffSteps(['task-wavemechanics'], ['Mid-stack step'], []);
      expect(controller.undoStack).toHaveLength(3);

      // Undo back 2 steps -> to Action 1
      expect(controller.undo()).toBe(true);
      expect(controller.undo()).toBe(true);
      expect(controller.undoStack).toHaveLength(1);
      expect(controller.redoStack).toHaveLength(2);

      // Now apply Action 4 (forking branch)
      controller.addChildrenInside(['branch-foundations'], ['Forked Child Two']);

      // Redo stack MUST be completely cleared
      expect(controller.redoStack).toHaveLength(0);
      expect(controller.canRedo).toBe(false);
      expect(controller.undoStack).toHaveLength(2);

      // Draft goals must reflect Action 1 + Action 4, but NOT Action 2 or 3
      const branch = findGoal(controller.draftGoals, 'branch-foundations')!;
      expect(branch.children.some((c) => c.title === 'Child One')).toBe(true);
      expect(branch.children.some((c) => c.title === 'Forked Child Two')).toBe(true);

      const task = findGoal(controller.draftGoals, 'task-wavemechanics')!;
      expect(task.steps).not.toContain('Mid-stack step');
      expect(task.startDate).toBeUndefined();
    });

    it('3.2 should cleanly handle stack boundary zero and boundary end without errors', () => {
      const controller = createBlueprintStudioController({
        goals: createFixtureTree(),
      });

      // Boundary Zero: Empty undo stack
      expect(controller.canUndo).toBe(false);
      expect(controller.undo()).toBe(false);
      expect(controller.undo()).toBe(false);
      expect(controller.undoStack).toEqual([]);

      // Boundary End: Empty redo stack
      expect(controller.canRedo).toBe(false);
      expect(controller.redo()).toBe(false);
      expect(controller.redo()).toBe(false);
      expect(controller.redoStack).toEqual([]);

      // Single action cycle
      controller.addChildrenInside(['branch-foundations'], ['Node A']);
      expect(controller.canUndo).toBe(true);
      expect(controller.canRedo).toBe(false);

      // Redo at boundary top returns false
      expect(controller.redo()).toBe(false);

      // Undo to bottom
      expect(controller.undo()).toBe(true);
      expect(controller.canUndo).toBe(false);
      expect(controller.canRedo).toBe(true);

      // Repeated undo at bottom returns false
      expect(controller.undo()).toBe(false);
      expect(controller.undo()).toBe(false);

      // Redo to top
      expect(controller.redo()).toBe(true);
      expect(controller.canUndo).toBe(true);
      expect(controller.canRedo).toBe(false);

      // Repeated redo at top returns false
      expect(controller.redo()).toBe(false);
      expect(controller.redo()).toBe(false);
    });

    it('3.3 should accurately track isDirty across full undo/redo cycles', () => {
      const tree = createFixtureTree();
      const controller = createBlueprintStudioController({ goals: tree });

      expect(controller.isDirty).toBe(false);

      controller.addChildrenInside(['branch-foundations'], ['Dirty Check Child']);
      expect(controller.isDirty).toBe(true);

      controller.undo();
      expect(controller.isDirty).toBe(false);

      controller.redo();
      expect(controller.isDirty).toBe(true);

      controller.undo();
      expect(controller.isDirty).toBe(false);

      // Reset controller
      controller.reset();
      expect(controller.isDirty).toBe(false);
      expect(controller.undoStack).toEqual([]);
      expect(controller.redoStack).toEqual([]);
    });

    it('3.4 should not pollute undo stack when operations are no-ops or blocked', () => {
      const tree = createFixtureTree();
      const controller = createBlueprintStudioController({ goals: tree });

      // No-op bulk add with empty titles
      controller.addChildrenInside(['branch-foundations'], []);
      expect(controller.undoStack).toHaveLength(0);

      // No-op step diff with non-existent steps
      controller.diffSteps(['task-wavemechanics'], [], []);
      expect(controller.undoStack).toHaveLength(0);

      // Invalid date format
      const dateRes = controller.setDates(['task-wavemechanics'], { startDate: 'invalid-date' });
      expect(dateRes.success).toBe(false);
      expect(controller.undoStack).toHaveLength(0);
      expect(controller.errorMessage).toBeDefined();

      // Clear error message
      controller.clearMessages();
      expect(controller.errorMessage).toBeNull();
    });
  });

  describe('4. Date Manipulation (Leap Years, Boundaries, Conflicts & Range Rules)', () => {
    it('4.1 should strictly validate calendar rules including leap years and month boundaries', () => {
      // Leap year valid cases
      expect(isValidISODate('2024-02-29')).toBe(true); // divisible by 4
      expect(isValidISODate('2000-02-29')).toBe(true); // divisible by 400

      // Non-leap year century cases
      expect(isValidISODate('1900-02-29')).toBe(false); // divisible by 100, not 400
      expect(isValidISODate('2100-02-29')).toBe(false); // divisible by 100, not 400
      expect(isValidISODate('2023-02-29')).toBe(false);
      expect(isValidISODate('2025-02-29')).toBe(false);
      expect(isValidISODate('2024-02-30')).toBe(false);

      // 30-day month boundaries
      expect(isValidISODate('2026-04-30')).toBe(true);
      expect(isValidISODate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidISODate('2026-06-30')).toBe(true);
      expect(isValidISODate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidISODate('2026-09-30')).toBe(true);
      expect(isValidISODate('2026-09-31')).toBe(false); // September has 30 days
      expect(isValidISODate('2026-11-30')).toBe(true);
      expect(isValidISODate('2026-11-31')).toBe(false); // November has 30 days

      // 31-day month boundaries
      expect(isValidISODate('2026-01-31')).toBe(true);
      expect(isValidISODate('2026-03-31')).toBe(true);
      expect(isValidISODate('2026-05-31')).toBe(true);
      expect(isValidISODate('2026-07-31')).toBe(true);
      expect(isValidISODate('2026-08-31')).toBe(true);
      expect(isValidISODate('2026-10-31')).toBe(true);
      expect(isValidISODate('2026-12-31')).toBe(true);

      // Month and day bounds
      expect(isValidISODate('2026-00-15')).toBe(false);
      expect(isValidISODate('2026-13-15')).toBe(false);
      expect(isValidISODate('2026-05-00')).toBe(false);
      expect(isValidISODate('2026-05-32')).toBe(false);

      // Malformed / Non-string
      expect(isValidISODate('2026/05/15')).toBe(false);
      expect(isValidISODate('15-05-2026')).toBe(false);
      expect(isValidISODate('2026-5-15')).toBe(false);
      expect(isValidISODate('2026-05-15T00:00:00Z')).toBe(false);
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate(null)).toBe(false);
      expect(isValidISODate(undefined)).toBe(false);
      expect(isValidISODate(12345)).toBe(false);
      expect(isValidISODate({})).toBe(false);
    });

    it('4.2 should enforce startDate <= endDate range invariant and reject reversed dates', () => {
      expect(validateGoalDates({ startDate: '2026-05-10', endDate: '2026-05-20' }).valid).toBe(true);
      expect(validateGoalDates({ startDate: '2026-05-10', endDate: '2026-05-10' }).valid).toBe(true); // single day

      const invalid = validateGoalDates({ startDate: '2026-05-20', endDate: '2026-05-10' });
      expect(invalid.valid).toBe(false);
      expect(invalid.error).toContain('cannot be after');

      expect(validateGoalDates({ clearAll: true }).valid).toBe(true);
    });

    it('4.3 should execute conflict resolution policies on partial date changes: clear, clamp, skip', () => {
      const tree = createFixtureTree();
      // Step 1: Set initial date range on task-wavemechanics: 2026-06-10 to 2026-06-20
      const initialSet = setGoalDatesBulk(tree, ['task-wavemechanics'], {
        startDate: '2026-06-10',
        endDate: '2026-06-20',
      });
      expect(initialSet.count).toBe(1);

      // Case A: Policy 'clear' (default)
      // Set new startDate to 2026-06-25 (which is after existing endDate 2026-06-20)
      const clearRes = setGoalDatesBulk(
        initialSet.goals,
        ['task-wavemechanics'],
        { startDate: '2026-06-25' },
        { conflictResolution: 'clear' },
      );
      expect(clearRes.adjustedCount).toBe(1);
      const clearNode = findGoal(clearRes.goals, 'task-wavemechanics')!;
      expect(clearNode.startDate).toBe('2026-06-25');
      expect(clearNode.endDate).toBeUndefined(); // Conflicting endDate was cleared

      // Case B: Policy 'clamp'
      // Set new startDate to 2026-06-25 on initial node -> clamps endDate to 2026-06-25
      const clampRes = setGoalDatesBulk(
        initialSet.goals,
        ['task-wavemechanics'],
        { startDate: '2026-06-25' },
        { conflictResolution: 'clamp' },
      );
      expect(clampRes.adjustedCount).toBe(1);
      const clampNode = findGoal(clampRes.goals, 'task-wavemechanics')!;
      expect(clampNode.startDate).toBe('2026-06-25');
      expect(clampNode.endDate).toBe('2026-06-25'); // Clamped

      // Case C: Policy 'skip'
      // Set new startDate to 2026-06-25 on initial node -> skipped
      const skipRes = setGoalDatesBulk(
        initialSet.goals,
        ['task-wavemechanics'],
        { startDate: '2026-06-25' },
        { conflictResolution: 'skip' },
      );
      expect(skipRes.count).toBe(0);
      const skipNode = findGoal(skipRes.goals, 'task-wavemechanics')!;
      expect(skipNode.startDate).toBe('2026-06-10');
      expect(skipNode.endDate).toBe('2026-06-20'); // Unchanged
    });

    it('4.4 should support bulk clearing dates and clearing specific bounds', () => {
      const tree = createFixtureTree();
      const dated = setGoalDatesBulk(tree, ['task-wavemechanics', 'task-operators'], {
        startDate: '2026-07-01',
        endDate: '2026-07-31',
      });
      expect(dated.count).toBe(2);

      // Clear only startDate
      const clearedStart = setGoalDatesBulk(dated.goals, ['task-wavemechanics'], {
        startDate: null,
      });
      const nodeStartCleared = findGoal(clearedStart.goals, 'task-wavemechanics')!;
      expect(nodeStartCleared.startDate).toBeUndefined();
      expect(nodeStartCleared.endDate).toBe('2026-07-31');

      // Clear all dates
      const clearedAll = setGoalDatesBulk(dated.goals, ['task-wavemechanics', 'task-operators'], {
        clearAll: true,
      });
      expect(clearedAll.count).toBe(2);
      for (const id of ['task-wavemechanics', 'task-operators']) {
        const node = findGoal(clearedAll.goals, id)!;
        expect(node.startDate).toBeUndefined();
        expect(node.endDate).toBeUndefined();
      }
    });
  });

  describe('5. Active Session Task Ancestor Protection Across Deep Recursive Levels', () => {
    it('5.1 should block deletion of any ancestor of active session task across deep recursive levels (depth 12)', () => {
      const deepTree = buildDeepChain(12, 'active');
      const activeTaskId = 'active-12';

      const controller = createBlueprintStudioController({
        goals: deepTree,
        activeGoalNodeId: activeTaskId,
      });

      // Attempt to delete Root (active-1) -> MUST BE BLOCKED
      const delRoot = controller.removeNodes(['active-1']);
      expect(delRoot.success).toBe(false);
      expect(delRoot.error).toContain('Cannot delete active session task or its container');
      expect(controller.draftGoals).toEqual(deepTree);

      // Attempt to delete intermediate ancestor (active-6) -> MUST BE BLOCKED
      const delMid = controller.removeNodes(['active-6']);
      expect(delMid.success).toBe(false);
      expect(delMid.error).toContain('Cannot delete active session task or its container');

      // Attempt to delete active task directly (active-12) -> MUST BE BLOCKED
      const delDirect = controller.removeNodes(['active-12']);
      expect(delDirect.success).toBe(false);
      expect(delDirect.error).toContain('Cannot delete active session task or its container');

      // Now add a sibling branch at level 3 and verify IT CAN BE DELETED
      controller.addChildrenInside(['active-2'], ['Independent Branch']);
      const indepNode = controller.draftGoals[0].children[0].children.find((c) => c.title === 'Independent Branch')!;
      expect(indepNode).toBeDefined();

      const delIndep = controller.removeNodes([indepNode.id]);
      expect(delIndep.success).toBe(true);
      expect(delIndep.count).toBe(1);
    });

    it('5.2 should block mutation operations on active session task (conversion, child addition, step removal)', () => {
      const tree = createFixtureTree();
      const activeId = 'task-wavemechanics';
      const controller = createBlueprintStudioController({
        goals: tree,
        activeGoalNodeId: activeId,
      });

      // 1. Cannot add children inside active session task
      const addRes = controller.addChildrenInside([activeId], ['New Child']);
      expect(addRes.success).toBe(false);
      expect(addRes.error).toContain('Cannot convert active session task by adding children inside');

      // 2. Cannot convert active session task to branch
      const convBranch = controller.convertToBranch(activeId);
      expect(convBranch.success).toBe(false);
      expect(convBranch.error).toContain('Cannot convert active session task to branch');

      // 3. Cannot convert active session task to task
      const convTask = controller.convertToTask(activeId);
      expect(convTask.success).toBe(false);
      expect(convTask.error).toContain('Cannot convert active session task');

      // 4. Cannot remove steps from active session task
      const diffDel = controller.diffSteps([activeId], [], ['Wave packet dispersion']);
      expect(diffDel.success).toBe(false);
      expect(diffDel.error).toContain('Cannot delete steps from active session task');

      // 5. CAN add steps to active session task (adding is non-destructive)
      const diffAdd = controller.diffSteps([activeId], ['Non-destructive addition'], []);
      expect(diffAdd.success).toBe(true);
      const activeNode = findGoal(controller.draftGoals, activeId)!;
      expect(activeNode.steps).toContain('Non-destructive addition');

      // 6. CAN add children inside ANCESTOR of active session task (adds sibling branch)
      const addSibling = controller.addChildrenInside(['branch-foundations'], ['New Sibling Branch']);
      expect(addSibling.success).toBe(true);
    });

    it('5.3 should gracefully handle stale or nonexistent activeGoalNodeId without blocking valid actions', () => {
      const tree = createFixtureTree();
      const controller = createBlueprintStudioController({
        goals: tree,
        activeGoalNodeId: 'nonexistent-ghost-task',
      });

      // Deleting existing nodes should NOT be falsely blocked by stale activeId
      const delRes = controller.removeNodes(['leaf-empty']);
      expect(delRes.success).toBe(true);
      expect(findGoal(controller.draftGoals, 'leaf-empty')).toBeNull();

      // Dynamic switching of activeGoalNodeId
      controller.setActiveGoalNodeId('task-wavemechanics');
      expect(controller.activeGoalNodeId).toBe('task-wavemechanics');

      const blockedDel = controller.removeNodes(['task-wavemechanics']);
      expect(blockedDel.success).toBe(false);
    });
  });

  describe('6. Sibling Deduplication, Reordering, and Immutability Audit', () => {
    it('6.1 should deduplicate sibling titles case-insensitively and normalize spaces', () => {
      const tree = createFixtureTree();
      const titles = [
        '  Special Relativity  ',
        'special relativity',
        'SPECIAL   RELATIVITY',
        'General Relativity',
      ];

      const res = addBlueprintChildrenBulk(tree, ['branch-foundations'], titles);
      expect(res.count).toBe(2); // 'Special Relativity' and 'General Relativity'

      const branch = findGoal(res.goals, 'branch-foundations')!;
      expect(branch.children.some((c) => c.title === 'Special Relativity')).toBe(true);
      expect(branch.children.some((c) => c.title === 'General Relativity')).toBe(true);

      // Attempting to add same title again
      const res2 = addBlueprintChildrenBulk(res.goals, ['branch-foundations'], ['general relativity']);
      expect(res2.count).toBe(0);
    });

    it('6.2 should respect boundary limits when reordering siblings up and down', () => {
      const tree = createFixtureTree();
      // branch-foundations has 2 children: [task-wavemechanics, task-operators]

      // Reorder top item up -> boundary: stays in place
      const reorderTopUp = reorderStudioItems(tree, ['task-wavemechanics'], 'up');
      const branch1 = findGoal(reorderTopUp, 'branch-foundations')!;
      expect(branch1.children.map((c) => c.id)).toEqual(['task-wavemechanics', 'task-operators']);

      // Reorder bottom item down -> boundary: stays in place
      const reorderBottomDown = reorderStudioItems(tree, ['task-operators'], 'down');
      const branch2 = findGoal(reorderBottomDown, 'branch-foundations')!;
      expect(branch2.children.map((c) => c.id)).toEqual(['task-wavemechanics', 'task-operators']);

      // Reorder top item down -> swaps order
      const reorderTopDown = reorderStudioItems(tree, ['task-wavemechanics'], 'down');
      const branch3 = findGoal(reorderTopDown, 'branch-foundations')!;
      expect(branch3.children.map((c) => c.id)).toEqual(['task-operators', 'task-wavemechanics']);

      // Reorder bottom item up -> restores order
      const reorderBottomUp = reorderStudioItems(reorderTopDown, ['task-wavemechanics'], 'up');
      const branch4 = findGoal(reorderBottomUp, 'branch-foundations')!;
      expect(branch4.children.map((c) => c.id)).toEqual(['task-wavemechanics', 'task-operators']);
    });

    it('6.3 should guarantee strict immutability (Object.freeze proof)', () => {
      const frozenTree = deepFreeze(createFixtureTree());

      // Verify that no pure domain operations throw mutation errors on frozen objects
      expect(() => {
        addBlueprintChildrenBulk(frozenTree, ['branch-foundations'], ['Frozen Child']);
      }).not.toThrow();

      expect(() => {
        diffBlueprintSteps(frozenTree, ['task-wavemechanics'], ['Frozen Step'], ['Infinite square well']);
      }).not.toThrow();

      expect(() => {
        setGoalDatesBulk(frozenTree, ['task-wavemechanics'], { startDate: '2026-08-01', endDate: '2026-08-15' });
      }).not.toThrow();

      expect(() => {
        convertNodeToBranch(frozenTree, 'leaf-empty', ['Branch Sub 1']);
      }).not.toThrow();

      expect(() => {
        convertNodeToTask(frozenTree, 'leaf-empty', ['Task Step 1']);
      }).not.toThrow();

      expect(() => {
        removeBlueprintNodes(frozenTree, ['task-computing']);
      }).not.toThrow();
    });

    it('6.4 should verify patchStudioItems sanitizes dates and prevents reversed ranges', () => {
      const tree = createFixtureTree();

      // Patch with invalid/reversed date range
      const patched = patchStudioItems(tree, {
        'task-wavemechanics': {
          startDate: '2026-09-20',
          endDate: '2026-09-10', // Reversed!
        },
      });

      // When reversed, patchStudioItems reverts to prior dates (which were undefined)
      const node = findGoal(patched, 'task-wavemechanics')!;
      expect(node.startDate).toBeUndefined();
      expect(node.endDate).toBeUndefined();

      // Patch with empty/whitespace title -> retains existing title
      const patchedTitle = patchStudioItems(tree, {
        'task-wavemechanics': { title: '   ' },
      });
      const nodeTitle = findGoal(patchedTitle, 'task-wavemechanics')!;
      expect(nodeTitle.title).toBe('Wave Mechanics');
    });
  });
});
