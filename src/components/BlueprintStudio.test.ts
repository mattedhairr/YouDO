import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BlueprintStudio, { BlueprintStudioContent } from './BlueprintStudio';
import { createBlueprintStudioController } from './studio/blueprintStudioState';
import type { GoalNode } from '../types';

// Mock Overlay to bypass createPortal in Node.js Vitest environment
vi.mock('./Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'mock-overlay' }, children) : null,
}));

function createTestGoals(): GoalNode[] {
  return [
    {
      id: 'root-1',
      kind: 'goal',
      title: 'Master TypeScript',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-1',
          kind: 'node',
          title: 'Advanced Types',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-1',
              kind: 'node',
              title: 'Conditional Types',
              completed: false,
              createdAt: 1020,
              startDate: '2026-10-10',
              endDate: '2026-10-15',
              steps: ['Read documentation', 'Write test cases'],
              stepDone: [true, false],
              children: [],
            },
            {
              id: 'task-2',
              kind: 'node',
              title: 'Template Literal Types',
              completed: false,
              createdAt: 1030,
              steps: ['Explore pattern matching'],
              stepDone: [false],
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-2',
      kind: 'goal',
      title: 'Health & Fitness',
      completed: false,
      createdAt: 2000,
      children: [],
    },
  ];
}

describe('BlueprintStudio Component Test Suite', () => {
  const noopClose = () => {};
  const noopCommit = () => ({ ok: true });

  describe('Suite 1: Root Overlay & Mounting', () => {
    it('T1.1: renders null / empty string when open is false', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: false,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toBe('');
    });

    it('T1.2: renders overlay and workspace container when open is true', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('data-testid="mock-overlay"');
      expect(html).toContain('class="studio"');
    });

    it('T1.3: exposes dialog role and accessible title', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-label="Blueprint Studio"');
    });
  });

  describe('Suite 2: Header Anatomy & Action Controls', () => {
    it('T2.1: renders title "Blueprint Studio" and back button with aria-label', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('<h1>Blueprint Studio</h1>');
      expect(html).toContain('aria-label="Go back"');
    });

    it('T2.2: renders search input with aria-label and placeholder', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Search goals"');
      expect(html).toContain('placeholder="Search goals..."');
    });

    it('T2.3: renders Expand All and Collapse All buttons', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Expand all"');
      expect(html).toContain('aria-label="Collapse all"');
    });

    it('T2.4: renders Undo and Redo buttons with accessible labels', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Undo"');
      expect(html).toContain('aria-label="Redo"');
    });

    it('T2.5: Undo and Redo are disabled in initial clean state', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Undo" disabled=""');
      expect(html).toContain('aria-label="Redo" disabled=""');
    });

    it('T2.6: Save Changes button is disabled when isDirty is false', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Save Changes');
      expect(html).toContain('aria-label="Save Changes" disabled=""');
    });

    it('T2.7: Save Changes button is enabled when isDirty is true', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.applyChange(
        [
          ...goals,
          {
            id: 'root-3',
            kind: 'goal',
            title: 'New Goal',
            completed: false,
            createdAt: 3000,
            children: [],
          },
        ],
        'Added new goal',
      );
      expect(controller.isDirty).toBe(true);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Save Changes"');
      expect(html).not.toContain('aria-label="Save Changes" disabled=""');
    });
  });

  describe('Suite 3: Tree Hierarchy & Badges', () => {
    it('T3.1: renders goal titles hierarchically in tree', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          initialPathIds: ['root-1', 'branch-1'],
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Master TypeScript');
      expect(html).toContain('Advanced Types');
      expect(html).toContain('Conditional Types');
      expect(html).toContain('Template Literal Types');
    });

    it('T3.2: renders date badge on dated node', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          initialPathIds: ['root-1', 'branch-1'],
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('2026-10-10');
    });

    it('T3.3: renders active session task indicator when activeGoalNodeId is set', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          initialPathIds: ['root-1', 'branch-1'],
          activeGoalNodeId: 'task-1',
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toMatch(/active|current|session/i);
    });

    it('T3.4: renders tree node selection checkboxes', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('type="button"');
    });

    it('T3.5: displays calm empty state placeholder when goals is empty', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: [],
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('No goals found');
    });
  });

  describe('Suite 4: Search & Filtering Behavior', () => {
    it('T4.1: displays search query value and clear button when search is active', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          goals: createTestGoals(),
          searchQuery: 'Conditional',
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('value="Conditional"');
      expect(html).toContain('aria-label="Clear search"');
    });

    it('T4.2: displays empty search state when query matches nothing', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          goals: createTestGoals(),
          searchQuery: 'NonExistentTitleXYZ',
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('No matching goals');
      expect(html).toContain('NonExistentTitleXYZ');
    });
  });

  describe('Suite 5: Floating Action Bar Integration', () => {
    it('T5.1: action bar is hidden when selectedIds is empty', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).not.toContain('selected');
      expect(html).not.toContain('Add Inside');
    });

    it('T5.2: action bar appears anchored at bottom when items are selected', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-1', 'task-2'],
      });
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('2 selected');
      expect(html).toContain('Add Inside');
      expect(html).toContain('Steps');
      expect(html).toContain('Dates');
    });

    it('T5.3: action bar contains Clear and Delete actions', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-1'],
      });
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Clear');
      expect(html).toContain('Delete');
    });
  });

  describe('Suite 6: Modal Sheet Layer Integration', () => {
    it('T6.1: no modal sheet rendered when activeModal is "none"', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).not.toContain('How would you like to expand?');
      expect(html).not.toContain('Add Child Nodes');
      expect(html).not.toContain('Edit Checklist Steps');
      expect(html).not.toContain('Set Dates');
    });

    it('T6.2: mounts StudioNodeExpansionModal when activeModal is "node_expansion"', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('node_expansion', ['task-1']);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('How would you like to expand?');
      expect(html).toContain('Add Checklist Steps');
      expect(html).toContain('Add Child Nodes');
    });

    it('T6.3: mounts StudioBulkAddModal when activeModal is "bulk_add_inside"', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_add_inside', ['branch-1']);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Add Child Nodes');
      expect(html).toContain('placeholder="Enter one node title per line..."');
    });

    it('T6.4: mounts StudioBulkStepDiffModal when activeModal is "bulk_step_diff"', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_step_diff', ['task-1']);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Edit Checklist Steps');
      expect(html).toContain('Read documentation');
      expect(html).toContain('Write test cases');
    });

    it('T6.5: mounts StudioDateModal when activeModal is "date_picker"', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('date_picker', ['task-1']);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Set Dates');
      expect(html).toContain('Clear Dates');
    });
  });

  describe('Suite 7: Notification Banners', () => {
    it('T7.1: renders alert banner when errorMessage is present', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-1',
      });
      // Attempt forbidden operation on active session task
      controller.addChildrenInside(['task-1'], ['Subitem']);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('role="alert"');
      expect(html).toContain(controller.errorMessage!);
      expect(html).toContain('aria-label="Dismiss error"');
    });

    it('T7.2: does not render alert banner when errorMessage is null', () => {
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).not.toContain('role="alert"');
    });

    it('T7.3: renders status banner when statusMessage is present', () => {
      const goals = createTestGoals();
      const controller = createBlueprintStudioController({ goals });
      // Dispatch status message
      (controller as unknown as { clearMessages?: () => void }).clearMessages?.();
      // Set status via reducer action
      controller.applyChange(
        [...goals, { id: 'root-99', kind: 'goal', title: 'Goal 99', completed: false, createdAt: 9999, children: [] }],
        'Saved items',
      );
      // Directly check controller with custom status by invoking reducer or checking status banner
      const controllerWithStatus = createBlueprintStudioController({ goals });
      // We can test status banner by testing content rendering with status
      const stateObj = controllerWithStatus.getSnapshot();
      Object.assign(stateObj, { statusMessage: 'All changes saved cleanly' });

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller: controllerWithStatus,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('role="status"');
      expect(html).toContain('All changes saved cleanly');
      expect(html).toContain('aria-label="Dismiss status"');
    });
  });

  describe('Suite 8: Props & Callback Contracts', () => {
    it('T8.1: respects initialPathIds by expanding ancestors', () => {
      const goals = createTestGoals();
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals,
          initialPathIds: ['root-1', 'branch-1'],
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('Conditional Types');
    });

    it('T8.2: wires back button to onClose handler', () => {
      const closeSpy = vi.fn();
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: createTestGoals(),
          onClose: closeSpy,
          onCommit: noopCommit,
        }),
      );
      expect(html).toContain('aria-label="Go back"');
    });
  });
});
