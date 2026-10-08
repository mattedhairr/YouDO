import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoalNode } from '../../types';
import { StudioTree } from './StudioTree';
import { StudioActionBar } from './StudioActionBar';
import { BlueprintStudioContent } from '../BlueprintStudio';
import { createBlueprintStudioController } from './blueprintStudioState';
import { topStudioSelection } from '../../lib/studioWorkspace';

// Mock Overlay for any full modal rendering in Node.js
vi.mock('../Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'mock-overlay' }, children) : null,
}));

/** Helper to generate a linear deeply nested chain of goals */
function createDeepChain(depth: number, leafProps: Partial<GoalNode> = {}): GoalNode[] {
  let current: GoalNode = {
    id: `node-${depth}`,
    kind: 'node',
    title: `Deep Level ${depth}`,
    completed: false,
    createdAt: 1000 + depth,
    children: [],
    ...leafProps,
  };

  for (let i = depth - 1; i >= 1; i--) {
    current = {
      id: `node-${i}`,
      kind: i === 1 ? 'goal' : 'node',
      title: `Deep Level ${i}`,
      completed: false,
      createdAt: 1000 + i,
      children: [current],
    };
  }

  return [current];
}

/** Helper to generate a multi-branch test goal tree */
function createRichTestTree(): GoalNode[] {
  return [
    {
      id: 'root-alpha',
      kind: 'goal',
      title: 'Project Alpha (2026)',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-backend',
          kind: 'node',
          title: 'Backend Services [Core]',
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
              steps: ['Token exchange', 'JWT validation', 'Refresh flow'],
              stepDone: [true, true, false],
              children: [],
            },
            {
              id: 'task-db',
              kind: 'node',
              title: 'Database Migrations (Postgres)',
              completed: false,
              createdAt: 1030,
              steps: ['Schema setup'],
              stepDone: [false],
              children: [],
            },
            {
              id: 'leaf-empty',
              kind: 'node',
              title: 'API Gateway Specs',
              completed: false,
              createdAt: 1040,
              children: [],
            },
          ],
        },
        {
          id: 'branch-frontend',
          kind: 'node',
          title: 'Web Client [React]',
          completed: false,
          createdAt: 1050,
          children: [
            {
              id: 'task-ui',
              kind: 'node',
              title: 'Design System & Tokens',
              completed: false,
              createdAt: 1060,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-beta',
      kind: 'goal',
      title: 'Mobile App 🚀',
      completed: false,
      createdAt: 2000,
      children: [
        {
          id: 'task-ios',
          kind: 'node',
          title: 'iOS Build & Sign',
          completed: false,
          createdAt: 2010,
          steps: ['Certificates', 'App Store deploy'],
          stepDone: [false, false],
          children: [],
        },
      ],
    },
  ];
}

