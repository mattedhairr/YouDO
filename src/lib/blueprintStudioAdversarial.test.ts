import { describe, it, expect } from 'vitest';
import type { GoalNode } from '../types';
import {
  diffBlueprintSteps,
  addBlueprintChildrenBulk,
} from './blueprintStudio';
import { findGoal } from './goalTree';

function collectAllNodeIds(nodes: GoalNode[]): string[] {
  const ids: string[] = [];
  const walk = (n: GoalNode) => {
    ids.push(n.id);
    n.children.forEach(walk);
  };
  nodes.forEach(walk);
  return ids;
}

function createSampleTree(): GoalNode[] {
  const root1: GoalNode = {
    id: 'g-root-1',
    kind: 'goal',
    title: 'Master TypeScript',
    completed: false,
    createdAt: 1000,
    children: [
      {
        id: 'branch-1',
        kind: 'node',
        title: 'Core Concepts',
        completed: false,
        createdAt: 1001,
        children: [
          {
            id: 'task-1',
            kind: 'node',
            title: 'Generics',
            steps: ['Read docs', 'Write exercises', 'Build utility'],
            stepDone: [true, false, false],
            completed: false,
            createdAt: 1002,
            children: [],
          },
          {
            id: 'task-2',
            kind: 'node',
            title: 'Conditional Types',
            steps: ['Read handbook', 'Practice distributive cases'],
            stepDone: [true, true],
            completed: true,
            createdAt: 1003,
            children: [],
          },
        ],
      },
      {
        id: 'task-3',
        kind: 'node',
        title: 'Mapped Types',
        steps: ['Syntax review'],
        stepDone: [false],
        completed: false,
        createdAt: 1004,
        children: [],
      },
    ],
  };

  const root2: GoalNode = {
    id: 'g-root-2',
    kind: 'goal',
    title: 'Learn Rust',
    completed: false,
    createdAt: 2000,
    children: [
      {
        id: 'task-4',
        kind: 'node',
        title: 'Ownership',
        steps: ['Borrow checker basics', 'Lifetimes overview'],
        stepDone: [true, false],
        completed: false,
        createdAt: 2001,
        children: [],
      },
      {
        id: 'task-empty',
        kind: 'node',
        title: 'Concurrency',
        steps: [],
        stepDone: [],
        completed: false,
        createdAt: 2002,
        children: [],
      },
    ],
  };

  return [root1, root2];
}

