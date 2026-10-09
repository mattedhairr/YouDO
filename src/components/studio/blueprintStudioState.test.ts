import { describe, expect, it, vi } from 'vitest';
import type { GoalNode } from '../../types';
import {
  blueprintStudioReducer,
  createBlueprintStudioController,
  createBlueprintStudioState,
  initialBlueprintStudioState,
  type StudioModalType,
} from './blueprintStudioState';

function createSampleGoals(): GoalNode[] {
  return [
    {
      id: 'root-1',
      kind: 'goal',
      title: 'Master Calculus',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-1',
          kind: 'node',
          title: 'Differential Calculus',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-1',
              kind: 'node',
              title: 'Limits & Continuity',
              completed: false,
              createdAt: 1020,
              steps: ['Review epsilon-delta', 'Solve 10 problems', 'Check solutions'],
              stepDone: [true, false, false],
              children: [],
            },
            {
              id: 'task-2',
              kind: 'node',
              title: 'Derivative Rules',
              completed: false,
              createdAt: 1030,
              steps: ['Product rule', 'Chain rule'],
              stepDone: [false, false],
              children: [],
            },
          ],
        },
        {
          id: 'task-3',
          kind: 'node',
          title: 'Applications of Derivatives',
          completed: false,
          createdAt: 1040,
          steps: ['Optimization', 'Related rates'],
          stepDone: [false, false],
          children: [],
        },
      ],
    },
    {
      id: 'root-2',
      kind: 'goal',
      title: 'Learn Linear Algebra',
      completed: false,
      createdAt: 2000,
      children: [
        {
          id: 'task-4',
          kind: 'node',
          title: 'Vectors and Matrices',
          completed: false,
          createdAt: 2010,
          steps: ['Dot product', 'Cross product'],
          stepDone: [true, true],
          children: [],
        },
      ],
    },
  ];
}

