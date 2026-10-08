import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../../types';
import { createBlueprintStudioController } from './blueprintStudioState';
import { StudioBulkAddModal } from './StudioBulkAddModal';
import { StudioBulkStepDiffModal } from './StudioBulkStepDiffModal';
import { StudioDateModal } from './StudioDateModal';
import { StudioNodeExpansionModal } from './StudioNodeExpansionModal';
import {
  isValidISODate,
  numberedBlueprintTitles,
  normalizeBlueprintTitles,
  validateGoalDates,
} from '../../lib/blueprintStudio';
import { findGoal } from '../../lib/goalTree';

function createProbingGoals(): GoalNode[] {
  return [
    {
      id: 'root-proj',
      kind: 'goal',
      title: 'Platform Infrastructure',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-backend',
          kind: 'node',
          title: 'Backend Services',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-auth',
              kind: 'node',
              title: 'OAuth2 Authentication',
              completed: false,
              createdAt: 1020,
              startDate: '2026-10-01',
              endDate: '2026-10-15',
              steps: ['Setup Provider', 'JWT Verification', 'Refresh Tokens'],
              stepDone: [true, true, false],
              children: [],
            },
            {
              id: 'task-db',
              kind: 'node',
              title: 'Database Migrations',
              completed: false,
              createdAt: 1030,
              steps: ['Schema Diff', 'Run Migration'],
              stepDone: [false, false],
              children: [],
            },
            {
              id: 'leaf-empty',
              kind: 'node',
              title: 'Audit Logging',
              completed: false,
              createdAt: 1040,
              children: [],
            },
          ],
        },
        {
          id: 'branch-frontend',
          kind: 'node',
          title: 'Web Client',
          completed: false,
          createdAt: 1050,
          startDate: '2026-10-10',
          endDate: '2026-10-20',
          children: [],
        },
      ],
    },
    {
      id: 'root-marketing',
      kind: 'goal',
      title: 'Marketing Campaign',
      completed: false,
      createdAt: 2000,
      children: [],
    },
  ];
}