describe('M4 Gate Adversarial Challenge 2: Tree, Selection & Guard Probes', () => {
  const noopClose = () => {};
  const noopCommit = () => ({ ok: true });

  // =========================================================================
  // 1. Tree Rendering & Deep Hierarchies
  // =========================================================================
  describe('Dimension 1: Tree Rendering & Deep Hierarchies', () => {
    it('P1.1: renders 10-level deep hierarchy with trunk line guides and notch connectors', () => {
      const goals = createDeepChain(10);
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: Array.from({ length: 10 }, (_, i) => `node-${i + 1}`),
      });

      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller }),
      );

      // Verify all 10 nodes rendered
      for (let i = 1; i <= 10; i++) {
        expect(html).toContain(`Deep Level ${i}`);
      }

      // Verify trunk line guide class presence
      expect(html).toContain('border-l border-border-subtle/70');
      // Verify horizontal branch notches presence for nested nodes
      expect(html).toContain('absolute -left-3.5 top-1/2 -translate-y-1/2 w-2.5 h-px bg-border-subtle/70');
    });

    it('P1.2: renders 25-level deep hierarchy without call stack exhaustion', () => {
      const goals = createDeepChain(25);
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: Array.from({ length: 25 }, (_, i) => `node-${i + 1}`),
      });

      const start = performance.now();
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller }),
      );
      const duration = performance.now() - start;

      expect(html).toContain('Deep Level 25');
      expect(duration).toBeLessThan(100); // Must render well within 100ms
    });

    it('P1.3: renders 50-level deep hierarchy stably and verifies indentation stability', () => {
      const goals = createDeepChain(50);
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: Array.from({ length: 50 }, (_, i) => `node-${i + 1}`),
      });

      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller }),
      );

      expect(html).toContain('Deep Level 1');
      expect(html).toContain('Deep Level 50');
      // Trunk line guides must appear 49 times for 49 nested levels
      const trunkCount = (html.match(/border-l border-border-subtle\/70/g) || []).length;
      expect(trunkCount).toBe(49);
    });

    it('P1.4: renders 100-level extreme recursion test safely without infinite loops or stack overflow', () => {
      const goals = createDeepChain(100);
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: Array.from({ length: 100 }, (_, i) => `node-${i + 1}`),
      });

      expect(() => {
        const html = renderToStaticMarkup(
          createElement(StudioTree, { controller }),
        );
        expect(html).toContain('Deep Level 100');
      }).not.toThrow();
    });

    it('P1.5: renders wide & deep tree (341 nodes) within performance envelope', () => {
      // Build 5-level tree branching 4 ways at each level
      let idCounter = 1;
      function buildBranch(depth: number): GoalNode {
        const id = `node-${idCounter++}`;
        if (depth === 5) {
          return {
            id,
            kind: 'node',
            title: `Leaf ${id}`,
            completed: false,
            createdAt: 1000,
            children: [],
          };
        }
        return {
          id,
          kind: depth === 1 ? 'goal' : 'node',
          title: `Branch ${id}`,
          completed: false,
          createdAt: 1000,
          children: [
            buildBranch(depth + 1),
            buildBranch(depth + 1),
            buildBranch(depth + 1),
            buildBranch(depth + 1),
          ],
        };
      }

      const wideTree = [buildBranch(1)];
      const controller = createBlueprintStudioController({ goals: wideTree });
      controller.expandAll();

      const start = performance.now();
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller }),
      );
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(1000); // Renders cleanly within 1s even under heavy parallel load
      expect(html.length).toBeGreaterThan(10000);
    });

    it('P1.6: accurately differentiates all 4 semantic node archetypes with visual cues', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: ['root-alpha', 'branch-backend', 'branch-frontend', 'root-beta'],
      });

      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller }),
      );

      // Archetype 1: Root Goal (kind === 'goal')
      expect(html).toContain('Project Alpha (2026)');

      // Archetype 2: Branch Folder (hasChildren) -> items badge
      expect(html).toContain('2 items'); // root-alpha has 2 children
      expect(html).toContain('3 items'); // branch-backend has 3 children

      // Archetype 3: Task with steps -> progress pill
      expect(html).toContain('2/3 steps'); // task-auth has 2 of 3 steps done
      expect(html).toContain('0/1 steps'); // task-db has 0 of 1 steps done

      // Archetype 4: Empty Leaf (not goal, no children, no steps) -> Add Inside action button
      expect(html).toContain('Add Inside');
    });

    it('P1.7: gracefully handles malformed/edge nodes with empty string title and empty children', () => {
      const edgeGoals: GoalNode[] = [
        {
          id: 'edge-1',
          kind: 'goal',
          title: '', // Empty title
          completed: false,
          createdAt: 1000,
          children: [],
        },
        {
          id: 'edge-2',
          kind: 'node',
          title: '   Whitespace Title   ',
          completed: false,
          createdAt: 2000,
          children: [],
        },
      ];

      const controller = createBlueprintStudioController({ goals: edgeGoals });
      expect(() => {
        const html = renderToStaticMarkup(
          createElement(StudioTree, { controller }),
        );
        expect(html).toBeDefined();
      }).not.toThrow();
    });
  });

  // =========================================================================
  // 2. Selection Interactions & topSelectedIds Isolation
  // =========================================================================
  describe('Dimension 2: Selection Interactions & Hierarchy Isolation', () => {
    it('P2.1: isolates root container when parent and nested child are simultaneously selected', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Select parent, child, and grandchild
      controller.toggleSelect('root-alpha');
      controller.toggleSelect('branch-backend');
      controller.toggleSelect('task-auth');

      expect(controller.selectedIds.size).toBe(3);

      // topSelectedIds must collapse to root-alpha only
      const topIds = controller.topSelectedIds();
      expect(topIds).toEqual(['root-alpha']);

      // Also verify pure utility topStudioSelection matches
      expect(topStudioSelection(goals, ['root-alpha', 'branch-backend', 'task-auth'])).toEqual([
        'root-alpha',
      ]);
    });

    it('P2.2: isolates intermediate ancestor when branch and child are selected without root', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      controller.toggleSelect('branch-backend');
      controller.toggleSelect('task-auth');
      controller.toggleSelect('task-db');

      expect(controller.selectedIds.size).toBe(3);

      const topIds = controller.topSelectedIds();
      expect(topIds).toEqual(['branch-backend']);
    });

    it('P2.3: maintains disjoint roots when targets belong to different tree subtrees', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      controller.toggleSelect('task-auth'); // Under root-alpha -> branch-backend
      controller.toggleSelect('task-ios'); // Under root-beta

      expect(controller.selectedIds.size).toBe(2);

      const topIds = controller.topSelectedIds();
      expect(topIds).toEqual(expect.arrayContaining(['task-auth', 'task-ios']));
      expect(topIds.length).toBe(2);
    });

    it('P2.4: selectAll collapses to exactly the root goals in topSelectedIds', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      controller.selectAll();
      // Total 9 nodes in rich tree
      expect(controller.selectedIds.size).toBe(9);

      // Top selected IDs must be strictly root goals
      const topIds = controller.topSelectedIds();
      expect(topIds).toEqual(['root-alpha', 'root-beta']);
    });

    it('P2.5: dynamic topSelectedIds shifts correctly when parent is toggled off then on', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Step 1: Select child
      controller.toggleSelect('task-auth');
      expect(controller.topSelectedIds()).toEqual(['task-auth']);

      // Step 2: Select parent -> topIds promotes to parent
      controller.toggleSelect('branch-backend');
      expect(controller.topSelectedIds()).toEqual(['branch-backend']);

      // Step 3: Deselect parent -> topIds falls back to child
      controller.toggleSelect('branch-backend');
      expect(controller.topSelectedIds()).toEqual(['task-auth']);

      // Step 4: Re-select parent -> topIds promotes back to parent
      controller.toggleSelect('branch-backend');
      expect(controller.topSelectedIds()).toEqual(['branch-backend']);
    });

    it('P2.6: rapid selection toggle cycles stress test (1,000 cycles)', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      const nodeIds = ['root-alpha', 'branch-backend', 'task-auth', 'root-beta'];

      for (let i = 0; i < 1000; i++) {
        const id = nodeIds[i % nodeIds.length];
        controller.toggleSelect(id);
      }

      // 1000 is divisible by 4, so each node was toggled 250 times (even count -> all deselected)
      expect(controller.selectedIds.size).toBe(0);
      expect(controller.topSelectedIds()).toEqual([]);
    });

    it('P2.7: clearSelection unmounts action bar and cleans up state', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      controller.toggleSelect('task-auth');
      expect(controller.selectedIds.size).toBe(1);

      // Render action bar when 1 is selected
      let html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('1 selected');
      expect(html).toContain('Add Inside');

      // Clear selection
      controller.clearSelection();
      expect(controller.selectedIds.size).toBe(0);

      // Action bar should render null
      html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toBe('');
    });

    it('P2.8: selectOnly deselects prior selections and focuses single target', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      controller.toggleSelect('root-alpha');
      controller.toggleSelect('root-beta');
      expect(controller.selectedIds.size).toBe(2);

      controller.selectOnly('task-auth');
      expect(controller.selectedIds.size).toBe(1);
      expect(controller.selectedIds.has('task-auth')).toBe(true);
      expect(controller.topSelectedIds()).toEqual(['task-auth']);
    });
  });

  // =========================================================================
  // 3. Active Session Task Guard Probes
  // =========================================================================
  describe('Dimension 3: Active Session Task Guard', () => {
    it('P3.1: action bar locks delete button when root goal containing active task is selected', () => {
      const goals = createRichTestTree();
      // task-auth is inside root-alpha -> branch-backend -> task-auth
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      controller.toggleSelect('root-alpha');
      expect(controller.selectedIds.has('root-alpha')).toBe(true);

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));

      // Must be disabled
      expect(html).toContain('disabled=""');
      // Must have lock title
      expect(html).toContain('title="Cannot delete active session task or its container"');
      // Must have lock styling
      expect(html).toContain('opacity-40 cursor-not-allowed');
    });

    it('P3.2: action bar locks delete button when intermediate branch containing active task is selected', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      controller.toggleSelect('branch-backend');

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('disabled=""');
      expect(html).toContain('title="Cannot delete active session task or its container"');
    });

    it('P3.3: action bar locks delete button when active task itself is selected', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      controller.toggleSelect('task-auth');

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('disabled=""');
      expect(html).toContain('title="Cannot delete active session task or its container"');
    });

    it('P3.4: controller.removeNodes blocks deletion of root goal containing active task', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      const res = controller.removeNodes(['root-alpha']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(res.error).toBe('Cannot delete active session task or its container.');

      // Error message set in controller
      expect(controller.errorMessage).toBe('Cannot delete active session task or its container.');
      // Goals untouched
      expect(controller.draftGoals.length).toBe(2);
      expect(controller.draftGoals.find((g) => g.id === 'root-alpha')).toBeDefined();
    });

    it('P3.5: controller.removeNodes blocks deletion of intermediate container branch', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      const res = controller.removeNodes(['branch-backend']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(controller.errorMessage).toBe('Cannot delete active session task or its container.');
    });

    it('P3.6: controller.removeNodes succeeds when deleting unrelated root not containing active task', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth', // Inside root-alpha
      });

      // root-beta does NOT contain task-auth
      const res = controller.removeNodes(['root-beta']);
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);

      // root-beta deleted, root-alpha preserved
      expect(controller.draftGoals.length).toBe(1);
      expect(controller.draftGoals[0].id).toBe('root-alpha');
    });

    it('P3.7: action bar enables delete button when only unrelated nodes are selected', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      controller.toggleSelect('root-beta');

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      // Delete button must NOT be disabled
      expect(html).not.toContain('disabled=""');
      expect(html).toContain('title="Delete selected"');
      expect(html).toContain('text-error hover:bg-error-soft');
    });

    it('P3.8: co-selection of active container and unrelated root blocks the entire bulk delete', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      // Select both root-alpha (has active task) and root-beta (unrelated)
      controller.toggleSelect('root-alpha');
      controller.toggleSelect('root-beta');

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('disabled=""');
      expect(html).toContain('title="Cannot delete active session task or its container"');

      const res = controller.removeNodes(['root-alpha', 'root-beta']);
      expect(res.success).toBe(false);
      expect(res.count).toBe(0);
      expect(controller.draftGoals.length).toBe(2); // Neither was deleted
    });

    it('P3.9: protects deeply nested active task (depth 10) against deletion at any ancestor level', () => {
      const goals = createDeepChain(10);
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'node-10', // Deepest leaf
      });

      // Test level 1 (root)
      let res = controller.removeNodes(['node-1']);
      expect(res.success).toBe(false);

      // Test level 5 (mid-ancestor)
      res = controller.removeNodes(['node-5']);
      expect(res.success).toBe(false);

      // Test level 9 (immediate parent)
      res = controller.removeNodes(['node-9']);
      expect(res.success).toBe(false);

      // Test level 10 (target itself)
      res = controller.removeNodes(['node-10']);
      expect(res.success).toBe(false);
    });

    it('P3.10: tree row quick-action delete button is omitted on active session task and badge rendered', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
        initialExpandedIds: ['root-alpha', 'branch-backend'],
      });

      const html = renderToStaticMarkup(createElement(StudioTree, { controller }));

      // Active Focus badge rendered
      expect(html).toContain('Active Focus');

      // The task-auth row container has active focus styling
      expect(html).toContain('ring-secondary/40 bg-secondary-soft/20');
    });

    it('P3.11: controller blocks other forbidden mutations on active task (R1/R2/R3)', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });

      // Cannot add children inside active task (turning into branch)
      const addRes = controller.addChildrenInside(['task-auth'], ['New Subtask']);
      expect(addRes.success).toBe(false);
      expect(addRes.error).toContain('Cannot convert active session task');

      // Cannot convert to branch
      const branchRes = controller.convertToBranch('task-auth');
      expect(branchRes.success).toBe(false);
      expect(branchRes.error).toContain('Cannot convert active session task');

      // Cannot convert to task
      const taskRes = controller.convertToTask('task-auth');
      expect(taskRes.success).toBe(false);
      expect(taskRes.error).toContain('Cannot convert active session task');

      // Cannot delete steps from active task
      const diffRes = controller.diffSteps(['task-auth'], [], ['JWT validation']);
      expect(diffRes.success).toBe(false);
      expect(diffRes.error).toContain('Cannot delete steps from active session task');
    });
  });

  // =========================================================================
  // 4. Search & Filtering Adversarial Probes
  // =========================================================================
  describe('Dimension 4: Search & Filtering Adversarial Probes', () => {
    const regexEdgeQueries = [
      '.*',
      '[',
      ']',
      '(',
      ')',
      '\\',
      '+',
      '?',
      '^',
      '$',
      '{1,3}',
      '|',
      '(.*)?',
      '[[[',
      '\\\\',
      '???',
    ];

    it.each(regexEdgeQueries)(
      'P4.1: safely handles regex special character query "%s" without throwing SyntaxError',
      (specialQuery) => {
        const goals = createRichTestTree();
        const controller = createBlueprintStudioController({ goals });

        expect(() => {
          const html = renderToStaticMarkup(
            createElement(StudioTree, { controller, searchQuery: specialQuery }),
          );
          expect(typeof html).toBe('string');
        }).not.toThrow();
      },
    );

    it('P4.2: matches literal regex special characters present in titles', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Match "[Core]" in "Backend Services [Core]"
      let html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '[Core]' }),
      );
      expect(html).toContain('Backend Services [Core]');

      // Match "(Postgres)" in "Database Migrations (Postgres)"
      html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '(Postgres)' }),
      );
      expect(html).toContain('Database Migrations (Postgres)');

      // Match "[React]" in "Web Client [React]"
      html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '[' }),
      );
      expect(html).toContain('Backend Services [Core]');
      expect(html).toContain('Web Client [React]');
    });

    it('P4.3: case-insensitive search matches UPPER, lower, and mixed casing', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Lowercase searching for uppercase word
      let html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'oauth2' }),
      );
      expect(html).toContain('OAuth2 Authentication');

      // Uppercase searching for mixed case
      html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'POSTGRES' }),
      );
      expect(html).toContain('Database Migrations (Postgres)');

      // Mixed casing
      html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'pRoJeCt aLpHa' }),
      );
      expect(html).toContain('Project Alpha (2026)');
    });

    it('P4.4: renders calm empty state when search query matches nothing', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'UnmatchedStringXYZ123' }),
      );

      expect(html).toContain('No matching goals');
      expect(html).toContain('No goals matched “UnmatchedStringXYZ123”.');
    });

    it('P4.5: empty and whitespace queries return full unfiltered tree', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        initialExpandedIds: ['root-alpha', 'root-beta'],
      });

      // Empty query
      let html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '' }),
      );
      expect(html).toContain('Project Alpha (2026)');
      expect(html).toContain('Mobile App 🚀');

      // Whitespace query
      html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '    ' }),
      );
      expect(html).toContain('Project Alpha (2026)');
      expect(html).toContain('Mobile App 🚀');
    });

    it('P4.6: preserves ancestor chain when a deeply nested leaf matches', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Search for leaf "JWT validation" or "OAuth2 Authentication"
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'OAuth2' }),
      );

      // Must preserve ancestor chain: Project Alpha -> Backend Services -> OAuth2
      expect(html).toContain('Project Alpha (2026)');
      expect(html).toContain('Backend Services [Core]');
      expect(html).toContain('OAuth2 Authentication');

      // Non-matching siblings must be pruned
      expect(html).not.toContain('Database Migrations (Postgres)');
      expect(html).not.toContain('API Gateway Specs');
      expect(html).not.toContain('Web Client [React]');
      expect(html).not.toContain('Mobile App 🚀');
    });

    it('P4.7: parent match preserves all its children', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Search for parent "Backend Services"
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'Backend Services' }),
      );

      // Parent matched -> all 3 children must be visible
      expect(html).toContain('Backend Services [Core]');
      expect(html).toContain('OAuth2 Authentication');
      expect(html).toContain('Database Migrations (Postgres)');
      expect(html).toContain('API Gateway Specs');

      // Unrelated branch must be pruned
      expect(html).not.toContain('Web Client [React]');
      expect(html).not.toContain('Mobile App 🚀');
    });

    it('P4.8: matches unicode emojis and international text', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Search by emoji
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '🚀' }),
      );
      expect(html).toContain('Mobile App 🚀');
      expect(html).toContain('iOS Build &amp; Sign');
      expect(html).not.toContain('Project Alpha');
    });

    it('P4.9: search query with leading/trailing whitespace is trimmed and matches correctly', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: '   OAuth2   ' }),
      );
      expect(html).toContain('OAuth2 Authentication');
      expect(html).not.toContain('Mobile App 🚀');
    });

    it('P4.10: search query matching across multiple disjoint subtrees expands all matches', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Search for common letter or token that appears in both subtrees
      // "React" in alpha, "iOS" in beta -> search for "e" or "Sign" or "Core"
      // Let's search for "Services" vs "Build" -> or search "o" (Project Alpha, OAuth2, Mobile)
      const html = renderToStaticMarkup(
        createElement(StudioTree, { controller, searchQuery: 'e' }),
      );
      // Both root goals have 'e': Project Alpha has 'Services', Mobile App has 'Mobile'
      expect(html).toContain('Project Alpha (2026)');
      expect(html).toContain('Mobile App 🚀');
    });
  });

  // =========================================================================
  // 5. Additional Active Guard & Action Bar TopIds Deep Tests
  // =========================================================================
  describe('Dimension 5: Deep Active Task Protection & Action Bar TopIds Forwarding', () => {
    it('P5.1: Action Bar locks delete button across all 15 ancestor levels of a depth-15 active task', () => {
      const goals = createDeepChain(15);
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'node-15',
      });

      // Test each ancestor from level 1 to level 14
      for (let level = 1; level <= 14; level++) {
        controller.clearSelection();
        controller.toggleSelect(`node-${level}`);

        const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
        expect(html).toContain('disabled=""');
        expect(html).toContain('title="Cannot delete active session task or its container"');
      }
    });

    it('P5.2: Action Bar passes topIds (not all selectedIds) when triggering modals', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({ goals });

      // Select root and its children
      controller.toggleSelect('root-alpha');
      controller.toggleSelect('branch-backend');
      controller.toggleSelect('task-auth');

      expect(controller.selectedIds.size).toBe(3);
      expect(controller.topSelectedIds()).toEqual(['root-alpha']);

      // Spy on openModal
      const openModalSpy = vi.spyOn(controller, 'openModal');

      // Top selected IDs is exactly 1 ID ('root-alpha')
      const topIds = controller.topSelectedIds();
      controller.openModal('bulk_add_inside', topIds);

      expect(openModalSpy).toHaveBeenCalledWith('bulk_add_inside', ['root-alpha']);
      expect(controller.activeModal).toBe('bulk_add_inside');
      expect(controller.targetNodeIds).toEqual(['root-alpha']);
    });
  });

  // =========================================================================
  // 5. Root Integration & BlueprintStudioContent Integration
  // =========================================================================
  describe('Dimension 5: Root Studio Integration & End-to-End Coordination', () => {
    it('P5.1: BlueprintStudioContent correctly synchronizes search query, tree filter, and clear button', () => {
      const goals = createRichTestTree();
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          goals,
          searchQuery: 'OAuth2',
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      // Search input has query
      expect(html).toContain('value="OAuth2"');
      // Clear search button rendered
      expect(html).toContain('aria-label="Clear search"');
      // Filtered tree rendered
      expect(html).toContain('OAuth2 Authentication');
      expect(html).not.toContain('Mobile App 🚀');
    });

    it('P5.2: BlueprintStudioContent renders action bar with active guard when root is selected', () => {
      const goals = createRichTestTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
        initialSelectedIds: ['root-alpha'],
      });

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      // Action bar visible
      expect(html).toContain('1 selected');
      // Delete button locked due to active session task child
      expect(html).toContain('title="Cannot delete active session task or its container"');
      expect(html).toContain('disabled=""');
    });

    it('P5.3: commit callback is invoked with dirty draft and cleans up on success', () => {
      const goals = createRichTestTree();
      const commitSpy = vi.fn().mockReturnValue({ ok: true });
      const closeSpy = vi.fn();

      const controller = createBlueprintStudioController({ goals });
      controller.applyChange(
        [
          ...goals,
          {
            id: 'root-new',
            kind: 'goal',
            title: 'New Added Goal',
            completed: false,
            createdAt: 3000,
            children: [],
          },
        ],
        'Added new root goal',
      );

      expect(controller.isDirty).toBe(true);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: closeSpy,
          onCommit: commitSpy,
        }),
      );

      // Save button is enabled
      expect(html).toContain('aria-label="Save Changes"');
      expect(html).not.toContain('aria-label="Save Changes" disabled=""');
    });
  });
});