describe('Adversarial Stress Suite: diffBlueprintSteps', () => {
  describe('1. Set-Union Additions Stress Testing', () => {
    it('handles duplicate attempts with variations in casing and whitespace in incoming array', () => {
      const tree = createSampleTree();
      const rawStepsToAdd = [
        'New Step',
        'new step',
        'NEW STEP',
        '  New   Step  ',
        '\tNew Step\n',
        'Another Step',
        'another step',
      ];

      const res = diffBlueprintSteps(tree, ['task-1'], rawStepsToAdd, []);

      const task1 = findGoal(res.goals, 'task-1');
      expect(task1).toBeDefined();
      // Should add exactly 'New Step' and 'Another Step'
      expect(task1!.steps).toEqual([
        'Read docs',
        'Write exercises',
        'Build utility',
        'New Step',
        'Another Step',
      ]);
      expect(task1!.stepDone).toEqual([true, false, false, false, false]);
      expect(res.addedCount).toBe(2);
      expect(res.affectedCount).toBe(1);
    });

    it('skips steps if target already contains exact or case/whitespace equivalent step', () => {
      const tree = createSampleTree();
      // task-1 already has 'Read docs' and 'Write exercises'
      const rawStepsToAdd = [
        'READ DOCS',
        '  write   exercises  ',
        'read docs',
        'Brand New Step',
      ];

      const res = diffBlueprintSteps(tree, ['task-1'], rawStepsToAdd, []);
      const task1 = findGoal(res.goals, 'task-1')!;

      expect(task1.steps).toEqual([
        'Read docs',
        'Write exercises',
        'Build utility',
        'Brand New Step',
      ]);
      expect(res.addedCount).toBe(1);
      expect(res.affectedCount).toBe(1);
    });

    it('handles empty strings, whitespace-only, and special characters', () => {
      const tree = createSampleTree();
      const rawStepsToAdd = [
        '',
        '   ',
        '\t\r\n',
        'Step with [regex] characters .*+?^${}()|[]\\',
        '🚀 Emoji Step 🎉',
        '<b>HTML tags</b>',
      ];

      const res = diffBlueprintSteps(tree, ['task-empty'], rawStepsToAdd, []);
      const task = findGoal(res.goals, 'task-empty')!;

      expect(task.steps).toEqual([
        'Step with [regex] characters .*+?^${}()|[]\\',
        '🚀 Emoji Step 🎉',
        '<b>HTML tags</b>',
      ]);
      expect(res.addedCount).toBe(3);
    });

    it('updates completion status properly when adding steps to a previously completed task', () => {
      const tree = createSampleTree();
      // task-2 is completed with 2/2 steps done
      const task2Before = findGoal(tree, 'task-2')!;
      expect(task2Before.completed).toBe(true);

      const res = diffBlueprintSteps(tree, ['task-2'], ['Next Challenge'], []);
      const task2After = findGoal(res.goals, 'task-2')!;

      expect(task2After.steps).toEqual([
        'Read handbook',
        'Practice distributive cases',
        'Next Challenge',
      ]);
      expect(task2After.stepDone).toEqual([true, true, false]);
      expect(task2After.completed).toBe(false); // Must now be incomplete!
    });

    it('ignores non-endpoint branches and root goals even if targeted', () => {
      const tree = createSampleTree();
      // Target g-root-1 (goal) and branch-1 (has children)
      const res = diffBlueprintSteps(tree, ['g-root-1', 'branch-1'], ['Illegal Step'], []);

      expect(res.affectedCount).toBe(0);
      expect(res.addedCount).toBe(0);

      const root = findGoal(res.goals, 'g-root-1')!;
      expect(root.steps).toBeUndefined();

      const branch = findGoal(res.goals, 'branch-1')!;
      expect(branch.steps).toBeUndefined();
    });
  });

  describe('2. Set-Difference Removals Stress Testing', () => {
    it('silently ignores non-existent steps and non-existent target IDs', () => {
      const tree = createSampleTree();
      const res = diffBlueprintSteps(
        tree,
        ['task-1', 'non-existent-node-id', 'phantom-task'],
        [],
        ['Step That Does Not Exist', 'Another Ghost', 'Random 123'],
      );

      // task-1 remains untouched
      const task1 = findGoal(res.goals, 'task-1')!;
      expect(task1.steps).toEqual(['Read docs', 'Write exercises', 'Build utility']);
      expect(res.affectedCount).toBe(0);
      expect(res.removedCount).toBe(0);
    });

    it('removes matching steps across mixed subsets of targets with case/whitespace variations', () => {
      const tree = createSampleTree();
      // task-1 has: 'Read docs' (done), 'Write exercises', 'Build utility'
      // task-3 has: 'Syntax review'
      // task-4 has: 'Borrow checker basics' (done), 'Lifetimes overview'
      // task-empty has: []

      const stepsToRemove = [
        '  write   EXERCISES  ', // matches task-1
        'SYNTAX REVIEW',         // matches task-3
        'LIFETIMES OVERVIEW',    // matches task-4
        'Non-existent',          // matches nothing
      ];

      const res = diffBlueprintSteps(
        tree,
        ['task-1', 'task-3', 'task-4', 'task-empty'],
        [],
        stepsToRemove,
      );

      const task1 = findGoal(res.goals, 'task-1')!;
      expect(task1.steps).toEqual(['Read docs', 'Build utility']);

      const task3 = findGoal(res.goals, 'task-3')!;
      expect(task3.steps).toEqual([]);

      const task4 = findGoal(res.goals, 'task-4')!;
      expect(task4.steps).toEqual(['Borrow checker basics']);

      const taskEmpty = findGoal(res.goals, 'task-empty')!;
      expect(taskEmpty.steps).toEqual([]);

      expect(res.removedCount).toBe(3);
      expect(res.affectedCount).toBe(3); // task-1, task-3, task-4 affected, task-empty untouched
    });

    it('recalculates completed to true when removing pending steps leaves only completed steps', () => {
      const tree = createSampleTree();
      // task-1 has: 'Read docs' (done: true), 'Write exercises' (done: false), 'Build utility' (done: false)
      const res = diffBlueprintSteps(
        tree,
        ['task-1'],
        [],
        ['Write exercises', 'Build utility'],
      );

      const task1 = findGoal(res.goals, 'task-1')!;
      expect(task1.steps).toEqual(['Read docs']);
      expect(task1.stepDone).toEqual([true]);
      expect(task1.completed).toBe(true); // All remaining steps are done!
    });
  });

  describe('3. Completed Steps Protection Verification', () => {
    it('NEVER removes completed steps by default (forceRemoveCompleted = false or omitted)', () => {
      const tree = createSampleTree();
      // task-1 has 'Read docs' (done: true), 'Write exercises' (done: false), 'Build utility' (done: false)
      // Attempt to remove ALL steps including 'Read docs'
      const res = diffBlueprintSteps(
        tree,
        ['task-1'],
        [],
        ['read docs', 'Write exercises', 'build utility'],
      );

      const task1 = findGoal(res.goals, 'task-1')!;
      // 'Read docs' MUST be protected and preserved!
      expect(task1.steps).toEqual(['Read docs']);
      expect(task1.stepDone).toEqual([true]);
      expect(task1.completed).toBe(true);

      expect(res.removedCount).toBe(2);
      expect(res.protectedCompletedCount).toBe(1);
      expect(res.protectedCount).toBe(1);
      expect(res.affectedCount).toBe(1);
    });

    it('defends fully completed nodes without altering their reference or marking affected', () => {
      const tree = createSampleTree();
      // task-2 has all steps done: ['Read handbook', 'Practice distributive cases']
      const task2Original = findGoal(tree, 'task-2')!;

      const res = diffBlueprintSteps(
        tree,
        ['task-2'],
        [],
        ['Read handbook', 'Practice distributive cases'],
      );

      const task2After = findGoal(res.goals, 'task-2')!;
      expect(task2After).toBe(task2Original); // Exact same reference
      expect(task2After.steps).toEqual(['Read handbook', 'Practice distributive cases']);
      expect(res.affectedCount).toBe(0);
      expect(res.removedCount).toBe(0);
      expect(res.protectedCompletedCount).toBe(2);
    });

    it('removes completed steps ONLY when forceRemoveCompleted is explicitly true', () => {
      const tree = createSampleTree();
      const res = diffBlueprintSteps(
        tree,
        ['task-2'],
        [],
        ['Read handbook'],
        { forceRemoveCompleted: true },
      );

      const task2 = findGoal(res.goals, 'task-2')!;
      expect(task2.steps).toEqual(['Practice distributive cases']);
      expect(task2.stepDone).toEqual([true]);
      expect(res.removedCount).toBe(1);
      expect(res.protectedCompletedCount).toBe(0);
      expect(res.affectedCount).toBe(1);
    });
  });

  describe('4. Simultaneous Add & Remove Interactions', () => {
    it('handles overlapping step in both add and remove lists correctly', () => {
      const tree = createSampleTree();
      // task-1 has 'Write exercises' (pending).
      // What if 'Write exercises' is in both add and remove?
      const res = diffBlueprintSteps(
        tree,
        ['task-1'],
        ['Write exercises'],
        ['Write exercises'],
      );

      const task1 = findGoal(res.goals, 'task-1')!;
      // It gets removed in Phase 1, then re-added as a fresh uncompleted step in Phase 2
      expect(task1.steps).toEqual(['Read docs', 'Build utility', 'Write exercises']);
      expect(task1.stepDone).toEqual([true, false, false]);
      expect(res.removedCount).toBe(1);
      expect(res.addedCount).toBe(1);
    });

    it('preserves completed step when present in both add and remove lists (protected from reset)', () => {
      const tree = createSampleTree();
      // task-1 has 'Read docs' (completed: true).
      // Both add and remove target 'Read docs' without forceRemoveCompleted.
      const res = diffBlueprintSteps(
        tree,
        ['task-1'],
        ['Read docs'],
        ['Read docs'],
        { forceRemoveCompleted: false },
      );

      const task1 = findGoal(res.goals, 'task-1')!;
      // Phase 1: 'Read docs' is protected and preserved as done: true.
      // Phase 2: existingKeys already has 'read docs', so it is NOT duplicated.
      expect(task1.steps).toEqual(['Read docs', 'Write exercises', 'Build utility']);
      expect(task1.stepDone).toEqual([true, false, false]);
      expect(res.removedCount).toBe(0);
      expect(res.addedCount).toBe(0);
      expect(res.protectedCompletedCount).toBe(1);
    });
  });
});

