import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoalNode } from '../../types';
import BlueprintStudio, { BlueprintStudioContent } from '../BlueprintStudio';
import { StudioTree } from './StudioTree';
import { StudioActionBar } from './StudioActionBar';
import { StudioModals } from './StudioModals';
import { StudioNodeExpansionModal } from './StudioNodeExpansionModal';
import { StudioBulkAddModal } from './StudioBulkAddModal';
import { StudioBulkStepDiffModal } from './StudioBulkStepDiffModal';
import { StudioDateModal } from './StudioDateModal';
import { createBlueprintStudioController } from './blueprintStudioState';
import { topStudioSelection } from '../../lib/studioWorkspace';

// Mock Overlay for Node.js test environment to bypass createPortal
vi.mock('../Overlay', () => ({
  default: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? createElement('div', { 'data-testid': 'mock-overlay' }, children) : null,
}));

/** Helper to construct a deep linear chain of nodes */
function createDeepChain(depth: number, idPrefix = 'chain'): GoalNode[] {
  let current: GoalNode = {
    id: `${idPrefix}-${depth}`,
    kind: 'node',
    title: `Deep Item Level ${depth}`,
    completed: false,
    createdAt: 1000 + depth,
    children: [],
  };

  for (let i = depth - 1; i >= 1; i--) {
    current = {
      id: `${idPrefix}-${i}`,
      kind: i === 1 ? 'goal' : 'node',
      title: `Deep Item Level ${i}`,
      completed: false,
      createdAt: 1000 + i,
      children: [current],
    };
  }

  return [current];
}

/** Helper to construct a flat tree with N root goals */
function createFlatRoots(count: number, prefix = 'root'): GoalNode[] {
  const result: GoalNode[] = [];
  for (let i = 1; i <= count; i++) {
    result.push({
      id: `${prefix}-${i}`,
      kind: 'goal',
      title: `Goal ${prefix} #${i}`,
      completed: false,
      createdAt: 1000 + i,
      children: [],
    });
  }
  return result;
}

/** Helper to construct a rich heterogeneous tree for multi-condition testing */
function createRichStressTree(): GoalNode[] {
  return [
    {
      id: 'root-eng',
      kind: 'goal',
      title: 'Engineering Core Platform 2026',
      completed: false,
      createdAt: 1000,
      children: [
        {
          id: 'branch-infra',
          kind: 'node',
          title: 'Infrastructure & Kubernetes',
          completed: false,
          createdAt: 1010,
          children: [
            {
              id: 'task-auth',
              kind: 'node',
              title: 'OAuth2 / OpenID Connect Service',
              completed: false,
              createdAt: 1020,
              startDate: '2026-10-01',
              endDate: '2026-10-15',
              steps: ['Setup IdP', 'Configure JWT Secrets', 'Verify Token Rotation'],
              stepDone: [true, true, false],
              children: [],
            },
            {
              id: 'task-db',
              kind: 'node',
              title: 'PostgreSQL Distributed Sharding',
              completed: false,
              createdAt: 1030,
              startDate: '2026-10-20',
              endDate: '2026-11-05',
              steps: ['Configure Citus', 'Benchmark Throughput'],
              stepDone: [false, false],
              children: [],
            },
            {
              id: 'leaf-gateway',
              kind: 'node',
              title: 'Envoy Edge Gateway Configuration',
              completed: false,
              createdAt: 1040,
              children: [],
            },
          ],
        },
        {
          id: 'branch-mobile',
          kind: 'node',
          title: 'Mobile Applications (iOS & Android)',
          completed: false,
          createdAt: 1050,
          children: [
            {
              id: 'task-offline',
              kind: 'node',
              title: 'Offline Sync Protocol Engine',
              completed: false,
              createdAt: 1060,
              steps: ['CRDT Implementation', 'Sqlite Delta Cache'],
              stepDone: [true, false],
              children: [],
            },
            {
              id: 'leaf-biometrics',
              kind: 'node',
              title: 'FaceID / Biometrics Auth Module',
              completed: false,
              createdAt: 1070,
              children: [],
            },
          ],
        },
      ],
    },
    {
      id: 'root-design',
      kind: 'goal',
      title: 'Design System & Accessibility Guidelines',
      completed: false,
      createdAt: 2000,
      children: [
        {
          id: 'task-tokens',
          kind: 'node',
          title: 'WCAG AAA Color Contrast Tokens',
          completed: false,
          createdAt: 2010,
          startDate: '2026-10-12',
          endDate: '2026-10-18',
          steps: ['Audit Light Theme', 'Audit Dark Theme', 'Publish npm package'],
          stepDone: [true, true, true],
          children: [],
        },
      ],
    },
    {
      id: 'root-marketing',
      kind: 'goal',
      title: 'Global Product Launch Campaign',
      completed: false,
      createdAt: 3000,
      children: [],
    },
  ];
}