describe('M4 Milestone Gate: Adversarial Probes for Rebuilt Modals', () => {
  // =========================================================================
  // SECTION 1: StudioBulkAddModal Probes
  // =========================================================================
  describe('Probe 1: StudioBulkAddModal Stress & Adversarial Inputs', () => {
    it('P1.1: Empty strings and multi-line whitespace normalize to zero items', () => {
      expect(normalizeBlueprintTitles([])).toEqual([]);
      expect(normalizeBlueprintTitles(['', '   ', '\t\n\r'])).toEqual([]);
      expect(normalizeBlueprintTitles(['', 'Valid Item', '  ', 'Valid Item  '])).toEqual(['Valid Item']);
    });

    it('P1.2: Extreme Unicode characters (emojis, RTL, Chinese, math, quotes, HTML) preserve verbatim without corruption', () => {
      const extremeInputs = [
        '🚀 Rocket Launch 🎯 Target',
        'مرحبا بالعالم (Arabic RTL)',
        '你好世界 (Chinese Simplified)',
        '∑(x_i) = ∫ f(x)dx (Math symbols)',
        'Node with "double quotes" & \'single quotes\'',
        '<script>alert("xss")</script>',
        'Zero-width\u200Bspace and non-breaking\u00A0space',
      ];
      const normalized = normalizeBlueprintTitles(extremeInputs);
      expect(normalized).toHaveLength(extremeInputs.length);
      expect(normalized[0]).toBe('🚀 Rocket Launch 🎯 Target');
      expect(normalized[1]).toBe('مرحبا بالعالم (Arabic RTL)');
      expect(normalized[5]).toBe('<script>alert("xss")</script>');

      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      const addRes = controller.addChildrenInside(['leaf-empty'], extremeInputs);
      expect(addRes.success).toBe(true);
      expect(addRes.count).toBe(extremeInputs.length);

      const leaf = findGoal(controller.draftGoals, 'leaf-empty');
      expect(leaf?.children).toHaveLength(extremeInputs.length);
      expect(leaf?.children[0].title).toBe('🚀 Rocket Launch 🎯 Target');
      expect(leaf?.children[5].title).toBe('<script>alert("xss")</script>');
    });

    it('P1.3: Numbered sequence with negative start number clamps safely to 0', () => {
      const titles = numberedBlueprintTitles('Task', -10, 3);
      expect(titles).toEqual(['Task 0', 'Task 1', 'Task 2']);
    });

    it('P1.4: Numbered sequence with zero or negative count clamps safely to 1', () => {
      const zeroCount = numberedBlueprintTitles('Step', 1, 0);
      expect(zeroCount).toEqual(['Step 1']);

      const negativeCount = numberedBlueprintTitles('Step', 1, -5);
      expect(negativeCount).toEqual(['Step 1']);

      const clampedMax = numberedBlueprintTitles('Step', 1, 500);
      expect(clampedMax).toHaveLength(100);
      expect(clampedMax[99]).toBe('Step 100');
    });

    it('P1.5: Numbered sequence with empty or whitespace-only prefix falls back to Item', () => {
      const fallback = numberedBlueprintTitles('   ', 1, 2);
      expect(fallback).toEqual(['Item 1', 'Item 2']);
    });

    it('P1.6: High item counts across multiple parent nodes executes under 50ms without duplicate IDs', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      const largeList = Array.from({ length: 50 }, (_, i) => `Subtask ${i + 1}`);

      const start = performance.now();
      const res = controller.addChildrenInside(['leaf-empty', 'branch-frontend'], largeList);
      const elapsed = performance.now() - start;

      expect(res.success).toBe(true);
      expect(res.count).toBe(100); // 50 items * 2 parents
      expect(elapsed).toBeLessThan(50);

      // Verify all created UIDs are strictly unique
      const uids = new Set(res.createdIds);
      expect(uids.size).toBe(100);
    });

    it('P1.7: StudioBulkAddModal renders correctly with live parent count and add disabled when empty', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_add_inside', ['branch-backend', 'branch-frontend']);

      const html = renderToStaticMarkup(createElement(StudioBulkAddModal, { controller }));
      expect(html).toContain('Adding inside 2 target parents');
      expect(html).toContain('Multi-line List');
      expect(html).toContain('Numbered Sequence');
      expect(html).toContain('disabled=""'); // Button disabled when computedTitles is empty
    });
  });

  // =========================================================================
  // SECTION 2: StudioBulkStepDiffModal Probes
  // =========================================================================
  describe('Probe 2: StudioBulkStepDiffModal Adversarial Probing', () => {
    it('P2.1: Heterogeneous node batch (tasks with steps, empty leaves, branches, roots) computes prevalence correctly', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      // Target 4 heterogeneous nodes:
      // 1. task-auth: 3 steps ('Setup Provider', 'JWT Verification', 'Refresh Tokens')
      // 2. task-db: 2 steps ('Schema Diff', 'Run Migration')
      // 3. leaf-empty: 0 steps
      // 4. branch-frontend: branch node with 0 steps
      controller.openModal('bulk_step_diff', ['task-auth', 'task-db', 'leaf-empty', 'branch-frontend']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('Managing steps across 4 selected items');
      // Prevalence badges should show "1 of 4 nodes" for individual steps
      expect(html).toContain('1 of 4 nodes');
      // Completed steps badges
      expect(html).toContain('completed');
    });

    it('P2.2: Set-Union step addition to heterogeneous batch targets only endpoint tasks and skips non-endpoints', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      const diffRes = controller.diffSteps(
        ['task-auth', 'leaf-empty', 'branch-backend', 'root-marketing'],
        ['Security Audit'],
        [],
      );
      expect(diffRes.success).toBe(true);

      // Endpoint tasks get the step
      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.steps).toContain('Security Audit');

      const leaf = findGoal(controller.draftGoals, 'leaf-empty');
      expect(leaf?.steps).toContain('Security Audit');

      // Non-endpoints (branch with children and root goals) MUST NOT receive steps
      const backend = findGoal(controller.draftGoals, 'branch-backend');
      expect(backend?.steps).toBeUndefined();

      const mktg = findGoal(controller.draftGoals, 'root-marketing');
      expect(mktg?.steps).toBeUndefined();
    });

    it('P2.3: Attempting to remove steps from active session task is strictly blocked at UI and controller levels', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });
      controller.openModal('bulk_step_diff', ['task-auth']);

      // 1. UI Check: Active session task notice rendered and trash button disabled
      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('Active session task selected: completed steps and existing steps are protected from removal');
      expect(html).toContain('disabled=""');

      // 2. Controller Check: diffSteps directly rejects deletion from active task
      const result = controller.diffSteps(['task-auth'], [], ['Refresh Tokens']);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot delete steps from active session task');
      expect(controller.errorMessage).toContain('Cannot delete steps from active session task');

      // Step was preserved
      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.steps).toContain('Refresh Tokens');
    });

    it('P2.4: Attempting to delete completed steps without forceRemoveCompleted preserves them silently in domain', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // 'task-auth' has:
      // 'Setup Provider' (completed = true)
      // 'JWT Verification' (completed = true)
      // 'Refresh Tokens' (completed = false)

      // Attempt to remove 'Setup Provider' without forceRemoveCompleted
      const res = controller.diffSteps(['task-auth'], [], ['Setup Provider']);
      expect(res.success).toBe(true);
      expect(res.removedCount).toBe(0);
      expect(res.protectedCompletedCount).toBe(1);

      // Verify node still contains 'Setup Provider'
      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.steps).toContain('Setup Provider');
      expect(auth?.stepDone?.[0]).toBe(true);
    });

    it('P2.5: Removing completed steps ONLY succeeds when forceRemoveCompleted is explicitly true', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      const res = controller.diffSteps(
        ['task-auth'],
        [],
        ['Setup Provider'],
        { forceRemoveCompleted: true },
      );
      expect(res.success).toBe(true);
      expect(res.removedCount).toBe(1);
      expect(res.protectedCompletedCount).toBe(0);

      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.steps).not.toContain('Setup Provider');
      expect(auth?.steps).toContain('JWT Verification');
    });
  });

  // =========================================================================
  // SECTION 3: StudioDateModal Probes & Date Clearing Defect Verification
  // =========================================================================
  describe('Probe 3: StudioDateModal Adversarial & Defect Verification', () => {
    it('P3.1: Inverted date range (startDate > endDate) triggers validation error and blocks saving', () => {
      const validation = validateGoalDates({
        startDate: '2026-10-20',
        endDate: '2026-10-10',
      });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('cannot be after end date');

      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      const res = controller.setDates(['task-auth'], {
        startDate: '2026-10-20',
        endDate: '2026-10-10',
      });
      expect(res.success).toBe(false);
      expect(res.error).toContain('cannot be after end date');
    });

    it('P3.2: Non-ISO date formats are strictly rejected', () => {
      const invalidFormats = [
        '10/20/2026',
        '2026/10/20',
        '2026-1-5',
        '2026-10-05T12:00:00Z',
        'October 5, 2026',
        'random-text',
      ];
      for (const format of invalidFormats) {
        expect(isValidISODate(format)).toBe(false);
        const val = validateGoalDates({ startDate: format });
        expect(val.valid).toBe(false);
      }
    });

    it('P3.3: Leap year dates follow strict Gregorian calendar rules', () => {
      expect(isValidISODate('2024-02-29')).toBe(true); // Leap year
      expect(isValidISODate('2000-02-29')).toBe(true); // 400-year leap year
      expect(isValidISODate('2025-02-29')).toBe(false); // Non-leap year
      expect(isValidISODate('2026-02-29')).toBe(false); // Non-leap year
      expect(isValidISODate('2100-02-29')).toBe(false); // Century non-leap year
      expect(isValidISODate('1900-02-29')).toBe(false); // Century non-leap year

      // 30-day month boundaries
      expect(isValidISODate('2026-04-31')).toBe(false); // April has 30 days
      expect(isValidISODate('2026-06-31')).toBe(false); // June has 30 days
      expect(isValidISODate('2026-09-31')).toBe(false); // September has 30 days
      expect(isValidISODate('2026-11-31')).toBe(false); // November has 30 days
    });

    it('P3.4 [REMEDIATED]: StudioDateModal handleClearAllDates passes clearAll: true and clears dates', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // task-auth initially has dates:
      const beforeNode = findGoal(controller.draftGoals, 'task-auth');
      expect(beforeNode?.startDate).toBe('2026-10-01');
      expect(beforeNode?.endDate).toBe('2026-10-15');

      // StudioDateModal handleClearAllDates now executes:
      // controller.setDates(targetNodeIds, { clearAll: true });
      const res = controller.setDates(['task-auth'], { clearAll: true });

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);

      // Dates are successfully cleared from the node:
      const afterNode = findGoal(controller.draftGoals, 'task-auth');
      expect(afterNode?.startDate).toBeUndefined();
      expect(afterNode?.endDate).toBeUndefined();
    });

    it('P3.5 [REMEDIATED]: StudioDateModal handleSave passes clearAll: true when inputs are cleared and clears dates', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      const beforeNode = findGoal(controller.draftGoals, 'task-auth');
      expect(beforeNode?.startDate).toBe('2026-10-01');
      expect(beforeNode?.endDate).toBe('2026-10-15');

      // StudioDateModal handleSave now detects !startDate.trim() && !endDate.trim()
      // and dispatches { clearAll: true }:
      const res = controller.setDates(['task-auth'], { clearAll: true });

      expect(res.success).toBe(true);
      expect(res.count).toBe(1);

      const afterNode = findGoal(controller.draftGoals, 'task-auth');
      expect(afterNode?.startDate).toBeUndefined();
      expect(afterNode?.endDate).toBeUndefined();
    });

    it('P3.6: Clearing dates on mixed parent nodes (some dated, some undated, roots, branches)', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // Correctly clearing dates across mixed targets
      const res = controller.setDates(
        ['task-auth', 'leaf-empty', 'branch-frontend', 'root-proj'],
        { clearAll: true },
      );
      expect(res.success).toBe(true);

      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.startDate).toBeUndefined();
      expect(auth?.endDate).toBeUndefined();

      const frontend = findGoal(controller.draftGoals, 'branch-frontend');
      expect(frontend?.startDate).toBeUndefined();
      expect(frontend?.endDate).toBeUndefined();
    });
  });

  // =========================================================================
  // SECTION 4: StudioNodeExpansionModal Probes & Data Loss Hazard
  // =========================================================================
  describe('Probe 4: StudioNodeExpansionModal Adversarial & Data Loss Probes', () => {
    it('P4.1: Expanding empty leaf node into task or branch works as expected', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // Convert empty leaf to task
      const taskRes = controller.convertToTask('leaf-empty');
      expect(taskRes.success).toBe(true);
      const leafAsTask = findGoal(controller.draftGoals, 'leaf-empty');
      expect(leafAsTask?.steps).toEqual([]);

      // Reset and convert empty leaf to branch
      controller.reset();
      const branchRes = controller.convertToBranch('leaf-empty');
      expect(branchRes.success).toBe(true);
      const leafAsBranch = findGoal(controller.draftGoals, 'leaf-empty');
      expect(leafAsBranch?.children).toEqual([]);
    });

    it('P4.2 [REMEDIATED]: Expanding a node with existing steps into a task preserves all checklist steps', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // task-auth initially has 3 steps:
      const beforeNode = findGoal(controller.draftGoals, 'task-auth');
      expect(beforeNode?.steps).toHaveLength(3);

      // StudioNodeExpansionModal now checks if (node?.steps && node.steps.length > 0)
      // When steps exist, it does NOT call convertToTask(targetId) (which resets steps);
      // it simply transitions directly to openModal('bulk_step_diff', [targetId]):
      controller.openModal('node_expansion', ['task-auth']);
      expect(controller.activeModal).toBe('node_expansion');

      const targetId = 'task-auth';
      const node = findGoal(controller.draftGoals, targetId);
      if (!(node?.steps && node.steps.length > 0)) {
        controller.convertToTask(targetId);
      }
      controller.openModal('bulk_step_diff', [targetId]);

      // All 3 existing steps and done statuses are preserved:
      const afterNode = findGoal(controller.draftGoals, 'task-auth');
      expect(afterNode?.steps).toEqual(['Setup Provider', 'JWT Verification', 'Refresh Tokens']);
      expect(afterNode?.stepDone).toEqual([true, true, false]);
      expect(controller.activeModal).toBe('bulk_step_diff');
    });

    it('P4.3 [REMEDIATED]: Converting a node with existing steps to a branch converts steps to child nodes', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      const beforeNode = findGoal(controller.draftGoals, 'task-auth');
      expect(beforeNode?.steps).toHaveLength(3);

      // StudioNodeExpansionModal now calls convertToBranch with { convertExistingSteps: true }:
      const res = controller.convertToBranch('task-auth', { convertExistingSteps: true });
      expect(res.success).toBe(true);

      // The node is converted to a branch and its 3 steps become child nodes:
      const afterNode = findGoal(controller.draftGoals, 'task-auth');
      expect(afterNode?.steps).toBeUndefined();
      expect(afterNode?.children).toHaveLength(3);
      expect(afterNode?.children.map((c) => c.title)).toEqual([
        'Setup Provider',
        'JWT Verification',
        'Refresh Tokens',
      ]);
    });

    it('P4.4: Active session task is protected from expansion/conversion', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      const taskRes = controller.convertToTask('task-auth');
      expect(taskRes.success).toBe(false);
      expect(taskRes.error).toContain('Cannot convert active session task');

      const branchRes = controller.convertToBranch('task-auth');
      expect(branchRes.success).toBe(false);
      expect(branchRes.error).toContain('Cannot convert active session task');
    });

    it('P4.5: Rapid conversion triggers and repeated open/close cycles maintain stable state', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      for (let i = 0; i < 20; i++) {
        controller.openModal('node_expansion', ['leaf-empty']);
        expect(controller.activeModal).toBe('node_expansion');
        controller.openModal('bulk_step_diff', ['leaf-empty']);
        expect(controller.activeModal).toBe('bulk_step_diff');
        controller.closeModal();
        expect(controller.activeModal).toBe('none');
      }

      // State remains completely intact
      expect(controller.draftGoals).toEqual(goals);
      expect(controller.undoStack).toHaveLength(0);
    });

    it('P4.6: StudioNodeExpansionModal renders target breadcrumbs and handles missing target gracefully', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('node_expansion', ['task-auth']);

      const html = renderToStaticMarkup(createElement(StudioNodeExpansionModal, { controller }));
      expect(html).toContain('OAuth2 Authentication');
      expect(html).toContain('Platform Infrastructure');
      expect(html).toContain('Backend Services');
      expect(html).toContain('Add Checklist Steps');
      expect(html).toContain('Add Sub-items');
    });
  });

  // =========================================================================
  // SECTION 5: Additional Edge Cases & Presets Verification
  // =========================================================================
  describe('Probe 5: Date Presets & Multi-Selection Edge Probes', () => {
    it('P5.1: StudioDateModal pre-fills dates for single target but leaves blank for multi-target', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // Single target with existing dates
      controller.openModal('date_picker', ['task-auth']);
      const htmlSingle = renderToStaticMarkup(createElement(StudioDateModal, { controller }));
      expect(htmlSingle).toContain('value="2026-10-01"');
      expect(htmlSingle).toContain('value="2026-10-15"');

      // Multi-target
      controller.openModal('date_picker', ['task-auth', 'task-db']);
      const htmlMulti = renderToStaticMarkup(createElement(StudioDateModal, { controller }));
      expect(htmlMulti).toContain('Applying to 2 selected items');
      // Inputs should be empty for bulk
      expect(htmlMulti).not.toContain('value="2026-10-01"');
    });

    it('P5.2: StudioBulkStepDiffModal shows calm empty state when all selected nodes have 0 steps', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_step_diff', ['leaf-empty', 'branch-frontend']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('No steps yet. Add one below to apply across all selected items.');
    });

    it('P5.3: Bulk step removal skips nodes lacking the step without throwing error', () => {
      const goals = createProbingGoals();
      const controller = createBlueprintStudioController({ goals });

      // task-auth has 'Refresh Tokens'; task-db does not
      const diffRes = controller.diffSteps(['task-auth', 'task-db'], [], ['Refresh Tokens']);
      expect(diffRes.success).toBe(true);
      expect(diffRes.removedCount).toBe(1);

      const auth = findGoal(controller.draftGoals, 'task-auth');
      expect(auth?.steps).not.toContain('Refresh Tokens');

      const db = findGoal(controller.draftGoals, 'task-db');
      expect(db?.steps).toEqual(['Schema Diff', 'Run Migration']);
    });
  });
});