describe('Adversarial Stress Suite: addBlueprintChildrenBulk', () => {
  describe('1. Multi-Parent Targeting & Overlapping Siblings', () => {
    it('applies per-parent sibling deduplication without leaking between parents', () => {
      const tree = createSampleTree();
      // branch-1 already has children: 'Generics', 'Conditional Types'
      // g-root-2 already has children: 'Ownership', 'Concurrency'
      const titles = [
        'Generics', // duplicate in branch-1, but fresh for g-root-2
        'Ownership', // duplicate in g-root-2, but fresh for branch-1
        'New Shared Topic', // fresh for both
      ];

      const res = addBlueprintChildrenBulk(tree, ['branch-1', 'g-root-2'], titles);

      const branch1 = findGoal(res.goals, 'branch-1')!;
      const branch1Titles = branch1.children.map((c) => c.title);
      // branch-1 should receive 'Ownership' and 'New Shared Topic', but NOT 'Generics'
      expect(branch1Titles).toEqual([
        'Generics',
        'Conditional Types',
        'Ownership',
        'New Shared Topic',
      ]);

      const root2 = findGoal(res.goals, 'g-root-2')!;
      const root2Titles = root2.children.map((c) => c.title);
      // root2 should receive 'Generics' and 'New Shared Topic', but NOT 'Ownership'
      expect(root2Titles).toEqual([
        'Ownership',
        'Concurrency',
        'Generics',
        'New Shared Topic',
      ]);

      // Total added: 2 to branch-1 + 2 to root2 = 4
      expect(res.count).toBe(4);
      expect(res.createdIds.length).toBe(4);
    });

    it('deduplicates incoming raw titles with whitespace and casing variants', () => {
      const tree = createSampleTree();
      const rawTitles = [
        'Advanced Patterns',
        'advanced patterns',
        'ADVANCED PATTERNS',
        '  Advanced   Patterns  ',
        '\tAdvanced Patterns\n',
        '',
        '   ',
      ];

      const res = addBlueprintChildrenBulk(tree, ['task-empty'], rawTitles);
      const taskEmpty = findGoal(res.goals, 'task-empty')!;

      // Should add exactly 1 child titled 'Advanced Patterns'
      expect(taskEmpty.children.length).toBe(1);
      expect(taskEmpty.children[0].title).toBe('Advanced Patterns');
      expect(res.count).toBe(1);
    });
  });

  describe('2. Deep Hierarchy & Ancestor-Descendant Targeting', () => {
    it('handles deep hierarchy (depth 6) and maintains tree structure', () => {
      // Build a 6-level deep tree
      const deepTree: GoalNode = {
        id: 'lvl-1',
        kind: 'goal',
        title: 'Level 1 Root',
        completed: false,
        createdAt: 1,
        children: [],
      };

      let current = deepTree;
      for (let i = 2; i <= 6; i++) {
        const nextNode: GoalNode = {
          id: `lvl-${i}`,
          kind: 'node',
          title: `Level ${i}`,
          completed: false,
          createdAt: i,
          children: [],
        };
        current.children.push(nextNode);
        current = nextNode;
      }

      // Simultaneously target Level 1, Level 3, and Level 6
      const res = addBlueprintChildrenBulk([deepTree], ['lvl-1', 'lvl-3', 'lvl-6'], ['Bulk Subtask']);

      expect(res.count).toBe(3);
      expect(res.createdIds.length).toBe(3);

      const l1 = findGoal(res.goals, 'lvl-1')!;
      expect(l1.children.some((c) => c.title === 'Bulk Subtask')).toBe(true);

      const l3 = findGoal(res.goals, 'lvl-3')!;
      expect(l3.children.some((c) => c.title === 'Bulk Subtask')).toBe(true);

      const l6 = findGoal(res.goals, 'lvl-6')!;
      expect(l6.children.some((c) => c.title === 'Bulk Subtask')).toBe(true);
    });

    it('gracefully handles ancestor and descendant targeted in reverse order', () => {
      const tree = createSampleTree();
      // branch-1 is parent of task-1.
      // Target task-1 first, then branch-1.
      const res = addBlueprintChildrenBulk(tree, ['task-1', 'branch-1'], ['New Node']);

      const branch1 = findGoal(res.goals, 'branch-1')!;
      const task1 = findGoal(res.goals, 'task-1')!;

      expect(branch1.children.some((c) => c.title === 'New Node')).toBe(true);
      expect(task1.children.some((c) => c.title === 'New Node')).toBe(true);
    });
  });

  describe('3. Global UID Uniqueness & Massive Scale Stress Test', () => {
    it('guarantees 100% unique IDs across all created nodes in a high-volume scenario', () => {
      // Create a forest of 20 goals, each with 5 branches = 100 parents
      const forest: GoalNode[] = [];
      const parentIds: string[] = [];

      for (let g = 0; g < 20; g++) {
        const branches: GoalNode[] = [];
        for (let b = 0; b < 5; b++) {
          const bId = `g${g}-b${b}`;
          parentIds.push(bId);
          branches.push({
            id: bId,
            kind: 'node',
            title: `Branch ${g}-${b}`,
            children: [],
            completed: false,
            createdAt: 1000 + g * 10 + b,
          });
        }
        forest.push({
          id: `root-${g}`,
          kind: 'goal',
          title: `Goal ${g}`,
          children: branches,
          completed: false,
          createdAt: 1000 + g * 10,
        });
      }

      // Add 10 children to all 100 parents -> 1000 nodes generated!
      const titles = Array.from({ length: 10 }, (_, i) => `Subtask Item ${i + 1}`);

      const res = addBlueprintChildrenBulk(forest, parentIds, titles);

      expect(res.count).toBe(1000);
      expect(res.createdIds.length).toBe(1000);

      // Check 1: createdIds has zero duplicates
      const uniqueCreatedIds = new Set(res.createdIds);
      expect(uniqueCreatedIds.size).toBe(1000);

      // Check 2: All node IDs in the entire resulting tree forest are strictly unique
      const allTreeIds = collectAllNodeIds(res.goals);
      // Forest had 20 roots + 100 branches = 120 nodes originally. Now + 1000 = 1120 nodes.
      expect(allTreeIds.length).toBe(1120);
      const uniqueTreeIds = new Set(allTreeIds);
      expect(uniqueTreeIds.size).toBe(1120);

      // Check 3: Every created ID starts with 'goal-'
      for (const id of res.createdIds) {
        expect(id.startsWith('goal-')).toBe(true);
      }
    });
  });

  describe('4. Step Transition & Endpoint Conversion Safeguards', () => {
    it('converts parent checklist steps into child nodes when convertExistingSteps is true', () => {
      const tree = createSampleTree();
      // task-1 has: 'Read docs' (done: true), 'Write exercises' (done: false), 'Build utility' (done: false)
      const res = addBlueprintChildrenBulk(tree, ['task-1'], ['New Child Task'], {
        convertExistingSteps: true,
      });

      const task1 = findGoal(res.goals, 'task-1')!;
      // Steps must be cleared
      expect(task1.steps).toBeUndefined();
      expect(task1.stepDone).toBeUndefined();
      // Children must contain the 3 converted steps + 1 new child
      expect(task1.children.length).toBe(4);
      expect(task1.children.map((c) => c.title)).toEqual([
        'Read docs',
        'Write exercises',
        'Build utility',
        'New Child Task',
      ]);
      // Converted step completion status must be preserved
      expect(task1.children[0].completed).toBe(true);
      expect(task1.children[1].completed).toBe(false);
      expect(task1.children[2].completed).toBe(false);
      expect(task1.children[3].completed).toBe(false);

      // Verify createdIds contains both converted step IDs and new child ID
      expect(res.createdIds.length).toBe(4);
    });

    it('clears steps safely when convertExistingSteps is false (default)', () => {
      const tree = createSampleTree();
      const res = addBlueprintChildrenBulk(tree, ['task-1'], ['Fresh Child']);

      const task1 = findGoal(res.goals, 'task-1')!;
      expect(task1.steps).toBeUndefined();
      expect(task1.stepDone).toBeUndefined();
      expect(task1.children.length).toBe(1);
      expect(task1.children[0].title).toBe('Fresh Child');
    });
  });

  describe('5. Immutability & Deep Freeze Stress Test', () => {
    function deepFreeze<T>(obj: T): T {
      if (obj === null || typeof obj !== 'object') return obj;
      Object.freeze(obj);
      for (const key of Object.keys(obj)) {
        deepFreeze((obj as Record<string, unknown>)[key]);
      }
      return obj;
    }

    it('diffBlueprintSteps NEVER mutates input tree (survives deepFreeze)', () => {
      const tree = deepFreeze(createSampleTree());

      // Should not throw TypeError even with deepFreeze
      expect(() => {
        diffBlueprintSteps(
          tree,
          ['task-1', 'task-2'],
          ['Brand New Step'],
          ['Write exercises', 'Read handbook'],
          { forceRemoveCompleted: true },
        );
      }).not.toThrow();
    });

    it('addBlueprintChildrenBulk NEVER mutates input tree (survives deepFreeze)', () => {
      const tree = deepFreeze(createSampleTree());

      // Should not throw TypeError even with deepFreeze
      expect(() => {
        addBlueprintChildrenBulk(
          tree,
          ['branch-1', 'task-4'],
          ['Frozen Child 1', 'Frozen Child 2'],
          { convertExistingSteps: true },
        );
      }).not.toThrow();
    });
  });

  describe('6. High-Frequency Rapid Succession Stress Test', () => {
    it('maintains strict consistency through a rapid 50-step transaction cycle', () => {
      let currentTree = createSampleTree();
      const targetId = 'task-empty';

      for (let cycle = 0; cycle < 50; cycle++) {
        // Step A: Add 3 steps
        const addRes = diffBlueprintSteps(
          currentTree,
          [targetId],
          [`Step Alpha ${cycle}`, `Step Beta ${cycle}`, `Step Gamma ${cycle}`],
          [],
        );
        currentTree = addRes.goals;

        // Step B: Remove 2 of them
        const removeRes = diffBlueprintSteps(
          currentTree,
          [targetId],
          [],
          [`Step Alpha ${cycle}`, `Step Beta ${cycle}`],
        );
        currentTree = removeRes.goals;
      }

      const task = findGoal(currentTree, targetId)!;
      // After 50 cycles, only Step Gamma from each cycle should remain
      expect(task.steps?.length).toBe(50);
      expect(task.steps?.[0]).toBe('Step Gamma 0');
      expect(task.steps?.[49]).toBe('Step Gamma 49');
    });
  });

  describe('7. Unicode and Exotic Whitespace Stress Test', () => {
    it('normalizes non-breaking spaces and exotic unicode whitespace', () => {
      const tree = createSampleTree();
      // \u00A0 = NBSP, \u3000 = Ideographic space, \u2000 = En quad
      const exoticSteps = [
        'Exotic\u00A0Whitespace\u3000Step',
        'exotic whitespace step',
        '  Exotic   Whitespace   Step  ',
      ];

      const res = diffBlueprintSteps(tree, ['task-empty'], exoticSteps, []);
      const task = findGoal(res.goals, 'task-empty')!;

      // Should normalize all to a single entry: 'Exotic Whitespace Step'
      expect(task.steps?.length).toBe(1);
      expect(task.steps?.[0]).toBe('Exotic Whitespace Step');
    });
  });
});