describe('blueprintStudioState', () => {
  describe('Multi-Selection Management', () => {
    it('initializes with empty selection by default', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.selectedIds.size).toBe(0);
      expect(studio.isSelectionMode).toBe(false);
    });

    it('initializes with provided initialSelectedIds', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-1', 'task-2'],
      });

      expect(studio.selectedIds.has('task-1')).toBe(true);
      expect(studio.selectedIds.has('task-2')).toBe(true);
      expect(studio.selectedIds.size).toBe(2);
      expect(studio.isSelectionMode).toBe(true);
    });

    it('toggles selection on and off and updates isSelectionMode', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.toggleSelect('task-1');
      expect(studio.selectedIds.has('task-1')).toBe(true);
      expect(studio.selectedIds.size).toBe(1);
      expect(studio.isSelectionMode).toBe(true);

      studio.toggleSelect('task-2');
      expect(studio.selectedIds.has('task-1')).toBe(true);
      expect(studio.selectedIds.has('task-2')).toBe(true);
      expect(studio.selectedIds.size).toBe(2);

      studio.toggleSelect('task-1');
      expect(studio.selectedIds.has('task-1')).toBe(false);
      expect(studio.selectedIds.has('task-2')).toBe(true);
      expect(studio.selectedIds.size).toBe(1);
      expect(studio.isSelectionMode).toBe(true);

      studio.toggleSelect('task-2');
      expect(studio.selectedIds.size).toBe(0);
      expect(studio.isSelectionMode).toBe(false);
    });

    it('selectOnly sets selection to a single node and clears previous selections', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-1', 'task-2'],
      });

      studio.selectOnly('task-3');
      expect(studio.selectedIds.size).toBe(1);
      expect(studio.selectedIds.has('task-3')).toBe(true);
      expect(studio.selectedIds.has('task-1')).toBe(false);
      expect(studio.isSelectionMode).toBe(true);
    });

    it('clearSelection empties selection and resets isSelectionMode', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-1', 'task-2'],
      });

      studio.clearSelection();
      expect(studio.selectedIds.size).toBe(0);
      expect(studio.isSelectionMode).toBe(false);
    });

    it('selectAll selects all nodes across hierarchy', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.selectAll();
      expect(studio.selectedIds.size).toBe(7);
      expect(studio.selectedIds.has('root-1')).toBe(true);
      expect(studio.selectedIds.has('branch-1')).toBe(true);
      expect(studio.selectedIds.has('task-1')).toBe(true);
      expect(studio.selectedIds.has('task-2')).toBe(true);
      expect(studio.selectedIds.has('task-3')).toBe(true);
      expect(studio.selectedIds.has('root-2')).toBe(true);
      expect(studio.selectedIds.has('task-4')).toBe(true);
      expect(studio.isSelectionMode).toBe(true);
    });

    it('supports explicit setSelectionMode override', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.isSelectionMode).toBe(false);
      studio.setSelectionMode(true);
      expect(studio.isSelectionMode).toBe(true);

      studio.setSelectionMode(false);
      expect(studio.isSelectionMode).toBe(false);

      studio.setSelectionMode(null);
      expect(studio.isSelectionMode).toBe(false);
    });

    it('topSelectedIds filters out descendants when parent is selected', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      // Select parent branch-1 and its child task-1
      studio.toggleSelect('branch-1');
      studio.toggleSelect('task-1');

      const top = studio.topSelectedIds();
      expect(top).toEqual(['branch-1']);
      expect(top).not.toContain('task-1');
    });

    it('topSelectedIds keeps multiple siblings when parent is not selected', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.toggleSelect('task-1');
      studio.toggleSelect('task-2');

      const top = studio.topSelectedIds();
      expect(top).toHaveLength(2);
      expect(top).toContain('task-1');
      expect(top).toContain('task-2');
    });

    it('topSelectedIds returns root when root and all descendants are selected', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.toggleSelect('root-1');
      studio.toggleSelect('branch-1');
      studio.toggleSelect('task-1');
      studio.toggleSelect('task-2');
      studio.toggleSelect('task-3');

      const top = studio.topSelectedIds();
      expect(top).toEqual(['root-1']);
    });
  });

  describe('Active Sheet / Modal Management', () => {
    it('initializes with activeModal="none" and empty targetNodeIds', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.activeModal).toBe('none');
      expect(studio.targetNodeIds).toEqual([]);
    });

    it('opens modal with explicit targetIds', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.openModal('node_expansion', ['task-1']);
      expect(studio.activeModal).toBe('node_expansion');
      expect(studio.targetNodeIds).toEqual(['task-1']);

      studio.closeModal();
      expect(studio.activeModal).toBe('none');
      expect(studio.targetNodeIds).toEqual([]);
    });

    it('accepts single string id for openModal', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.openModal('bulk_add_inside', 'branch-1');
      expect(studio.activeModal).toBe('bulk_add_inside');
      expect(studio.targetNodeIds).toEqual(['branch-1']);
    });

    it('defaults targetNodeIds to topSelectedIds when targetIds is omitted', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.toggleSelect('branch-1');
      studio.toggleSelect('task-1'); // child of branch-1

      studio.openModal('bulk_step_diff');
      expect(studio.activeModal).toBe('bulk_step_diff');
      // Should filter out child task-1 and use topSelectedIds
      expect(studio.targetNodeIds).toEqual(['branch-1']);
    });

    it('defaults targetNodeIds to empty array when nothing is selected and targetIds is omitted', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.openModal('date_picker');
      expect(studio.activeModal).toBe('date_picker');
      expect(studio.targetNodeIds).toEqual([]);
    });

    it('openModal("none") acts as closeModal', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.openModal('ai_plan', ['root-1']);
      expect(studio.activeModal).toBe('ai_plan');

      studio.openModal('none');
      expect(studio.activeModal).toBe('none');
      expect(studio.targetNodeIds).toEqual([]);
    });

    it('supports all defined modal types', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const types: StudioModalType[] = [
        'node_expansion',
        'bulk_add_inside',
        'bulk_step_diff',
        'date_picker',
        'ai_plan',
      ];

      for (const modalType of types) {
        studio.openModal(modalType, ['task-1']);
        expect(studio.activeModal).toBe(modalType);
        expect(studio.targetNodeIds).toEqual(['task-1']);
      }
    });
  });

  describe('Draft History & Undo/Redo Stack', () => {
    it('initializes with empty undo and redo stacks and not dirty', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.canRedo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('applyChange pushes snapshot to undoStack and sets isDirty', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const modifiedGoals: GoalNode[] = [
        {
          ...goals[0],
          title: 'Master Advanced Calculus',
        },
        goals[1],
      ];

      studio.applyChange(modifiedGoals, 'Renamed goal');

      expect(studio.draftGoals[0].title).toBe('Master Advanced Calculus');
      expect(studio.undoStack).toHaveLength(1);
      expect(studio.undoStack[0][0].title).toBe('Master Calculus');
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(true);
      expect(studio.canRedo).toBe(false);
      expect(studio.isDirty).toBe(true);
      expect(studio.lastActionDescription).toBe('Renamed goal');
    });

    it('undo reverts to previous state and enables redo', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const modified: GoalNode[] = [{ ...goals[0], title: 'Mod 1' }, goals[1]];
      studio.applyChange(modified, 'Change 1');

      const undoResult = studio.undo();
      expect(undoResult).toBe(true);
      expect(studio.draftGoals[0].title).toBe('Master Calculus');
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.redoStack).toHaveLength(1);
      expect(studio.redoStack[0][0].title).toBe('Mod 1');
      expect(studio.canUndo).toBe(false);
      expect(studio.canRedo).toBe(true);
      expect(studio.isDirty).toBe(false);
    });

    it('redo reapplies undone change and updates stacks', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const modified: GoalNode[] = [{ ...goals[0], title: 'Mod 1' }, goals[1]];
      studio.applyChange(modified, 'Change 1');
      studio.undo();

      const redoResult = studio.redo();
      expect(redoResult).toBe(true);
      expect(studio.draftGoals[0].title).toBe('Mod 1');
      expect(studio.undoStack).toHaveLength(1);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(true);
      expect(studio.canRedo).toBe(false);
      expect(studio.isDirty).toBe(true);
    });

    it('handles multiple undo and redo steps with accurate isDirty tracking', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const step1: GoalNode[] = [{ ...goals[0], title: 'Step 1' }, goals[1]];
      const step2: GoalNode[] = [{ ...goals[0], title: 'Step 2' }, goals[1]];

      studio.applyChange(step1, 'First change');
      studio.applyChange(step2, 'Second change');

      expect(studio.undoStack).toHaveLength(2);
      expect(studio.draftGoals[0].title).toBe('Step 2');
      expect(studio.isDirty).toBe(true);

      // Undo step 2
      studio.undo();
      expect(studio.draftGoals[0].title).toBe('Step 1');
      expect(studio.isDirty).toBe(true); // still dirty relative to base

      // Undo step 1
      studio.undo();
      expect(studio.draftGoals[0].title).toBe('Master Calculus');
      expect(studio.isDirty).toBe(false); // back to base!

      // Redo step 1
      studio.redo();
      expect(studio.draftGoals[0].title).toBe('Step 1');
      expect(studio.isDirty).toBe(true);

      // Redo step 2
      studio.redo();
      expect(studio.draftGoals[0].title).toBe('Step 2');
      expect(studio.canRedo).toBe(false);
    });

    it('safely handles boundary conditions (empty undo/redo stack)', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.undo()).toBe(false);
      expect(studio.redo()).toBe(false);
      expect(studio.draftGoals).toBe(goals);
    });

    it('clears redoStack when a new change is applied after an undo', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const step1: GoalNode[] = [{ ...goals[0], title: 'Branch A' }, goals[1]];
      const step2: GoalNode[] = [{ ...goals[0], title: 'Branch B' }, goals[1]];

      studio.applyChange(step1, 'A');
      studio.undo();
      expect(studio.canRedo).toBe(true);

      studio.applyChange(step2, 'B');
      expect(studio.canRedo).toBe(false);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.draftGoals[0].title).toBe('Branch B');
    });
  });

  describe('Tree Folding / Expansion', () => {
    it('initializes expandedIds with initialPathIds and branch nodes by default', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialPathIds: ['task-1'],
      });

      expect(studio.expandedIds.has('task-1')).toBe(true);
      expect(studio.expandedIds.has('root-1')).toBe(true);
      expect(studio.expandedIds.has('root-2')).toBe(true);
    });

    it('toggles expansion state for a node', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialExpandedIds: [],
      });

      expect(studio.expandedIds.has('branch-1')).toBe(false);

      studio.toggleExpand('branch-1');
      expect(studio.expandedIds.has('branch-1')).toBe(true);

      studio.toggleExpand('branch-1');
      expect(studio.expandedIds.has('branch-1')).toBe(false);
    });

    it('expandAll adds all nodes to expandedIds', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialExpandedIds: [],
      });

      studio.expandAll();
      expect(studio.expandedIds.has('root-1')).toBe(true);
      expect(studio.expandedIds.has('branch-1')).toBe(true);
      expect(studio.expandedIds.has('task-1')).toBe(true);
      expect(studio.expandedIds.has('task-4')).toBe(true);
    });

    it('collapseAll clears all expandedIds', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialExpandedIds: ['root-1', 'branch-1'],
      });

      expect(studio.expandedIds.size).toBeGreaterThan(0);
      studio.collapseAll();
      expect(studio.expandedIds.size).toBe(0);
    });
  });

  describe('Action Dispatchers & M1 Integration', () => {
    it('addChildrenInside calls addBlueprintChildrenBulk and updates draft, undo, and expansion', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const result = studio.addChildrenInside(['branch-1'], ['Integration Basics', 'Fundamental Theorem']);

      expect(result.success).toBe(true);
      expect(result.count).toBe(2);
      expect(result.createdIds).toHaveLength(2);

      const branch = studio.draftGoals[0].children[0];
      expect(branch.children.some((c) => c.title === 'Integration Basics')).toBe(true);
      expect(branch.children.some((c) => c.title === 'Fundamental Theorem')).toBe(true);

      // Parent should be auto-expanded
      expect(studio.expandedIds.has('branch-1')).toBe(true);
      expect(studio.canUndo).toBe(true);
      expect(studio.isDirty).toBe(true);
    });

    it('diffSteps applies Set-Union additions and Set-Difference removals', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      // task-1 currently has: ['Review epsilon-delta' (done), 'Solve 10 problems', 'Check solutions']
      const result = studio.diffSteps(
        ['task-1'],
        ['Solve 10 problems', 'Write summary notes'], // 'Solve 10 problems' is already there, should be skipped
        ['Check solutions'], // should be removed
      );

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(1);
      expect(result.addedCount).toBe(1); // only 'Write summary notes'
      expect(result.removedCount).toBe(1); // 'Check solutions' removed

      const task1 = studio.draftGoals[0].children[0].children[0];
      expect(task1.steps).toEqual([
        'Review epsilon-delta',
        'Solve 10 problems',
        'Write summary notes',
      ]);
      expect(studio.canUndo).toBe(true);
    });

    it('diffSteps protects completed steps by default', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      // task-1 has step 'Review epsilon-delta' which is completed (stepDone[0] === true)
      const result = studio.diffSteps(['task-1'], [], ['Review epsilon-delta']);

      expect(result.success).toBe(true);
      expect(result.protectedCompletedCount).toBe(1);
      expect(result.removedCount).toBe(0);

      const task1 = studio.draftGoals[0].children[0].children[0];
      expect(task1.steps).toContain('Review epsilon-delta');
    });

    it('setDates validates dates and applies valid start/end dates', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const invalidResult = studio.setDates(['task-1'], {
        startDate: '2026-12-31',
        endDate: '2026-01-01',
      });
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.error).toContain('cannot be after');
      expect(studio.canUndo).toBe(false); // No undo snapshot created

      const validResult = studio.setDates(['task-1'], {
        startDate: '2026-10-10',
        endDate: '2026-10-20',
      });
      expect(validResult.success).toBe(true);
      expect(validResult.count).toBe(1);

      const task1 = studio.draftGoals[0].children[0].children[0];
      expect(task1.startDate).toBe('2026-10-10');
      expect(task1.endDate).toBe('2026-10-20');
      expect(studio.canUndo).toBe(true);
    });

    it('convertToBranch converts endpoint node to branch and expands it', () => {
      const goals: GoalNode[] = [
        {
          id: 'root-1',
          kind: 'goal',
          title: 'Root',
          completed: false,
          createdAt: 1000,
          children: [
            {
              id: 'leaf-1',
              kind: 'node',
              title: 'Leaf',
              completed: false,
              createdAt: 1010,
              steps: ['Step 1', 'Step 2'],
              stepDone: [true, false],
              children: [],
            },
          ],
        },
      ];

      const studio = createBlueprintStudioController({ goals });

      const result = studio.convertToBranch('leaf-1', { convertExistingSteps: true });
      expect(result.success).toBe(true);

      const converted = studio.draftGoals[0].children[0];
      expect(converted.steps).toBeUndefined();
      expect(converted.children).toHaveLength(2);
      expect(converted.children[0].title).toBe('Step 1');
      expect(converted.children[0].completed).toBe(true);
      expect(converted.children[1].title).toBe('Step 2');
      expect(converted.children[1].completed).toBe(false);
      expect(studio.expandedIds.has('leaf-1')).toBe(true);
      expect(studio.canUndo).toBe(true);
    });

    it('convertToTask converts empty leaf to task with steps', () => {
      const goals: GoalNode[] = [
        {
          id: 'root-1',
          kind: 'goal',
          title: 'Root',
          completed: false,
          createdAt: 1000,
          children: [
            {
              id: 'empty-node',
              kind: 'node',
              title: 'Empty Node',
              completed: false,
              createdAt: 1010,
              children: [],
            },
          ],
        },
      ];

      const studio = createBlueprintStudioController({ goals });

      const result = studio.convertToTask('empty-node', ['New Step 1', 'New Step 2']);
      expect(result.success).toBe(true);

      const task = studio.draftGoals[0].children[0];
      expect(task.steps).toEqual(['New Step 1', 'New Step 2']);
      expect(task.stepDone).toEqual([false, false]);
      expect(studio.canUndo).toBe(true);
    });

    it('removeNodes deletes items and cleans up selection and expansion sets', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-2'],
        initialExpandedIds: ['branch-1', 'task-2'],
      });

      const result = studio.removeNodes(['task-2']);
      expect(result.success).toBe(true);
      expect(studio.selectedIds.has('task-2')).toBe(false);
      expect(studio.expandedIds.has('task-2')).toBe(false);
      expect(studio.canUndo).toBe(true);

      const branch = studio.draftGoals[0].children[0];
      expect(branch.children.find((c) => c.id === 'task-2')).toBeUndefined();
    });
  });

  describe('No-Op Actions and Undo Stack Cleanliness', () => {
    it('duplicateNodes with empty array is a clean no-op without undo pollution', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      const result = studio.duplicateNodes([]);
      expect(result.success).toBe(true);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('duplicateNodes with non-existent ids does not mutate tree or pollute undoStack', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const result = studio.duplicateNodes(['non-existent-id']);
      expect(result.success).toBe(true);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('patchItems with empty patches object is a clean no-op without undo pollution', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      const result = studio.patchItems({});
      expect(result.success).toBe(true);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('removeNodes with non-existent id or empty array does not push undo snapshot and keeps isDirty false', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // 1. Non-existent ID
      const resultGhost = studio.removeNodes(['ghost-id']);
      expect(resultGhost.success).toBe(true);
      expect(resultGhost.count).toBe(0);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);

      // 2. Empty array
      const resultEmpty = studio.removeNodes([]);
      expect(resultEmpty.success).toBe(true);
      expect(resultEmpty.count).toBe(0);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.isDirty).toBe(false);
    });

    it('sequential no-op operations maintain zero undoStack length and clean state', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.duplicateNodes([]);
      studio.patchItems({});
      studio.removeNodes(['ghost-id']);
      studio.removeNodes([]);

      expect(studio.undoStack).toHaveLength(0);
      expect(studio.redoStack).toHaveLength(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.canRedo).toBe(false);
      expect(studio.isDirty).toBe(false);
      expect(JSON.stringify(studio.draftGoals)).toBe(JSON.stringify(studio.baseGoals));
    });
  });

  describe('Active Session Task Guard', () => {
    it('disallows convertToBranch when targeting activeGoalNodeId', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.convertToBranch('task-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert active session task');
      expect(studio.errorMessage).toContain('Cannot convert active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('disallows convertToTask when targeting activeGoalNodeId', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.convertToTask('task-1', ['New step']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert active session task');
      expect(studio.errorMessage).toContain('Cannot convert active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('disallows step deletion on activeGoalNodeId in diffSteps', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.diffSteps(['task-1'], [], ['Solve 10 problems']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete steps from active session task');
      expect(studio.errorMessage).toContain('Cannot delete steps from active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('disallows step deletion when activeGoalNodeId is one of multiple target nodes', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.diffSteps(['task-2', 'task-1'], [], ['Common step']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete steps from active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('allows step additions on activeGoalNodeId when no deletions are requested', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.diffSteps(['task-1'], ['New urgent note'], []);
      expect(result.success).toBe(true);
      expect(result.addedCount).toBe(1);
      expect(studio.canUndo).toBe(true);

      const task1 = studio.draftGoals[0].children[0].children[0];
      expect(task1.steps).toContain('New urgent note');
    });

    it('disallows adding children inside activeGoalNodeId (conversion guard)', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.addChildrenInside(['task-1'], ['Sub task']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot convert active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('disallows removing activeGoalNodeId', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      const result = studio.removeNodes(['task-1']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete active session task');
      expect(studio.canUndo).toBe(false);
    });

    it('disallows removing parent container of activeGoalNodeId and preserves all nodes', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1', // task-1 is inside branch-1 inside root-1
      });

      // branch-1 is the direct parent container of task-1
      const result = studio.removeNodes(['branch-1']);
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain('Cannot delete active session task');
      expect(studio.errorMessage).toContain('Cannot delete active session task');
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Verify that neither branch-1 nor task-1 was deleted
      const branch1 = studio.draftGoals[0].children.find((c) => c.id === 'branch-1');
      expect(branch1).toBeDefined();
      expect(branch1?.children.some((c) => c.id === 'task-1')).toBe(true);
    });

    it('disallows removing root goal ancestor of activeGoalNodeId and preserves tree', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      // root-1 is the root ancestor of task-1
      const result = studio.removeNodes(['root-1']);
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain('Cannot delete active session task');
      expect(studio.errorMessage).toContain('Cannot delete active session task');
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Verify root-1 and task-1 are still intact
      expect(studio.draftGoals.some((g) => g.id === 'root-1')).toBe(true);
      const root1 = studio.draftGoals.find((g) => g.id === 'root-1');
      const branch1 = root1?.children.find((c) => c.id === 'branch-1');
      expect(branch1?.children.some((c) => c.id === 'task-1')).toBe(true);
    });

    it('atomically blocks multi-node deletion when an ancestor of activeGoalNodeId is in the batch', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      // Attempt to delete unrelated task-4 (in root-2) and ancestor branch-1 in the same call
      const result = studio.removeNodes(['task-4', 'branch-1']);
      expect(result.success).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toContain('Cannot delete active session task');
      expect(studio.errorMessage).toContain('Cannot delete active session task');
      expect(studio.canUndo).toBe(false);
      expect(studio.undoStack).toHaveLength(0);
      expect(studio.isDirty).toBe(false);

      // Verify task-4 was NOT deleted (atomic abort)
      const root2 = studio.draftGoals.find((g) => g.id === 'root-2');
      expect(root2?.children.some((c) => c.id === 'task-4')).toBe(true);

      // Verify branch-1 and task-1 remain untouched
      const root1 = studio.draftGoals.find((g) => g.id === 'root-1');
      const branch1 = root1?.children.find((c) => c.id === 'branch-1');
      expect(branch1?.children.some((c) => c.id === 'task-1')).toBe(true);
    });

    it('allows removing previous ancestor once activeGoalNodeId is shifted or cleared', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      // Initially branch-1 cannot be removed
      expect(studio.removeNodes(['branch-1']).success).toBe(false);

      // Shift active session to task-4 (in root-2)
      studio.setActiveGoalNodeId('task-4');
      expect(studio.activeGoalNodeId).toBe('task-4');

      // Now branch-1 can be removed cleanly
      const result = studio.removeNodes(['branch-1']);
      expect(result.success).toBe(true);
      expect(studio.canUndo).toBe(true);
      expect(studio.draftGoals[0].children.find((c) => c.id === 'branch-1')).toBeUndefined();
    });

    it('allows operations when activeGoalNodeId is unset or updated', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });

      studio.setActiveGoalNodeId(undefined);
      expect(studio.activeGoalNodeId).toBeUndefined();

      const result = studio.diffSteps(['task-1'], [], ['Solve 10 problems']);
      expect(result.success).toBe(true);
      expect(result.removedCount).toBe(1);
    });
  });

  describe('Store Subscription and State Reset', () => {
    it('notifies subscribers upon state mutations', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      const listener = vi.fn();
      const unsubscribe = studio.subscribe(listener);

      studio.toggleSelect('task-1');
      expect(listener).toHaveBeenCalledTimes(1);

      studio.clearSelection();
      expect(listener).toHaveBeenCalledTimes(2);

      unsubscribe();
      studio.toggleSelect('task-2');
      expect(listener).toHaveBeenCalledTimes(2);
    });

    it('reset restores initial state or accepts new base goals', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioController({ goals });

      studio.toggleSelect('task-1');
      studio.applyChange([{ ...goals[0], title: 'Changed' }], 'Title change');
      expect(studio.isDirty).toBe(true);
      expect(studio.selectedIds.size).toBe(1);

      studio.reset();
      expect(studio.isDirty).toBe(false);
      expect(studio.selectedIds.size).toBe(0);
      expect(studio.canUndo).toBe(false);
      expect(studio.draftGoals[0].title).toBe('Master Calculus');
    });

    it('createBlueprintStudioState alias works identically to createBlueprintStudioController', () => {
      const goals = createSampleGoals();
      const studio = createBlueprintStudioState({ goals });

      studio.toggleSelect('task-1');
      expect(studio.selectedIds.has('task-1')).toBe(true);
    });
  });

  describe('Pure blueprintStudioReducer', () => {
    it('handles actions purely without side effects', () => {
      const goals = createSampleGoals();
      const initial = initialBlueprintStudioState({ goals });

      const s1 = blueprintStudioReducer(initial, { type: 'TOGGLE_SELECT', id: 'task-1' });
      expect(s1.selectedIds.has('task-1')).toBe(true);
      expect(initial.selectedIds.has('task-1')).toBe(false); // Pure, original unchanged

      const s2 = blueprintStudioReducer(s1, { type: 'CLEAR_SELECTION' });
      expect(s2.selectedIds.size).toBe(0);

      const nextGoals: GoalNode[] = [{ ...goals[0], title: 'Pure next' }, goals[1]];
      const s3 = blueprintStudioReducer(s2, {
        type: 'APPLY_CHANGE',
        nextGoals,
        description: 'Pure apply',
      });
      expect(s3.undoStack).toHaveLength(1);
      expect(s3.draftGoals[0].title).toBe('Pure next');

      const s4 = blueprintStudioReducer(s3, { type: 'UNDO' });
      expect(s4.draftGoals[0].title).toBe('Master Calculus');
      expect(s4.redoStack).toHaveLength(1);

      const s5 = blueprintStudioReducer(s4, { type: 'REDO' });
      expect(s5.draftGoals[0].title).toBe('Pure next');
    });
  });
});