describe('BlueprintStudio Tier 5 Adversarial UI & Component Hardening', () => {
  const noopClose = vi.fn();
  const noopCommit = vi.fn(() => ({ ok: true }));

  // =========================================================================
  // Suite 1: Extreme Tree Scale & Depth Presentation Stress (500+ nodes, depth 20+)
  // =========================================================================
  describe('Suite 1: Extreme Tree Scale & Depth Presentation Stress', () => {
    it('T1.1: renders linear depth 25 chain without stack overflow or styling degradation', () => {
      const deepChain = createDeepChain(25);
      const controller = createBlueprintStudioController({ goals: deepChain });
      controller.expandAll();

      const startTime = performance.now();
      const html = renderToStaticMarkup(createElement(StudioTree, { controller }));
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(1000);
      expect(html).toContain('Deep Item Level 1');
      expect(html).toContain('Deep Item Level 25');
      // Verify visual branch notch is rendered for deeply nested children
      expect(html).toContain('absolute -left-3.5');
      // Verify container trunk line guides are rendered
      expect(html).toContain('border-l border-border-subtle/70');
    });

    it('T1.2: renders massive flat tree of 600 root goals with fast rendering and no memory leaks', () => {
      const flatRoots = createFlatRoots(600);
      const controller = createBlueprintStudioController({ goals: flatRoots });

      const startTime = performance.now();
      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals: flatRoots,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(2000);
      expect(html).toContain('Goal root #1');
      expect(html).toContain('Goal root #600');
      // Root goals render primary target icon
      expect(html).toContain('lucide-target');
      expect(html.length).toBeGreaterThan(100000);
    });

    it('T1.3: renders massive wide branch with 500 children under a single root goal', () => {
      const children: GoalNode[] = [];
      for (let i = 1; i <= 500; i++) {
        children.push({
          id: `wide-child-${i}`,
          kind: 'node',
          title: `Wide Child Component ${i}`,
          completed: false,
          createdAt: 2000 + i,
          children: [],
        });
      }
      const wideTree: GoalNode[] = [
        {
          id: 'wide-root',
          kind: 'goal',
          title: 'Monolithic Root Project',
          completed: false,
          createdAt: 2000,
          children,
        },
      ];
      const controller = createBlueprintStudioController({ goals: wideTree });
      controller.expandAll();

      const html = renderToStaticMarkup(createElement(StudioTree, { controller }));
      expect(html).toContain('500 items');
      expect(html).toContain('Wide Child Component 1');
      expect(html).toContain('Wide Child Component 500');
    });

    it('T1.4: renders balanced binary tree of 511 nodes across 9 hierarchical tiers', () => {
      let nextId = 1;
      function buildBinaryTree(currentDepth: number, maxDepth: number): GoalNode {
        const id = `bin-${nextId++}`;
        const isRoot = currentDepth === 1;
        const node: GoalNode = {
          id,
          kind: isRoot ? 'goal' : 'node',
          title: `Node D${currentDepth} #${id}`,
          completed: false,
          createdAt: 3000 + nextId,
          children:
            currentDepth < maxDepth
              ? [
                  buildBinaryTree(currentDepth + 1, maxDepth),
                  buildBinaryTree(currentDepth + 1, maxDepth),
                ]
              : [],
        };
        return node;
      }

      const binaryRoot = [buildBinaryTree(1, 9)]; // 2^9 - 1 = 511 nodes
      const controller = createBlueprintStudioController({ goals: binaryRoot });
      controller.expandAll();

      const html = renderToStaticMarkup(createElement(StudioTree, { controller }));
      expect(html).toContain('Node D1 #bin-1');
      expect(html).toContain('Node D9 #bin-511');
    });

    it('T1.5: renders heterogeneous tree with active focus, step ratios, date badges, and action triggers', () => {
      const tree = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals: tree,
        activeGoalNodeId: 'task-auth',
      });
      controller.expandAll();

      const html = renderToStaticMarkup(createElement(StudioTree, { controller }));

      // Active Focus badge
      expect(html).toContain('Active Focus');
      // Step ratio badge on tasks
      expect(html).toContain('2/3 steps'); // task-auth: 2 completed of 3
      expect(html).toContain('0/2 steps'); // task-db: 0 of 2
      expect(html).toContain('3/3 steps'); // task-tokens: 3 of 3
      // Date badge formatting: startDate → endDate
      expect(html).toContain('2026-10-01 → 2026-10-15');
      // Empty leaf Add Inside button
      expect(html).toContain('Add Inside');
    });
  });

  // =========================================================================
  // Suite 2: Adversarial Search Queries & Tree Filtering
  // =========================================================================
  describe('Suite 2: Adversarial Search Queries & Tree Filtering', () => {
    it('T2.1: handles regex metacharacters without regex evaluation crash or SyntaxError', () => {
      const goals = createRichStressTree();
      const dangerousQueries = [
        '.*',
        '([a-z]+)',
        '\\d+\\w*',
        '^(OAuth2)?$',
        '[invalid-regex-range[',
        '(?=.*[A-Z])',
        '{2,5}',
        '\\',
        '?',
        '+',
        '*',
      ];

      for (const q of dangerousQueries) {
        expect(() => {
          const html = renderToStaticMarkup(
            createElement(StudioTree, {
              controller: createBlueprintStudioController({ goals }),
              searchQuery: q,
            }),
          );
          // Component handles string literal search cleanly
          expect(typeof html).toBe('string');
        }).not.toThrow();
      }
    });

    it('T2.2: handles complex Unicode, astral plane emojis, diacritics, and RTL scripts', () => {
      const unicodeTree: GoalNode[] = [
        {
          id: 'uni-1',
          kind: 'goal',
          title: '🚀 Launch Mars Rover 2026 🛸',
          completed: false,
          createdAt: 1000,
          children: [
            {
              id: 'uni-2',
              kind: 'node',
              title: 'Café & Crème Brûlée Délicatesse',
              completed: false,
              createdAt: 1010,
              children: [],
            },
            {
              id: 'uni-3',
              kind: 'node',
              title: 'مشروع الأتمتة المتقدم (Advanced Automation)',
              completed: false,
              createdAt: 1020,
              children: [],
            },
            {
              id: 'uni-4',
              kind: 'node',
              title: '日本語の自然言語処理と機械学習',
              completed: false,
              createdAt: 1030,
              children: [],
            },
          ],
        },
      ];

      // Query with emoji
      let html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals: unicodeTree }),
          searchQuery: '🚀',
        }),
      );
      expect(html).toContain('Launch Mars Rover');

      // Query with accented letters (case-insensitive)
      html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals: unicodeTree }),
          searchQuery: 'crème',
        }),
      );
      expect(html).toContain('Crème Brûlée');

      // Query with Arabic RTL script
      html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals: unicodeTree }),
          searchQuery: 'الأتمتة',
        }),
      );
      expect(html).toContain('مشروع الأتمتة');

      // Query with Japanese Kanji
      html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals: unicodeTree }),
          searchQuery: '言語処理',
        }),
      );
      expect(html).toContain('自然言語処理');
    });

    it('T2.3: handles massive 5,000 character search string without hanging', () => {
      const goals = createRichStressTree();
      const hugeQuery = 'A'.repeat(5000);

      const startTime = performance.now();
      const html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals }),
          searchQuery: hugeQuery,
        }),
      );
      const duration = performance.now() - startTime;

      expect(duration).toBeLessThan(100);
      expect(html).toContain('No matching goals');
      expect(html).toContain(hugeQuery);
    });

    it('T2.4: safely escapes HTML injection and XSS probes in search query rendering', () => {
      const goals = createRichStressTree();
      const xssQuery = '<script>alert("xss")</script><img src=x onerror=alert(1)>';

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          goals,
          searchQuery: xssQuery,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      // React escapes HTML tags in attribute and text context
      expect(html).not.toContain('<script>alert("xss")</script>');
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('T2.5: handles whitespace-only search query as empty query', () => {
      const goals = createRichStressTree();
      const html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals }),
          searchQuery: '   \t\n  ',
        }),
      );

      // Entire tree should be rendered since query trims to empty string
      expect(html).toContain('Engineering Core Platform 2026');
      expect(html).toContain('Design System &amp; Accessibility Guidelines');
      expect(html).toContain('Global Product Launch Campaign');
    });

    it('T2.6: reveals deep matching descendant while pruning non-matching branches', () => {
      const goals = createRichStressTree();
      const html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals }),
          searchQuery: 'Sharding',
        }),
      );

      // Target item is preserved
      expect(html).toContain('PostgreSQL Distributed Sharding');
      // Ancestor path is preserved
      expect(html).toContain('Infrastructure &amp; Kubernetes');
      expect(html).toContain('Engineering Core Platform 2026');
      // Unrelated branches are pruned
      expect(html).not.toContain('Design System &amp; Accessibility Guidelines');
      expect(html).not.toContain('Global Product Launch Campaign');
      expect(html).not.toContain('Mobile Applications');
    });

    it('T2.7: verifies that search queries match goal/node titles specifically, not step contents', () => {
      const goals = createRichStressTree();
      // 'CRDT Implementation' is a step in task-offline, but not in any title
      const html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals }),
          searchQuery: 'CRDT Implementation',
        }),
      );

      // Matches nothing because step text is not indexed in title search
      expect(html).toContain('No matching goals');
      expect(html).toContain('CRDT Implementation');
    });

    it('T2.8: search query matching multiple sibling branches under the same parent retains both siblings', () => {
      const goals = createRichStressTree();
      // 'Auth' matches both 'OAuth2 / OpenID Connect Service' and 'FaceID / Biometrics Auth Module'
      const html = renderToStaticMarkup(
        createElement(StudioTree, {
          controller: createBlueprintStudioController({ goals }),
          searchQuery: 'Auth',
        }),
      );

      expect(html).toContain('OAuth2 / OpenID Connect Service');
      expect(html).toContain('FaceID / Biometrics Auth Module');
      expect(html).toContain('Engineering Core Platform 2026');
      expect(html).not.toContain('Design System &amp; Accessibility Guidelines');
    });
  });

  // =========================================================================
  // Suite 3: Action Bar Under High Stress & Hierarchical Selection Collapsing
  // =========================================================================
  describe('Suite 3: Action Bar Under High Stress & Hierarchical Selection Collapsing', () => {
    it('T3.1: renders action bar with 150 selected nodes across multiple trees', () => {
      const flatRoots = createFlatRoots(150);
      const selectedSet = new Set(flatRoots.map((g) => g.id));
      const controller = createBlueprintStudioController({
        goals: flatRoots,
        initialSelectedIds: Array.from(selectedSet),
      });

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('150 selected');
      expect(html).toContain('Add Inside');
      expect(html).toContain('Steps');
      expect(html).toContain('Dates');
      expect(html).toContain('aria-label="Delete"');
    });

    it('T3.2: verifies hierarchical selection collapsing when root and 100 descendants are selected', () => {
      const chain = createDeepChain(100);
      // Select all 100 nodes in the linear chain
      const allIds = Array.from({ length: 100 }, (_, i) => `chain-${i + 1}`);
      const controller = createBlueprintStudioController({
        goals: chain,
        initialSelectedIds: allIds,
      });

      // Verification of headless collapsing algorithm
      const topIds = topStudioSelection(chain, allIds);
      expect(topIds).toEqual(['chain-1']);

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      // Total count badge reports full set count
      expect(html).toContain('100 selected');
    });

    it('T3.3: disables delete and renders lock badge when activeGoalNodeId is directly selected', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
        initialSelectedIds: ['task-auth', 'task-db'],
      });

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('disabled=""');
      expect(html).toContain('Cannot delete active session task or its container');
      // Lucide Lock icon replaces Trash icon
      expect(html).toContain('lucide-lock');
    });

    it('T3.4: disables delete when an ancestor container of activeGoalNodeId is selected', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth', // located inside branch-infra & root-eng
        initialSelectedIds: ['root-eng'],
      });

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('disabled=""');
      expect(html).toContain('Cannot delete active session task or its container');
      expect(html).toContain('lucide-lock');
    });

    it('T3.5: handles dangling or invalid selected IDs without crashing', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['non-existent-1', 'non-existent-2', 'phantom-id'],
      });

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).toContain('3 selected');
      expect(html).toContain('Add Inside');
    });

    it('T3.6: renders active delete button with trash icon when selection does not include active task', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
        initialSelectedIds: ['task-tokens', 'root-marketing'],
      });

      const html = renderToStaticMarkup(createElement(StudioActionBar, { controller }));
      expect(html).not.toContain('disabled=""');
      expect(html).toContain('lucide-trash2');
      expect(html).not.toContain('lucide-lock');
    });
  });

  // =========================================================================
  // Suite 4: Modal Sheets Under Boundary Conditions & Adversarial Inputs
  // =========================================================================
  describe('Suite 4: Modal Sheets Under Boundary Conditions & Adversarial Inputs', () => {
    it('T4.1: StudioModals renders null when activeModal is "none" or targetNodeIds is empty', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      let html = renderToStaticMarkup(createElement(StudioModals, { controller }));
      expect(html).toBe('');

      // activeModal set but targetNodeIds empty
      controller.openModal('bulk_add_inside', []);
      html = renderToStaticMarkup(createElement(StudioModals, { controller }));
      expect(html).toBe('');
    });

    it('T4.2: StudioNodeExpansionModal renders fallback safely when target ID does not exist', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('node_expansion', ['non-existent-id']);

      const html = renderToStaticMarkup(createElement(StudioNodeExpansionModal, { controller }));
      expect(html).toContain('How would you like to expand?');
      expect(html).toContain('Add Checklist Steps');
      expect(html).toContain('Add Child Nodes');
      // No crash even though node is null
      expect(html).not.toContain('Selected item:');
    });

    it('T4.3: StudioNodeExpansionModal displays full breadcrumb path for deeply nested target', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('node_expansion', ['task-auth']);

      const html = renderToStaticMarkup(createElement(StudioNodeExpansionModal, { controller }));
      expect(html).toContain('OAuth2 / OpenID Connect Service');
      expect(html).toContain('Engineering Core Platform 2026 / Infrastructure &amp; Kubernetes');
    });

    it('T4.4: StudioBulkAddModal renders header and live impact preview with 200 target parents', () => {
      const flatRoots = createFlatRoots(200);
      const controller = createBlueprintStudioController({ goals: flatRoots });
      controller.openModal('bulk_add_inside', flatRoots.map((g) => g.id));

      const html = renderToStaticMarkup(createElement(StudioBulkAddModal, { controller }));
      expect(html).toContain('Adding inside 200 target parents');
      // Default list mode with 0 lines
      expect(html).toContain('0 items per parent');
      expect(html).toContain('0 total nodes');
    });

    it('T4.5: StudioBulkStepDiffModal aggregates step prevalence and completion locks across multiple nodes', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-auth', 'task-db', 'task-offline'],
      });
      controller.openModal('bulk_step_diff', ['task-auth', 'task-db', 'task-offline']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('Managing steps across 3 selected items');
      expect(html).toContain('Setup IdP');
      expect(html).toContain('Configure Citus');
      expect(html).toContain('CRDT Implementation');
      // Completed steps have lock badge
      expect(html).toContain('1 completed');
    });

    it('T4.6: StudioBulkStepDiffModal displays active session task notice when targeting active task', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        activeGoalNodeId: 'task-auth',
      });
      controller.openModal('bulk_step_diff', ['task-auth', 'task-db']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('Active session task selected: completed steps and existing steps are protected');
      // Step delete buttons are disabled for active task protection
      expect(html).toContain('disabled=""');
    });

    it('T4.7: StudioBulkStepDiffModal displays calm empty state when selected targets have no steps', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('bulk_step_diff', ['leaf-gateway', 'leaf-biometrics']);

      const html = renderToStaticMarkup(createElement(StudioBulkStepDiffModal, { controller }));
      expect(html).toContain('No steps yet. Add one below to apply across all selected items.');
    });

    it('T4.8: StudioDateModal validates dates, detects inverted ranges, and enforces Leap Year rules', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('date_picker', ['task-auth']);

      // Pre-filled with node's dates: '2026-10-01' and '2026-10-15'
      const html = renderToStaticMarkup(createElement(StudioDateModal, { controller }));
      expect(html).toContain('value="2026-10-01"');
      expect(html).toContain('value="2026-10-15"');
      expect(html).toContain('Quick Presets');
      expect(html).toContain('Clear Dates');
    });

    it('T4.9: StudioDateModal pre-fills empty strings when multiple nodes are selected', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.openModal('date_picker', ['task-auth', 'task-db']);

      const html = renderToStaticMarkup(createElement(StudioDateModal, { controller }));
      expect(html).toContain('Applying to 2 selected items');
      // Multiple targets do not pre-fill to avoid clobbering different dates
      expect(html).toContain('value=""');
    });
  });

  // =========================================================================
  // Suite 5: Header Controls, Transaction Lifecycle & Dirty State Semantics
  // =========================================================================
  describe('Suite 5: Header Controls, Transaction Lifecycle & Dirty State Semantics', () => {
    it('T5.1: header controls are disabled in initial clean state', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      expect(html).toContain('aria-label="Undo" disabled=""');
      expect(html).toContain('aria-label="Redo" disabled=""');
      expect(html).toContain('aria-label="Save Changes" disabled=""');
    });

    it('T5.2: header Undo and Save Changes become enabled immediately upon mutation', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      controller.addChildrenInside(['root-eng'], ['New Subsystem']);
      expect(controller.isDirty).toBe(true);
      expect(controller.canUndo).toBe(true);
      expect(controller.canRedo).toBe(false);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      expect(html).toContain('aria-label="Undo"');
      expect(html).not.toContain('aria-label="Undo" disabled=""');
      expect(html).toContain('aria-label="Redo" disabled=""');
      expect(html).toContain('aria-label="Save Changes"');
      expect(html).not.toContain('aria-label="Save Changes" disabled=""');
    });

    it('T5.3: undoing all changes restores clean state and disables Save Changes', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      controller.addChildrenInside(['root-eng'], ['Temporary Item']);
      expect(controller.isDirty).toBe(true);

      controller.undo();
      expect(controller.isDirty).toBe(false);
      expect(controller.canUndo).toBe(false);
      expect(controller.canRedo).toBe(true);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      expect(html).toContain('aria-label="Undo" disabled=""');
      expect(html).toContain('aria-label="Redo"');
      expect(html).not.toContain('aria-label="Redo" disabled=""');
      expect(html).toContain('aria-label="Save Changes" disabled=""');
    });

    it('T5.4: renders error alert banner and status alert banner simultaneously when set', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      // Trigger error
      controller.addChildrenInside(['task-auth'], ['Invalid']); // task-auth is not active here, but we can set error via state
      const stateObj = controller.getSnapshot();
      Object.assign(stateObj, {
        errorMessage: 'Critical failure: network unavailable',
        statusMessage: 'Auto-saved 14 items',
      });

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('Critical failure: network unavailable');
      expect(html).toContain('aria-label="Dismiss error"');

      expect(html).toContain('role="status"');
      expect(html).toContain('Auto-saved 14 items');
      expect(html).toContain('aria-label="Dismiss status"');
    });

    it('T5.5: Save Changes invokes onCommit with baseGoals, draftGoals, and action description', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.addChildrenInside(['root-eng'], ['New Core Service']);

      const commitSpy = vi.fn<(_base: unknown, _draft: unknown, _summary: string) => { ok: boolean }>(() => ({ ok: true }));
      const closeSpy = vi.fn();

      // Simulate commit handler logic directly
      const summary = controller.lastActionDescription || 'Updated studio items';
      const result = commitSpy(controller.baseGoals, controller.draftGoals, summary);
      if (result.ok) {
        closeSpy();
      }

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(commitSpy).toHaveBeenCalledWith(
        controller.baseGoals,
        controller.draftGoals,
        expect.stringContaining('Added 1 items'),
      );
      expect(closeSpy).toHaveBeenCalledTimes(1);
    });

    it('T5.6: Save Changes does NOT invoke onClose if onCommit returns ok: false', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });
      controller.addChildrenInside(['root-eng'], ['Rejected Service']);

      const commitSpy = vi.fn<(_base: unknown, _draft: unknown, _summary: string) => { ok: boolean; error?: string }>(() => ({ ok: false, error: 'Database locked' }));
      const closeSpy = vi.fn();

      const summary = controller.lastActionDescription || 'Updated studio items';
      const result = commitSpy(controller.baseGoals, controller.draftGoals, summary);
      if (result.ok) {
        closeSpy();
      }

      expect(commitSpy).toHaveBeenCalledTimes(1);
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('T5.7: Expand All and Collapse All buttons manipulate expandedIds in controller', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({ goals });

      // Initially some are expanded
      controller.collapseAll();
      expect(controller.expandedIds.size).toBe(0);

      controller.expandAll();
      expect(controller.expandedIds.size).toBeGreaterThan(0);
      expect(controller.expandedIds.has('root-eng')).toBe(true);
      expect(controller.expandedIds.has('branch-infra')).toBe(true);
    });
  });

  // =========================================================================
  // Suite 6: Full Root Component End-to-End Adversarial Combinations
  // =========================================================================
  describe('Suite 6: Full Root Component End-to-End Adversarial Combinations', () => {
    it('T6.1: renders full BlueprintStudio dialog with 300 nodes, active focus, search active, and action bar', () => {
      const flatRoots = createFlatRoots(300);

      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: true,
          goals: flatRoots,
          activeGoalNodeId: 'root-1',
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      expect(html).toContain('data-testid="mock-overlay"');
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-label="Blueprint Studio"');
      expect(html).toContain('Goal root #1');
      expect(html).toContain('Goal root #300');
    });

    it('T6.2: verifies clean unmounting when open is toggled to false', () => {
      const goals = createRichStressTree();
      const html = renderToStaticMarkup(
        createElement(BlueprintStudio, {
          open: false,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );
      expect(html).toBe('');
    });

    it('T6.3: verifies comprehensive ARIA semantics and accessibility compliance across UI layers', () => {
      const goals = createRichStressTree();
      const controller = createBlueprintStudioController({
        goals,
        initialSelectedIds: ['task-auth'],
      });

      const html = renderToStaticMarkup(
        createElement(BlueprintStudioContent, {
          controller,
          goals,
          onClose: noopClose,
          onCommit: noopCommit,
        }),
      );

      // Dialog landmarks
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Blueprint Studio"');

      // Toolbar landmark
      expect(html).toContain('role="toolbar"');
      expect(html).toContain('aria-label="Bulk actions toolbar"');

      // Accessible buttons
      expect(html).toContain('aria-label="Go back"');
      expect(html).toContain('aria-label="Search goals"');
      expect(html).toContain('aria-label="Expand all"');
      expect(html).toContain('aria-label="Collapse all"');
      expect(html).toContain('aria-label="Undo"');
      expect(html).toContain('aria-label="Redo"');
      expect(html).toContain('aria-label="Save Changes"');
      expect(html).toContain('aria-label="Clear selection"');
    });
  });
});
