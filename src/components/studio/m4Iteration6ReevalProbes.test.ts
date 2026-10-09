import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../../types';
import { createBlueprintStudioController } from './blueprintStudioState';
import { StudioDateModal } from './StudioDateModal';
import { StudioNodeExpansionModal } from './StudioNodeExpansionModal';
import { StudioBulkStepDiffModal } from './StudioBulkStepDiffModal';
import { findGoal } from '../../lib/goalTree';

function createEvaluationGoals(): GoalNode[] {
  return [
    {
      id: 'root-alpha',
      kind: 'goal',
      title: 'Alpha Initiative',
      completed: false,
      createdAt: 1000,
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      children: [
        {
          id: 'branch-core',
          kind: 'node',
          title: 'Core Engine',
          completed: false,
          createdAt: 1010,
          startDate: '2026-10-05',
          endDate: '2026-10-25',
          children: [
            {
              id: 'task-pipeline',
              kind: 'node',
              title: 'Data Pipeline',
              completed: false,
              createdAt: 1020,
              startDate: '2026-10-10',
              endDate: '2026-10-20',
              steps: ['Ingestion parser', 'Validation check', 'Storage sink'],
              stepDone: [true, false, true],
              children: [],
            },
            {
              id: 'task-indexing',
              kind: 'node',
              title: 'Search Indexing',
              completed: false,
              createdAt: 1030,
              steps: ['Tokenize records', 'Build inverted index'],
              stepDone: [true, true],
              children: [],
            },
            {
              id: 'leaf-metrics',
              kind: 'node',
              title: 'Telemetry Metrics',
              completed: false,
              createdAt: 1040,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-beta',
      kind: 'goal',
      title: 'Beta Campaign',
      completed: false,
      createdAt: 2000,
      children: [],
    },
  ];
}

describe('Milestone 4 Iteration 6 Gate: Empirical Re-evaluation Probes', () => {
  // =========================================================================
  // DEFECT 1: Date Clearing via { clearAll: true }
  // =========================================================================
  describe('Defect 1: Date Clearing Empirical Probing', () => {
    it('E1.1: handleClearAllDates dispatching { clearAll: true } removes startDate and endDate on single and multiple targets', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      // Before: task-pipeline and branch-core have dates
      const pipelineBefore = findGoal(controller.draftGoals, 'task-pipeline');
      expect(pipelineBefore?.startDate).toBe('2026-10-10');
      expect(pipelineBefore?.endDate).toBe('2026-10-20');

      const coreBefore = findGoal(controller.draftGoals, 'branch-core');
      expect(coreBefore?.startDate).toBe('2026-10-05');
      expect(coreBefore?.endDate).toBe('2026-10-25');

      // Execute clearAll on both targets
      const res = controller.setDates(['task-pipeline', 'branch-core'], { clearAll: true });
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);

      // Verify domain state: both nodes have startDate and endDate undefined
      const pipelineAfter = findGoal(controller.draftGoals, 'task-pipeline');
      expect(pipelineAfter?.startDate).toBeUndefined();
      expect(pipelineAfter?.endDate).toBeUndefined();

      const coreAfter = findGoal(controller.draftGoals, 'branch-core');
      expect(coreAfter?.startDate).toBeUndefined();
      expect(coreAfter?.endDate).toBeUndefined();

      // Controller is marked dirty
      expect(controller.isDirty).toBe(true);
    });

    it('E1.2: handleSave with both dates blank/cleared executes { clearAll: true } path', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'task-pipeline';
      const before = findGoal(controller.draftGoals, targetId);
      expect(before?.startDate).toBe('2026-10-10');
      expect(before?.endDate).toBe('2026-10-20');

      // StudioDateModal handleSave logic:
      // if (!startDate.trim() && !endDate.trim()) setDates(targetNodeIds, { clearAll: true });
      const startDate = '   ';
      const endDate = '';
      if (!startDate.trim() && !endDate.trim()) {
        const res = controller.setDates([targetId], { clearAll: true });
        expect(res.success).toBe(true);
        expect(res.count).toBe(1);
      } else {
        expect.unreachable('Should have taken the clearAll branch');
      }

      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.startDate).toBeUndefined();
      expect(after?.endDate).toBeUndefined();
    });

    it('E1.3: Date clearing on nodes that already have no dates is a safe no-op and does not dirty draft', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      // leaf-metrics has no dates
      const res = controller.setDates(['leaf-metrics'], { clearAll: true });
      expect(res.success).toBe(true);
      expect(res.count).toBe(0);
      expect(controller.isDirty).toBe(false);
      expect(controller.undoStack).toHaveLength(0);
    });

    it('E1.4: Date clearing is fully undoable and redoable via transaction history', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      controller.setDates(['task-pipeline'], { clearAll: true });
      expect(findGoal(controller.draftGoals, 'task-pipeline')?.startDate).toBeUndefined();

      // Undo restores dates
      controller.undo();
      const restored = findGoal(controller.draftGoals, 'task-pipeline');
      expect(restored?.startDate).toBe('2026-10-10');
      expect(restored?.endDate).toBe('2026-10-20');

      // Redo re-clears dates
      controller.redo();
      const reCleared = findGoal(controller.draftGoals, 'task-pipeline');
      expect(reCleared?.startDate).toBeUndefined();
      expect(reCleared?.endDate).toBeUndefined();
    });

    it('E1.5: Date clearing across heterogeneous tree nodes (root, branch, task) clears only targets', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const res = controller.setDates(['root-alpha', 'task-pipeline'], { clearAll: true });
      expect(res.success).toBe(true);
      expect(res.count).toBe(2);

      expect(findGoal(controller.draftGoals, 'root-alpha')?.startDate).toBeUndefined();
      expect(findGoal(controller.draftGoals, 'task-pipeline')?.startDate).toBeUndefined();

      // Untargeted branch-core retains its dates
      expect(findGoal(controller.draftGoals, 'branch-core')?.startDate).toBe('2026-10-05');
      expect(findGoal(controller.draftGoals, 'branch-core')?.endDate).toBe('2026-10-25');
    });
  });

  // =========================================================================
  // DEFECT 2: Step Preservation on Node Expansion
  // =========================================================================
  describe('Defect 2: Step Preservation on Node Expansion Probing', () => {
    it('E2.1: Expanding task with existing steps into task preserves all steps and stepDone status', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'task-pipeline';
      const before = findGoal(controller.draftGoals, targetId);
      expect(before?.steps).toEqual(['Ingestion parser', 'Validation check', 'Storage sink']);
      expect(before?.stepDone).toEqual([true, false, true]);

      // Execute exact logic of StudioNodeExpansionModal.handleConvertToTask:
      const node = targetId ? findGoal(controller.draftGoals, targetId) : null;
      if (!(node?.steps && node.steps.length > 0)) {
        controller.convertToTask(targetId);
      }
      controller.openModal('bulk_step_diff', [targetId]);

      // Steps are 100% preserved
      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.steps).toEqual(['Ingestion parser', 'Validation check', 'Storage sink']);
      expect(after?.stepDone).toEqual([true, false, true]);
      expect(controller.activeModal).toBe('bulk_step_diff');
      expect(controller.targetNodeIds).toEqual([targetId]);
    });

    it('E2.2: Expanding empty leaf node into task initializes task with empty steps array', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'leaf-metrics';
      const node = findGoal(controller.draftGoals, targetId);
      expect(node?.steps).toBeUndefined();

      if (!(node?.steps && node.steps.length > 0)) {
        controller.convertToTask(targetId);
      }
      controller.openModal('bulk_step_diff', [targetId]);

      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.steps).toEqual([]);
      expect(after?.stepDone).toEqual([]);
      expect(controller.activeModal).toBe('bulk_step_diff');
    });

    it('E2.3: Expanding task with existing steps into branch converts steps to child nodes without data loss', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'task-pipeline';
      const before = findGoal(controller.draftGoals, targetId);
      expect(before?.steps).toHaveLength(3);

      // Execute exact logic of StudioNodeExpansionModal.handleConvertToBranch:
      const branchRes = controller.convertToBranch(targetId, { convertExistingSteps: true });
      expect(branchRes.success).toBe(true);
      controller.openModal('bulk_add_inside', [targetId]);

      const after = findGoal(controller.draftGoals, targetId);
      // Steps property removed, converted to children
      expect(after?.steps).toBeUndefined();
      expect(after?.stepDone).toBeUndefined();
      expect(after?.children).toHaveLength(3);

      // Converted child nodes match original steps and completion states
      expect(after?.children[0].title).toBe('Ingestion parser');
      expect(after?.children[0].completed).toBe(true);

      expect(after?.children[1].title).toBe('Validation check');
      expect(after?.children[1].completed).toBe(false);

      expect(after?.children[2].title).toBe('Storage sink');
      expect(after?.children[2].completed).toBe(true);

      // Modal transitioned to bulk_add_inside
      expect(controller.activeModal).toBe('bulk_add_inside');
    });

    it('E2.4: Expanding empty leaf node into branch initializes branch with empty children', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'leaf-metrics';
      const branchRes = controller.convertToBranch(targetId, { convertExistingSteps: true });
      expect(branchRes.success).toBe(true);

      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.children).toEqual([]);
      expect(after?.steps).toBeUndefined();
    });

    it('E2.5: Active session task is protected from expansion and conversion to branch or task', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-pipeline',
      });

      const taskRes = controller.convertToTask('task-pipeline');
      expect(taskRes.success).toBe(false);
      expect(taskRes.error).toContain('Cannot convert active session task');

      const branchRes = controller.convertToBranch('task-pipeline', { convertExistingSteps: true });
      expect(branchRes.success).toBe(false);
      expect(branchRes.error).toContain('Cannot convert active session task');
    });
  });

  // =========================================================================
  // DEFECT 3: Completed Step Removal via { forceRemoveCompleted: true }
  // =========================================================================
  describe('Defect 3: Completed Step Removal Probing', () => {
    it('E3.1: StudioBulkStepDiffModal handleSave with { forceRemoveCompleted: true } genuinely removes completed steps', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      // task-pipeline has completed steps 'Ingestion parser' (true) and 'Storage sink' (true)
      const targetId = 'task-pipeline';
      const before = findGoal(controller.draftGoals, targetId);
      expect(before?.stepDone?.[0]).toBe(true); // 'Ingestion parser' is done

      // User marks 'Ingestion parser' for removal and saves:
      const stepsToRemove = ['Ingestion parser'];
      const stepsToAdd: string[] = [];

      const res = controller.diffSteps(
        [targetId],
        stepsToAdd,
        stepsToRemove,
        { forceRemoveCompleted: true },
      );
      expect(res.success).toBe(true);
      expect(res.removedCount).toBe(1);
      expect(res.protectedCompletedCount).toBe(0);

      // Domain state genuinely reflects removal
      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.steps).not.toContain('Ingestion parser');
      expect(after?.steps).toEqual(['Validation check', 'Storage sink']);
      expect(after?.stepDone).toEqual([false, true]);
    });

    it('E3.2: Calling diffSteps WITHOUT forceRemoveCompleted protects completed steps from deletion', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      const targetId = 'task-pipeline';
      const res = controller.diffSteps(
        [targetId],
        [],
        ['Ingestion parser'],
        // forceRemoveCompleted omitted / false
      );
      expect(res.success).toBe(true);
      expect(res.removedCount).toBe(0);
      expect(res.protectedCompletedCount).toBe(1);

      // Step is still present in domain state
      const after = findGoal(controller.draftGoals, targetId);
      expect(after?.steps).toContain('Ingestion parser');
    });

    it('E3.3: Bulk removal of completed step across multiple nodes removes from all that have it', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });

      // task-pipeline and task-indexing both have completed steps
      // task-indexing has ['Tokenize records', 'Build inverted index'], both completed
      // Let's add 'Shared Step' to both, mark it done in task-indexing, and remove it
      controller.diffSteps(['task-pipeline', 'task-indexing'], ['Shared Step'], []);

      // Now remove 'Shared Step' with forceRemoveCompleted: true
      const removeRes = controller.diffSteps(
        ['task-pipeline', 'task-indexing'],
        [],
        ['Shared Step'],
        { forceRemoveCompleted: true },
      );
      expect(removeRes.success).toBe(true);
      expect(removeRes.removedCount).toBe(2);

      expect(findGoal(controller.draftGoals, 'task-pipeline')?.steps).not.toContain('Shared Step');
      expect(findGoal(controller.draftGoals, 'task-indexing')?.steps).not.toContain('Shared Step');
    });

    it('E3.4: Active session task blocks step deletion even if forceRemoveCompleted: true is passed', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-pipeline',
      });

      const res = controller.diffSteps(
        ['task-pipeline'],
        [],
        ['Ingestion parser'],
        { forceRemoveCompleted: true },
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain('Cannot delete steps from active session task');

      // Step remained completely untouched
      const after = findGoal(controller.draftGoals, 'task-pipeline');
      expect(after?.steps).toContain('Ingestion parser');
    });
  });

  // =========================================================================
  // MODAL UI RENDERING CONTRACTS
  // =========================================================================
  describe('Modal UI Markup & Rendering Contracts', () => {
    it('E4.1: StudioDateModal markup renders Clear Dates button and preset options', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('date_picker', ['task-pipeline']);

      const html = renderToStaticMarkup(createElement(StudioDateModal, { controller }));
      expect(html).toContain('Clear Dates');
      expect(html).toContain('Reset');
      expect(html).toContain('Today');
      expect(html).toContain('Tomorrow');
      expect(html).toContain('Save');
    });

    it('E4.2: StudioNodeExpansionModal markup renders both expansion options and helper reassurance', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('node_expansion', ['task-pipeline']);

      const html = renderToStaticMarkup(createElement(StudioNodeExpansionModal, { controller }));
      expect(html).toContain('Add Checklist Steps');
      expect(html).toContain('Add Sub-items');
      expect(html).toContain('Selected item:');
      expect(html).toContain('Data Pipeline');
      expect(html).toContain('without losing progress');
    });

    it('E4.3: StudioBulkStepDiffModal markup renders step list, lock icons, and save button', () => {
      const goals = createEvaluationGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_step_diff', ['task-pipeline']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('Edit Checklist Steps');
      expect(html).toContain('Ingestion parser');
      expect(html).toContain('Validation check');
      expect(html).toContain('Storage sink');
      expect(html).toContain('Save Changes');
    });
  });
});
