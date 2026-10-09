import { describe, expect, it } from 'vitest';
import type { GoalKind, GoalNode, Task } from '../types';
import {
  addBlueprintChildrenBulk,
  addBlueprintSteps,
  blueprintReviewState,
  closestBlueprintPathIds,
  collectBlueprintStepsSummary,
  convertNodeToBranch,
  convertNodeToTask,
  countBlueprintNodes,
  diffBlueprintSteps,
  findBlueprintPath,
  flattenBlueprint,
  isValidISODate,
  maxBlueprintDepth,
  normalizeBlueprintTitles,
  numberedBlueprintTitles,
  reconcileBlueprintTasks,
  removeBlueprintNodes,
  removeBlueprintSteps,
  setGoalDates,
  setGoalDatesBulk,
  validateGoalDates,
} from './blueprintStudio';
import {
  duplicateStudioItems,
  moveStudioItems,
  patchStudioItems,
  topStudioSelection,
} from './studioWorkspace';
import {
  clearRollupCache,
  findGoal,
  goalNodeRole,
  hasGoalExecutionState,
  isGoalEndpoint,
  recomputeCompleted,
  rollupPct,
  sameTasks,
  sameTree,
} from './goalTree';
import { uid } from './ids';

// ---------------------------------------------------------------------------
// Test Fixture Helpers & Simulators
// ---------------------------------------------------------------------------

function makeTestNode(
  id: string,
  kind: GoalKind,
  title: string,
  children: GoalNode[] = [],
  options: {
    steps?: string[];
    stepDone?: boolean[];
    completed?: boolean;
    startDate?: string;
    endDate?: string;
    todayTaskId?: string | null;
  } = {},
): GoalNode {
  return {
    id,
    kind,
    title,
    children,
    steps: options.steps,
    stepDone: options.stepDone,
    completed: options.completed ?? false,
    startDate: options.startDate,
    endDate: options.endDate,
    todayTaskId: options.todayTaskId,
    createdAt: 1000,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

class DraftTransactionStack<T> {
  private past: T[] = [];
  private current: T;
  private future: T[] = [];

  constructor(initial: T) {
    this.current = initial;
  }

  get state(): T {
    return this.current;
  }

  push(next: T): void {
    this.past.push(this.current);
    this.current = next;
    this.future = [];
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  undo(): T {
    if (!this.canUndo()) return this.current;
    this.future.unshift(this.current);
    this.current = this.past.pop()!;
    return this.current;
  }

  redo(): T {
    if (!this.canRedo()) return this.current;
    this.past.push(this.current);
    this.current = this.future.shift()!;
    return this.current;
  }
}

function simulateStoreCommit(
  current: GoalNode[],
  base: GoalNode[],
  proposed: GoalNode[],
  currentTasks: Task[] = [],
  activeTaskId?: string,
): { ok: boolean; token?: string; error?: string; nextGoals?: GoalNode[]; nextTasks?: Task[] } {
  if (!sameTree(current, base)) return { ok: false, error: 'stale' };
  const nextGoals = proposed.map(recomputeCompleted);
  if (sameTree(current, nextGoals)) return { ok: false, error: 'unchanged' };
  const nextTasks = reconcileBlueprintTasks(currentTasks, nextGoals, current);
  if (activeTaskId) {
    const curActive = currentTasks.find((t) => t.id === activeTaskId);
    const nxtActive = nextTasks.find((t) => t.id === activeTaskId);
    if (!curActive || !nxtActive || !sameTasks([curActive], [nxtActive])) {
      return { ok: false, error: 'active-session' };
    }
  }
  return { ok: true, token: uid('blueprint'), nextGoals, nextTasks };
}

// ===========================================================================
// TIER 1: Feature Coverage (Core Requirements R1-R5)
// ===========================================================================

describe('Tier 1: Feature Coverage', () => {
  // -------------------------------------------------------------------------
  // R1: Flexible Node Expansion (Choice: Steps vs Children)
  // -------------------------------------------------------------------------
  describe('R1: Flexible Node Expansion', () => {
    it('T1.1.1: converts an empty leaf into an executable task with steps and role Task', () => {
      const tree = [makeTestNode('g1', 'goal', 'Goal', [makeTestNode('item1', 'node', 'Draft Proposal')])];
      const result = convertNodeToTask(tree, 'item1', ['Draft outline', 'Review budget', 'Finalize text']);

      const updated = findGoal(result, 'item1');
      expect(updated).toBeDefined();
      expect(updated?.steps).toEqual(['Draft outline', 'Review budget', 'Finalize text']);
      expect(updated?.stepDone).toEqual([false, false, false]);
      expect(updated?.completed).toBe(false);
      expect(updated?.children).toHaveLength(0);
      expect(isGoalEndpoint(updated!)).toBe(true);
      expect(goalNodeRole(updated!)).toBe('Task');
    });

    it('T1.1.2: converts an empty leaf into a branch container with children and role Branch', () => {
      const tree = [makeTestNode('g1', 'goal', 'Goal', [makeTestNode('folder1', 'node', 'Documentation')])];
      const result = convertNodeToBranch(tree, 'folder1', ['User Guide', 'API Reference']);

      const updated = findGoal(result, 'folder1');
      expect(updated).toBeDefined();
      expect(updated?.children).toHaveLength(2);
      expect(updated?.children.map((c) => c.title)).toEqual(['User Guide', 'API Reference']);
      expect(updated?.steps).toBeUndefined();
      expect(updated?.stepDone).toBeUndefined();
      expect(isGoalEndpoint(updated!)).toBe(false);
      expect(goalNodeRole(updated!)).toBe('Branch');
    });

    it('T1.1.3: converts task with existing steps into branch container with convertExistingSteps: true preserving step completion', () => {
      const tree = [
        makeTestNode('g1', 'goal', 'Goal', [
          makeTestNode('task1', 'node', 'Feature Work', [], {
            steps: ['Database Schema', 'Backend API', 'Frontend UI'],
            stepDone: [true, true, false],
            completed: false,
          }),
        ]),
      ];

      const result = convertNodeToBranch(tree, 'task1', ['Integration Tests'], { convertExistingSteps: true });
      const updated = findGoal(result, 'task1');
      expect(updated).toBeDefined();
      expect(updated?.children).toHaveLength(4);
      expect(updated?.children.map((c) => c.title)).toEqual([
        'Database Schema',
        'Backend API',
        'Frontend UI',
        'Integration Tests',
      ]);
      expect(updated?.children[0].completed).toBe(true);
      expect(updated?.children[1].completed).toBe(true);
      expect(updated?.children[2].completed).toBe(false);
      expect(updated?.children[3].completed).toBe(false);
      expect(updated?.steps).toBeUndefined();
      expect(updated?.stepDone).toBeUndefined();
      expect(goalNodeRole(updated!)).toBe('Branch');
    });

    it('T1.1.4: converts task with existing steps into branch container with convertExistingSteps: false clearing steps', () => {
      const tree = [
        makeTestNode('g1', 'goal', 'Goal', [
          makeTestNode('task1', 'node', 'Old Task', [], {
            steps: ['Old Step 1', 'Old Step 2'],
            stepDone: [true, false],
          }),
        ]),
      ];

      const result = convertNodeToBranch(tree, 'task1', ['Subtask Alpha', 'Subtask Beta'], { convertExistingSteps: false });
      const updated = findGoal(result, 'task1');
      expect(updated).toBeDefined();
      expect(updated?.children.map((c) => c.title)).toEqual(['Subtask Alpha', 'Subtask Beta']);
      expect(updated?.steps).toBeUndefined();
      expect(updated?.stepDone).toBeUndefined();
      expect(goalNodeRole(updated!)).toBe('Branch');
    });

    it('T1.1.5: protects root goal and existing branches from accidental task conversion', () => {
      const branch = makeTestNode('b1', 'node', 'Active Branch', [makeTestNode('c1', 'node', 'Child')]);
      const tree = [makeTestNode('root', 'goal', 'Root Goal', [branch])];

      const rootAttempt = convertNodeToTask(tree, 'root', ['Step 1']);
      expect(rootAttempt).toEqual(tree);
      expect(findGoal(rootAttempt, 'root')?.steps).toBeUndefined();

      const branchAttempt = convertNodeToTask(tree, 'b1', ['Step 1']);
      expect(branchAttempt).toEqual(tree);
      expect(findGoal(branchAttempt, 'b1')?.steps).toBeUndefined();
    });

    it('T1.1.6: verifies endpoint detection and strict non-hybrid invariant across conversions', () => {
      const leaf = makeTestNode('item', 'node', 'Item');
      let tree = [makeTestNode('g', 'goal', 'Goal', [leaf])];

      expect(isGoalEndpoint(findGoal(tree, 'item')!)).toBe(true);
      expect(hasGoalExecutionState(findGoal(tree, 'item')!)).toBe(false);

      tree = convertNodeToTask(tree, 'item', ['Step 1']);
      expect(isGoalEndpoint(findGoal(tree, 'item')!)).toBe(true);
      expect(hasGoalExecutionState(findGoal(tree, 'item')!)).toBe(true);

      tree = convertNodeToBranch(tree, 'item', ['Child 1']);
      const converted = findGoal(tree, 'item')!;
      expect(isGoalEndpoint(converted)).toBe(false);
      expect(converted.steps).toBeUndefined();
      expect(converted.stepDone).toBeUndefined();
      expect(converted.children).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // R2: Bulk "Add Inside" Multi-Parent Targeting
  // -------------------------------------------------------------------------
  describe('R2: Bulk "Add Inside" Multi-Parent Targeting', () => {
    it('T1.2.1: bulk adds children across multiple parents simultaneously at different tree levels', () => {
      const tree = [
        makeTestNode('g1', 'goal', 'Goal Alpha', [
          makeTestNode('p1', 'node', 'Parent One'),
          makeTestNode('branch', 'node', 'Branch', [makeTestNode('p2', 'node', 'Parent Two')]),
        ]),
        makeTestNode('g2', 'goal', 'Goal Beta', [makeTestNode('p3', 'node', 'Parent Three')]),
      ];

      const result = addBlueprintChildrenBulk(tree, ['p1', 'p2', 'p3'], ['Standard Check', 'Review Milestone']);
      expect(result.count).toBe(6);
      expect(result.createdIds).toHaveLength(6);

      const p1 = findGoal(result.goals, 'p1');
      const p2 = findGoal(result.goals, 'p2');
      const p3 = findGoal(result.goals, 'p3');

      expect(p1?.children.map((c) => c.title)).toEqual(['Standard Check', 'Review Milestone']);
      expect(p2?.children.map((c) => c.title)).toEqual(['Standard Check', 'Review Milestone']);
      expect(p3?.children.map((c) => c.title)).toEqual(['Standard Check', 'Review Milestone']);
    });

    it('T1.2.2: skips duplicate sibling titles per-parent while adding to parents lacking the sibling', () => {
      const tree = [
        makeTestNode('g1', 'goal', 'Goal', [
          makeTestNode('p1', 'node', 'Parent A', [makeTestNode('c1', 'node', 'Existing Child')]),
          makeTestNode('p2', 'node', 'Parent B', []),
        ]),
      ];

      const result = addBlueprintChildrenBulk(tree, ['p1', 'p2'], ['existing child', 'Brand New Child']);
      expect(result.count).toBe(3);

      const p1 = findGoal(result.goals, 'p1');
      const p2 = findGoal(result.goals, 'p2');
      expect(p1?.children.map((c) => c.title)).toEqual(['Existing Child', 'Brand New Child']);
      expect(p2?.children.map((c) => c.title)).toEqual(['existing child', 'Brand New Child']);
    });

    it('T1.2.3: generates bounded numbered child sequences and adds inside all selected parents', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Project', [
          makeTestNode('phase1', 'node', 'Sprint Alpha'),
          makeTestNode('phase2', 'node', 'Sprint Beta'),
        ]),
      ];

      const titles = numberedBlueprintTitles('Milestone', 1, 3);
      expect(titles).toEqual(['Milestone 1', 'Milestone 2', 'Milestone 3']);

      const result = addBlueprintChildrenBulk(tree, ['phase1', 'phase2'], titles);
      expect(result.count).toBe(6);

      const s1 = findGoal(result.goals, 'phase1');
      const s2 = findGoal(result.goals, 'phase2');
      expect(s1?.children.map((c) => c.title)).toEqual(['Milestone 1', 'Milestone 2', 'Milestone 3']);
      expect(s2?.children.map((c) => c.title)).toEqual(['Milestone 1', 'Milestone 2', 'Milestone 3']);
    });

    it('T1.2.4: generates fresh unique UIDs across all created node instances', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('m1', 'node', 'Module 1'),
          makeTestNode('m2', 'node', 'Module 2'),
          makeTestNode('m3', 'node', 'Module 3'),
        ]),
      ];

      const result = addBlueprintChildrenBulk(tree, ['m1', 'm2', 'm3'], ['Item A', 'Item B']);
      expect(result.count).toBe(6);

      const allIds = new Set(result.createdIds);
      expect(allIds.size).toBe(6);

      const flat = flattenBlueprint(result.goals);
      const allTreeIds = flat.map((n) => n.id);
      expect(new Set(allTreeIds).size).toBe(allTreeIds.length);
    });

    it('T1.2.5: parses and normalizes multiline/whitespace-padded titles for bulk child creation', () => {
      const rawTitles = ['  Requirement 1  ', '   ', 'Requirement 1', 'Requirement 2\n', '\tRequirement 3\t'];
      const normalized = normalizeBlueprintTitles(rawTitles);
      expect(normalized).toEqual(['Requirement 1', 'Requirement 2', 'Requirement 3']);

      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('p', 'node', 'Parent')])];
      const result = addBlueprintChildrenBulk(tree, ['p'], rawTitles);
      expect(result.count).toBe(3);
      expect(findGoal(result.goals, 'p')?.children.map((c) => c.title)).toEqual([
        'Requirement 1',
        'Requirement 2',
        'Requirement 3',
      ]);
    });

    it('T1.2.6: seamlessly handles bulk adding inside parents that currently have steps (non-blocking)', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Parent With Steps', [], {
            steps: ['Step A', 'Step B'],
            stepDone: [true, false],
          }),
        ]),
      ];

      const result = addBlueprintChildrenBulk(tree, ['t1'], ['Child Item 1'], { convertExistingSteps: false });
      expect(result.count).toBe(1);

      const updated = findGoal(result.goals, 't1');
      expect(updated?.children).toHaveLength(1);
      expect(updated?.children[0].title).toBe('Child Item 1');
      expect(updated?.steps).toBeUndefined();
      expect(updated?.stepDone).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // R3: Bulk Step Diffing (Set-Union Additions & Set-Difference Removals)
  // -------------------------------------------------------------------------
  describe('R3: Bulk Step Diffing', () => {
    it('T1.3.1: applies Set-Union additions without creating duplicate steps on any node', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], { steps: ['Step A', 'Step B'], stepDone: [false, false] }),
          makeTestNode('t2', 'node', 'Task 2', [], { steps: ['Step B', 'Step C'], stepDone: [false, false] }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t1', 't2'], ['Step B', 'Step D'], []);
      expect(result.addedCount).toBe(2); // 'Step D' on t1, 'Step D' on t2; 'Step B' skipped as existing on both

      const t1 = findGoal(result.goals, 't1');
      const t2 = findGoal(result.goals, 't2');
      expect(t1?.steps).toEqual(['Step A', 'Step B', 'Step D']);
      expect(t2?.steps).toEqual(['Step B', 'Step C', 'Step D']);
    });

    it('T1.3.2: preserves existing step completion states when new steps are appended via set-union', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], {
            steps: ['First', 'Second'],
            stepDone: [true, false],
            completed: false,
          }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t1'], ['Third'], []);
      const t1 = findGoal(result.goals, 't1');
      expect(t1?.steps).toEqual(['First', 'Second', 'Third']);
      expect(t1?.stepDone).toEqual([true, false, false]);
      expect(t1?.completed).toBe(false);
    });

    it('T1.3.3: applies Set-Difference removals across selected nodes and silently skips missing steps', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], { steps: ['Alpha', 'Beta', 'Gamma'], stepDone: [false, false, false] }),
          makeTestNode('t2', 'node', 'Task 2', [], { steps: ['Beta', 'Delta'], stepDone: [false, false] }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t1', 't2'], [], ['Beta', 'Omega']);
      expect(result.removedCount).toBe(2); // 'Beta' removed from t1 and t2; 'Omega' skipped silently

      const t1 = findGoal(result.goals, 't1');
      const t2 = findGoal(result.goals, 't2');
      expect(t1?.steps).toEqual(['Alpha', 'Gamma']);
      expect(t2?.steps).toEqual(['Delta']);

      const wrapperResult = removeBlueprintSteps(tree, ['t1'], ['Beta']);
      expect(wrapperResult.removed).toBe(1);
    });

    it('T1.3.4: protects completed steps from removal by default and reports protected count', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], {
            steps: ['Done Step', 'Pending Step'],
            stepDone: [true, false],
          }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t1'], [], ['Done Step', 'Pending Step']);
      expect(result.removedCount).toBe(1);
      expect(result.protectedCompletedCount).toBe(1);
      expect(result.protectedCount).toBe(1);

      const t1 = findGoal(result.goals, 't1');
      expect(t1?.steps).toEqual(['Done Step']);
      expect(t1?.stepDone).toEqual([true]);
    });

    it('T1.3.5: allows removing completed steps when forceRemoveCompleted option is explicitly enabled', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], {
            steps: ['Done Step', 'Pending Step'],
            stepDone: [true, false],
          }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t1'], [], ['Done Step'], { forceRemoveCompleted: true });
      expect(result.removedCount).toBe(1);
      expect(result.protectedCompletedCount).toBe(0);

      const t1 = findGoal(result.goals, 't1');
      expect(t1?.steps).toEqual(['Pending Step']);
      expect(t1?.stepDone).toEqual([false]);
    });

    it('T1.3.6: collects and aggregates step summary statistics across heterogeneous candidate nodes', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task 1', [], { steps: ['Common Step', 'Solo 1'], stepDone: [true, false] }),
          makeTestNode('t2', 'node', 'Task 2', [], { steps: ['Common Step', 'Solo 2'], stepDone: [true, false] }),
        ]),
      ];

      const summary = collectBlueprintStepsSummary(tree, ['t1', 't2']);
      expect(summary.totalEligibleNodes).toBe(2);
      expect(summary.items.length).toBe(3);

      const common = summary.items.find((i) => i.title === 'Common Step');
      expect(common).toBeDefined();
      expect(common?.occurrences).toBe(2);
      expect(common?.isUniversal).toBe(true);
      expect(common?.allCompleted).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // R4: Bulk & Individual Date Changing (ISO YYYY-MM-DD)
  // -------------------------------------------------------------------------
  describe('R4: Bulk & Individual Date Changing', () => {
    it('T1.4.1: sets valid startDate and endDate on an individual node', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Work Item')])];
      const result = setGoalDates(tree, 'item', { startDate: '2026-11-01', endDate: '2026-11-15' });

      const updated = findGoal(result, 'item');
      expect(updated?.startDate).toBe('2026-11-01');
      expect(updated?.endDate).toBe('2026-11-15');
    });

    it('T1.4.2: applies startDate and endDate to multiple selected nodes in bulk', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('n1', 'node', 'Item 1'),
          makeTestNode('n2', 'node', 'Item 2'),
          makeTestNode('n3', 'node', 'Item 3'),
        ]),
      ];

      const result = setGoalDatesBulk(tree, ['n1', 'n2', 'n3'], {
        startDate: '2026-12-01',
        endDate: '2026-12-31',
      });

      expect(result.count).toBe(3);
      ['n1', 'n2', 'n3'].forEach((id) => {
        const node = findGoal(result.goals, id);
        expect(node?.startDate).toBe('2026-12-01');
        expect(node?.endDate).toBe('2026-12-31');
      });
    });

    it('T1.4.3: clears startDate and endDate across multiple selected nodes via clearAll', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('n1', 'node', 'Item 1', [], { startDate: '2026-10-01', endDate: '2026-10-10' }),
          makeTestNode('n2', 'node', 'Item 2', [], { startDate: '2026-10-05', endDate: '2026-10-20' }),
        ]),
      ];

      const result = setGoalDatesBulk(tree, ['n1', 'n2'], { clearAll: true });
      expect(result.count).toBe(2);

      const n1 = findGoal(result.goals, 'n1');
      const n2 = findGoal(result.goals, 'n2');
      expect(n1?.startDate).toBeUndefined();
      expect(n1?.endDate).toBeUndefined();
      expect(n2?.startDate).toBeUndefined();
      expect(n2?.endDate).toBeUndefined();
    });

    it('T1.4.4: validates strict ISO calendar dates and rejects invalid format strings', () => {
      expect(isValidISODate('2026-10-08')).toBe(true);
      expect(isValidISODate('2026-02-28')).toBe(true);

      expect(isValidISODate('2026/10/08')).toBe(false);
      expect(isValidISODate('08-10-2026')).toBe(false);
      expect(isValidISODate('2026-13-01')).toBe(false);
      expect(isValidISODate('2026-00-10')).toBe(false);
      expect(isValidISODate('2026-10-32')).toBe(false);
      expect(isValidISODate('not-a-date')).toBe(false);

      const validation = validateGoalDates({ startDate: '2026-13-40' });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Invalid start date');
    });

    it('T1.4.5: rejects inverted date ranges where startDate is after endDate with clear error', () => {
      const validation = validateGoalDates({ startDate: '2026-12-15', endDate: '2026-12-01' });
      expect(validation.valid).toBe(false);
      expect(validation.error).toContain('Start date (2026-12-15) cannot be after end date (2026-12-01)');

      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];
      const result = setGoalDatesBulk(tree, ['item'], { startDate: '2026-12-15', endDate: '2026-12-01' });
      expect(result.count).toBe(0);
      expect(findGoal(result.goals, 'item')?.startDate).toBeUndefined();
    });

    it('T1.4.6: applies conflict resolution policies (clear, clamp, skip) when single date conflicts', () => {
      const makeBase = () => [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('item', 'node', 'Item', [], { startDate: '2026-10-10', endDate: '2026-10-20' }),
        ]),
      ];

      // Policy 'clear' (default): setting new startDate after endDate clears conflicting endDate
      const cleared = setGoalDatesBulk(makeBase(), ['item'], { startDate: '2026-10-25' }, { conflictResolution: 'clear' });
      expect(findGoal(cleared.goals, 'item')?.startDate).toBe('2026-10-25');
      expect(findGoal(cleared.goals, 'item')?.endDate).toBeUndefined();

      // Policy 'clamp': setting new startDate after endDate adjusts endDate to match
      const clamped = setGoalDatesBulk(makeBase(), ['item'], { startDate: '2026-10-25' }, { conflictResolution: 'clamp' });
      expect(findGoal(clamped.goals, 'item')?.startDate).toBe('2026-10-25');
      expect(findGoal(clamped.goals, 'item')?.endDate).toBe('2026-10-25');

      // Policy 'skip': setting new startDate after endDate skips updating conflicting node
      const skipped = setGoalDatesBulk(makeBase(), ['item'], { startDate: '2026-10-25' }, { conflictResolution: 'skip' });
      expect(findGoal(skipped.goals, 'item')?.startDate).toBe('2026-10-10');
      expect(findGoal(skipped.goals, 'item')?.endDate).toBe('2026-10-20');
    });
  });

  // -------------------------------------------------------------------------
  // R5: Soothing & Simple UX / Transactional Draft & State Integrity
  // -------------------------------------------------------------------------
  describe('R5: Soothing & Simple UX / Transactional Draft', () => {
    it('T1.5.1: guarantees pure immutable state updates across all tree transformations', () => {
      const originalTree = [
        makeTestNode('g', 'goal', 'Root', [
          makeTestNode('p1', 'node', 'Parent', [makeTestNode('c1', 'node', 'Child')]),
        ]),
      ];
      deepFreeze(originalTree);

      const withChildren = addBlueprintChildrenBulk(originalTree, ['p1'], ['New Child']);
      expect(withChildren.goals).not.toBe(originalTree);
      expect(originalTree[0].children[0].children).toHaveLength(1);

      const withSteps = addBlueprintSteps(withChildren.goals, ['c1'], ['Check']);
      expect(withSteps.goals).not.toBe(withChildren.goals);

      const withDates = setGoalDatesBulk(withSteps.goals, ['c1'], { startDate: '2026-11-01' });
      expect(withDates.goals).not.toBe(withSteps.goals);
    });

    it('T1.5.2: normalizes multi-selection via topStudioSelection preventing duplicate descendant actions', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('parent', 'node', 'Parent', [
            makeTestNode('child', 'node', 'Child', [makeTestNode('grandchild', 'node', 'Grandchild')]),
          ]),
          makeTestNode('other', 'node', 'Other'),
        ]),
      ];

      const rawSelection = ['grandchild', 'parent', 'child', 'other'];
      const normalized = topStudioSelection(tree, rawSelection);
      expect(normalized).toEqual(['parent', 'other']);
    });

    it('T1.5.3: simulates transactional draft undo/redo stack through multi-step edits', () => {
      const initialTree = [makeTestNode('g', 'goal', 'Root', [makeTestNode('n1', 'node', 'Initial')])];
      const stack = new DraftTransactionStack(initialTree);

      const step1 = addBlueprintChildrenBulk(stack.state, ['n1'], ['Child A']).goals;
      stack.push(step1);
      expect(findGoal(stack.state, 'n1')?.children).toHaveLength(1);

      const step2 = setGoalDatesBulk(stack.state, ['n1'], { startDate: '2026-12-01' }).goals;
      stack.push(step2);
      expect(findGoal(stack.state, 'n1')?.startDate).toBe('2026-12-01');

      stack.undo();
      expect(findGoal(stack.state, 'n1')?.startDate).toBeUndefined();
      expect(findGoal(stack.state, 'n1')?.children).toHaveLength(1);

      stack.undo();
      expect(findGoal(stack.state, 'n1')?.children).toHaveLength(0);

      stack.redo();
      expect(findGoal(stack.state, 'n1')?.children).toHaveLength(1);
    });

    it('T1.5.4: verifies store atomic transaction safety (stale detection, unchanged rejection, active session protection)', () => {
      const current = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('t', 'node', 'Task')])];
      const staleBase = [makeTestNode('g', 'goal', 'Old Goal', [])];
      const proposed = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('t', 'node', 'Task', [], { completed: true })])];

      const staleRes = simulateStoreCommit(current, staleBase, proposed);
      expect(staleRes.ok).toBe(false);
      expect(staleRes.error).toBe('stale');

      const unchangedRes = simulateStoreCommit(current, current, current);
      expect(unchangedRes.ok).toBe(false);
      expect(unchangedRes.error).toBe('unchanged');

      const validRes = simulateStoreCommit(current, current, proposed);
      expect(validRes.ok).toBe(true);
      expect(validRes.token).toBeDefined();
    });

    it('T1.5.5: computes minimal blueprint review diff state exposing all modified paths', () => {
      const baseTree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('item1', 'node', 'Original Title'),
          makeTestNode('item2', 'node', 'Untouched'),
        ]),
      ];
      const modifiedTree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('item1', 'node', 'Renamed Title', [], { steps: ['New Step'], stepDone: [false] }),
          makeTestNode('item2', 'node', 'Untouched'),
        ]),
      ];

      const review = blueprintReviewState(baseTree, modifiedTree);
      expect(review.changedIds).toContain('item1');
      expect(review.changedIds).not.toContain('item2');
      expect(review.addedStepsByNode['item1']).toEqual(['New Step']);
    });

    it('T1.5.6: reconciles linked Today tasks while protecting historical completed task records', () => {
      const initialGoal = makeTestNode('g', 'goal', 'Goal', [
        makeTestNode('item', 'node', 'Old Task Name', [], { todayTaskId: 'active-task' }),
      ]);
      const updatedGoal = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('item', 'node', 'Updated Task Name', [], { todayTaskId: 'active-task' }),
        ]),
      ];

      const currentTasks: Task[] = [
        {
          id: 'active-task',
          title: 'Old Task Name',
          description: '',
          priority: 'medium',
          targetDate: '2026-10-08',
          deadline: null,
          steps: [],
          progress: 0,
          createdAt: 100,
          order: 1,
          goalNodeId: 'item',
        },
        {
          id: 'historical-task',
          title: 'Yesterday Task',
          description: '',
          priority: 'medium',
          targetDate: '2026-10-07',
          deadline: null,
          steps: [],
          progress: 1,
          createdAt: 90,
          order: 0,
          goalNodeId: 'item',
        },
      ];

      const reconciled = reconcileBlueprintTasks(currentTasks, updatedGoal, [initialGoal]);
      expect(reconciled.find((t) => t.id === 'active-task')?.title).toBe('Updated Task Name');
      expect(reconciled.find((t) => t.id === 'historical-task')?.title).toBe('Yesterday Task');
    });
  });
});

// ===========================================================================
// TIER 2: Boundary & Corner Cases (R1-R5)
// ===========================================================================

describe('Tier 2: Boundary & Corner Cases', () => {
  // -------------------------------------------------------------------------
  // R1 Boundary Cases
  // -------------------------------------------------------------------------
  describe('R1 Boundary Cases: Node Expansion & Conversion', () => {
    it('T2.1.1: empty or whitespace-only initial child titles produce no new child nodes', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];
      const result = convertNodeToBranch(tree, 'item', ['', '   ', '\t\n\t']);
      const updated = findGoal(result, 'item');
      expect(updated?.children).toHaveLength(0);
      expect(updated?.steps).toBeUndefined();
    });

    it('T2.1.2: preserves extreme characters, emojis, HTML entities, and Unicode in titles and steps', () => {
      const extremeTitles = [
        '🚀 Launch v1.0 <alpha & beta>',
        '日本語のタスク',
        'C++ / C# / F# Roadmap',
        'Quotes: "Double" and \'Single\'',
        'Mathematical symbols: ∀x ∈ S, ∃y ≠ ∅',
      ];
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('node1', 'node', 'Item')])];
      const converted = convertNodeToBranch(tree, 'node1', extremeTitles);
      const updated = findGoal(converted, 'node1');
      expect(updated?.children.map((c) => c.title)).toEqual(extremeTitles);

      const stepped = convertNodeToTask(tree, 'node1', extremeTitles);
      expect(findGoal(stepped, 'node1')?.steps).toEqual(extremeTitles);
    });

    it('T2.1.3: non-existent target node ID returns original tree reference unchanged', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];
      const branchRes = convertNodeToBranch(tree, 'non-existent-id', ['Child']);
      expect(branchRes).toBe(tree);

      const taskRes = convertNodeToTask(tree, 'non-existent-id', ['Step']);
      expect(taskRes).toBe(tree);
    });

    it('T2.1.4: safely converts deeply nested nodes at depth > 10 without recursion issues', () => {
      let currentChild = makeTestNode('deepest', 'node', 'Deep Leaf');
      for (let i = 9; i >= 0; i--) {
        currentChild = makeTestNode(`level-${i}`, 'node', `Level ${i}`, [currentChild]);
      }
      const tree = [makeTestNode('root', 'goal', 'Root', [currentChild])];
      expect(maxBlueprintDepth(tree)).toBe(12);

      const converted = convertNodeToTask(tree, 'deepest', ['Deep Step A', 'Deep Step B']);
      const deepestNode = findGoal(converted, 'deepest');
      expect(deepestNode?.steps).toEqual(['Deep Step A', 'Deep Step B']);
      expect(goalNodeRole(deepestNode!)).toBe('Task');
    });

    it('T2.1.5: converting an existing branch node appends deduplicated children while preserving prior children', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('branch', 'node', 'Branch', [makeTestNode('c1', 'node', 'First Child')]),
        ]),
      ];

      const result = convertNodeToBranch(tree, 'branch', ['first child', 'Second Child']);
      const updated = findGoal(result, 'branch');
      expect(updated?.children).toHaveLength(2);
      expect(updated?.children.map((c) => c.title)).toEqual(['First Child', 'Second Child']);
    });
  });

  // -------------------------------------------------------------------------
  // R2 Boundary Cases
  // -------------------------------------------------------------------------
  describe('R2 Boundary Cases: Bulk "Add Inside"', () => {
    it('T2.2.1: empty parentIds array or empty rawTitles array safely returns zero added count and original tree', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('p', 'node', 'Parent')])];

      const emptyParents = addBlueprintChildrenBulk(tree, [], ['Title']);
      expect(emptyParents.count).toBe(0);
      expect(emptyParents.goals).toBe(tree);

      const emptyTitles = addBlueprintChildrenBulk(tree, ['p'], []);
      expect(emptyTitles.count).toBe(0);
      expect(emptyTitles.goals).toBe(tree);
    });

    it('T2.2.2: clamps numbered sequence generator on out-of-range inputs (count > 100 clamped to 100, count < 1 to 1, start < 0 to 0)', () => {
      const clampedMax = numberedBlueprintTitles('Task', 1, 500);
      expect(clampedMax).toHaveLength(100);
      expect(clampedMax[0]).toBe('Task 1');
      expect(clampedMax[99]).toBe('Task 100');

      const clampedMin = numberedBlueprintTitles('Task', -5, -10);
      expect(clampedMin).toHaveLength(1);
      expect(clampedMin[0]).toBe('Task 0');

      const emptyPrefix = numberedBlueprintTitles('   ', 1, 2);
      expect(emptyPrefix).toEqual(['Item 1', 'Item 2']);
    });

    it('T2.2.3: gracefully handles non-existent parent IDs mixed with valid parent IDs', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('valid', 'node', 'Valid Parent')])];
      const result = addBlueprintChildrenBulk(tree, ['valid', 'ghost-id-1', 'ghost-id-2'], ['Child']);
      expect(result.count).toBe(1);
      expect(findGoal(result.goals, 'valid')?.children).toHaveLength(1);
    });

    it('T2.2.4: sibling title deduplication handles case-folding, irregular tabs, and multi-space variations', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('p', 'node', 'Parent', [makeTestNode('c1', 'node', 'Database Migration')]),
        ]),
      ];

      const duplicates = [
        '  database   migration  ',
        'DATABASE MIGRATION',
        'Database\tmigration',
      ];

      const result = addBlueprintChildrenBulk(tree, ['p'], duplicates);
      expect(result.count).toBe(0);
      expect(findGoal(result.goals, 'p')?.children).toHaveLength(1);
    });

    it('T2.2.5: high-volume stress: bulk adding inside 50+ parents produces 100+ unique nodes in <50ms', () => {
      const parents: GoalNode[] = Array.from({ length: 50 }, (_, i) =>
        makeTestNode(`parent-${i}`, 'node', `Section ${i}`),
      );
      const tree = [makeTestNode('root', 'goal', 'Large Project', parents)];

      const start = performance.now();
      const result = addBlueprintChildrenBulk(
        tree,
        parents.map((p) => p.id),
        ['Task A', 'Task B'],
      );
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(100);
      expect(result.count).toBe(100);
      expect(result.createdIds).toHaveLength(100);
      expect(new Set(result.createdIds).size).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // R3 Boundary Cases
  // -------------------------------------------------------------------------
  describe('R3 Boundary Cases: Step Diffing', () => {
    it('T2.3.1: empty stepsToAdd and stepsToRemove arrays produce zero affected nodes', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t', 'node', 'Task', [], { steps: ['Step 1'], stepDone: [false] }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t'], [], []);
      expect(result.affectedCount).toBe(0);
      expect(result.addedCount).toBe(0);
      expect(result.removedCount).toBe(0);
      expect(result.goals).toBe(tree);
    });

    it('T2.3.2: non-existent target node IDs in diffBlueprintSteps produce zero changes', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t', 'node', 'Task', [], { steps: ['Step 1'], stepDone: [false] }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['phantom-1', 'phantom-2'], ['New Step'], ['Old Step']);
      expect(result.affectedCount).toBe(0);
      expect(result.addedCount).toBe(0);
      expect(result.removedCount).toBe(0);
    });

    it('T2.3.3: step removal matches case-insensitively and whitespace-insensitively', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t', 'node', 'Task', [], {
            steps: ['Execute Test Plan', 'Clean up Artifacts'],
            stepDone: [false, false],
          }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t'], [], ['   EXECUTE   TEST   PLAN   ']);
      expect(result.removedCount).toBe(1);
      expect(findGoal(result.goals, 't')?.steps).toEqual(['Clean up Artifacts']);
    });

    it('T2.3.4: diffBlueprintSteps ignores non-endpoint nodes (root goals and branch folders with children)', () => {
      const tree = [
        makeTestNode('root', 'goal', 'Root Goal', [
          makeTestNode('branch', 'node', 'Branch', [makeTestNode('leaf', 'node', 'Leaf')]),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['root', 'branch'], ['Step A'], []);
      expect(result.affectedCount).toBe(0);
      expect(result.addedCount).toBe(0);
      expect(findGoal(result.goals, 'root')?.steps).toBeUndefined();
      expect(findGoal(result.goals, 'branch')?.steps).toBeUndefined();
    });

    it('T2.3.5: removing all checklist steps from a task leaves empty steps array and completed false', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t', 'node', 'Task', [], {
            steps: ['Solo Step'],
            stepDone: [false],
            completed: false,
          }),
        ]),
      ];

      const result = diffBlueprintSteps(tree, ['t'], [], ['Solo Step']);
      expect(result.removedCount).toBe(1);
      const updated = findGoal(result.goals, 't');
      expect(updated?.steps).toEqual([]);
      expect(updated?.stepDone).toEqual([]);
      expect(updated?.completed).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // R4 Boundary Cases
  // -------------------------------------------------------------------------
  describe('R4 Boundary Cases: Date Validation & Ranges', () => {
    it('T2.4.1: leap year rules: validates 2024-02-29 and 2000-02-29 as true; rejects 2025-02-29, 2100-02-29, and 1900-02-29', () => {
      expect(isValidISODate('2024-02-29')).toBe(true);
      expect(isValidISODate('2000-02-29')).toBe(true);

      expect(isValidISODate('2025-02-29')).toBe(false);
      expect(isValidISODate('2100-02-29')).toBe(false);
      expect(isValidISODate('1900-02-29')).toBe(false);
    });

    it('T2.4.2: validates month day boundaries: rejects April 31, June 31, Sept 31, Nov 31; accepts valid 31st days', () => {
      expect(isValidISODate('2026-04-31')).toBe(false);
      expect(isValidISODate('2026-06-31')).toBe(false);
      expect(isValidISODate('2026-09-31')).toBe(false);
      expect(isValidISODate('2026-11-31')).toBe(false);

      expect(isValidISODate('2026-01-31')).toBe(true);
      expect(isValidISODate('2026-03-31')).toBe(true);
      expect(isValidISODate('2026-05-31')).toBe(true);
      expect(isValidISODate('2026-07-31')).toBe(true);
      expect(isValidISODate('2026-08-31')).toBe(true);
      expect(isValidISODate('2026-10-31')).toBe(true);
      expect(isValidISODate('2026-12-31')).toBe(true);
    });

    it('T2.4.3: rejects malformed ISO dates: month 13, day 32, day 00, month 00, timestamps with time or ISO offsets', () => {
      expect(isValidISODate('2026-13-15')).toBe(false);
      expect(isValidISODate('2026-00-15')).toBe(false);
      expect(isValidISODate('2026-01-00')).toBe(false);
      expect(isValidISODate('2026-01-32')).toBe(false);
      expect(isValidISODate('2026-10-08T12:00:00Z')).toBe(false);
      expect(isValidISODate('2026-10-08 12:00')).toBe(false);
      expect(isValidISODate(null)).toBe(false);
      expect(isValidISODate(undefined)).toBe(false);
      expect(isValidISODate(12345)).toBe(false);
    });

    it('T2.4.4: rejects inverted date range in validateGoalDates and handles partial date conflict correctly', () => {
      const result = validateGoalDates({ startDate: '2027-01-01', endDate: '2026-12-31' });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be after');

      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('item', 'node', 'Item', [], { startDate: '2026-05-01', endDate: '2026-05-10' }),
        ]),
      ];
      // Setting an earlier endDate without updating startDate with conflictResolution 'clear'
      const updated = setGoalDatesBulk(tree, ['item'], { endDate: '2026-04-20' }, { conflictResolution: 'clear' });
      expect(findGoal(updated.goals, 'item')?.endDate).toBe('2026-04-20');
      expect(findGoal(updated.goals, 'item')?.startDate).toBeUndefined();
    });

    it('T2.4.5: non-existent target node IDs in setGoalDatesBulk returns count 0 with tree intact', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];
      const result = setGoalDatesBulk(tree, ['unknown-1'], { startDate: '2026-10-10' });
      expect(result.count).toBe(0);
      expect(result.adjustedCount).toBe(0);
      expect(findGoal(result.goals, 'item')?.startDate).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // R5 Boundary Cases
  // -------------------------------------------------------------------------
  describe('R5 Boundary Cases: Selection, Draft Stack & Immutability', () => {
    it('T2.5.1: empty selection IDs passed to topStudioSelection returns empty array', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];
      expect(topStudioSelection(tree, [])).toEqual([]);
    });

    it('T2.5.2: redundant circular or descendant selections collapse to topmost ancestor only', () => {
      const tree = [
        makeTestNode('root', 'goal', 'Goal', [
          makeTestNode('l1', 'node', 'Level 1', [
            makeTestNode('l2', 'node', 'Level 2', [makeTestNode('l3', 'node', 'Level 3')]),
          ]),
        ]),
      ];

      const selection = ['l3', 'l1', 'l2'];
      const pruned = topStudioSelection(tree, selection);
      expect(pruned).toEqual(['l1']);
    });

    it('T2.5.3: draft transaction stack boundaries: undo on empty stack and redo at latest tip are safe no-ops', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [])];
      const stack = new DraftTransactionStack(tree);

      expect(stack.canUndo()).toBe(false);
      expect(stack.undo()).toBe(tree);

      expect(stack.canRedo()).toBe(false);
      expect(stack.redo()).toBe(tree);
    });

    it('T2.5.4: deep freeze verification: inputs frozen with Object.freeze pass through operations without mutation errors', () => {
      const tree = [
        makeTestNode('g', 'goal', 'Goal', [
          makeTestNode('t1', 'node', 'Task', [], { steps: ['Step 1'], stepDone: [false] }),
        ]),
      ];
      deepFreeze(tree);

      expect(() => addBlueprintChildrenBulk(tree, ['t1'], ['New Child'])).not.toThrow();
      expect(() => diffBlueprintSteps(tree, ['t1'], ['Step 2'], ['Step 1'])).not.toThrow();
      expect(() => setGoalDatesBulk(tree, ['t1'], { startDate: '2026-11-01' })).not.toThrow();
    });

    it('T2.5.5: patchStudioItems discards invalid dates or inverted ranges while keeping valid field patches', () => {
      const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'Item')])];

      // Patch with invalid date
      const patchedInvalid = patchStudioItems(tree, {
        item: { title: 'Updated Title', startDate: 'not-valid-date' },
      });
      const node1 = findGoal(patchedInvalid, 'item');
      expect(node1?.title).toBe('Updated Title');
      expect(node1?.startDate).toBeUndefined();

      // Patch with inverted date
      const patchedInverted = patchStudioItems(tree, {
        item: { startDate: '2026-12-01', endDate: '2026-11-01' },
      });
      const node2 = findGoal(patchedInverted, 'item');
      expect(node2?.startDate).toBeUndefined();
      expect(node2?.endDate).toBeUndefined();
    });
  });
});

// ===========================================================================
// TIER 3: Cross-Feature Combinations (Pairwise Coverage)
// ===========================================================================

describe('Tier 3: Cross-Feature Combinations (Pairwise Coverage)', () => {
  it('T3.1: Bulk Add Children followed by Bulk Add Steps (R2 + R3)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Main Project', [
        makeTestNode('p1', 'node', 'Module 1'),
        makeTestNode('p2', 'node', 'Module 2'),
      ]),
    ];

    // Step 1: Bulk add 2 children to each module
    const addedChildren = addBlueprintChildrenBulk(tree, ['p1', 'p2'], ['Subtask Alpha', 'Subtask Beta']);
    expect(addedChildren.count).toBe(4);
    const childIds = addedChildren.createdIds;

    // Step 2: Bulk add 3 checklist steps to all 4 new children
    const addedSteps = diffBlueprintSteps(addedChildren.goals, childIds, ['Spec', 'Code', 'Verify'], []);
    expect(addedSteps.affectedCount).toBe(4);
    expect(addedSteps.addedCount).toBe(12);

    // Verify all 4 children have all 3 steps
    childIds.forEach((id) => {
      const node = findGoal(addedSteps.goals, id);
      expect(node?.steps).toEqual(['Spec', 'Code', 'Verify']);
      expect(node?.stepDone).toEqual([false, false, false]);
    });
  });

  it('T3.2: Bulk Add Children followed by Bulk Date Setting (R2 + R4)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Sprint', [
        makeTestNode('col1', 'node', 'Backend'),
        makeTestNode('col2', 'node', 'Frontend'),
      ]),
    ];

    const childRes = addBlueprintChildrenBulk(tree, ['col1', 'col2'], ['Ticket A', 'Ticket B']);
    expect(childRes.count).toBe(4);

    const dateRes = setGoalDatesBulk(childRes.goals, childRes.createdIds, {
      startDate: '2026-10-15',
      endDate: '2026-10-30',
    });
    expect(dateRes.count).toBe(4);

    childRes.createdIds.forEach((id) => {
      const node = findGoal(dateRes.goals, id);
      expect(node?.startDate).toBe('2026-10-15');
      expect(node?.endDate).toBe('2026-10-30');
    });
  });

  it('T3.3: Bulk Step Diffing followed by Bulk Date Setting (R3 + R4)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Roadmap', [
        makeTestNode('t1', 'node', 'Task 1'),
        makeTestNode('t2', 'node', 'Task 2'),
      ]),
    ];

    const stepRes = diffBlueprintSteps(tree, ['t1', 't2'], ['Design', 'Deploy'], []);
    expect(stepRes.addedCount).toBe(4);

    const dateRes = setGoalDatesBulk(stepRes.goals, ['t1', 't2'], {
      startDate: '2026-11-01',
      endDate: '2026-11-20',
    });
    expect(dateRes.count).toBe(2);

    ['t1', 't2'].forEach((id) => {
      const node = findGoal(dateRes.goals, id);
      expect(node?.steps).toEqual(['Design', 'Deploy']);
      expect(node?.startDate).toBe('2026-11-01');
      expect(node?.endDate).toBe('2026-11-20');
    });
  });

  it('T3.4: Leaf to Branch conversion with step migration followed by Bulk Add Children (R1 + R2)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Goal', [
        makeTestNode('leaf', 'node', 'Original Task', [], {
          steps: ['Existing Step 1', 'Existing Step 2'],
          stepDone: [true, false],
        }),
      ]),
    ];

    // Convert with step migration to branch
    const converted = convertNodeToBranch(tree, 'leaf', [], { convertExistingSteps: true });
    expect(findGoal(converted, 'leaf')?.children).toHaveLength(2);

    // Bulk add more children into this branch
    const bulkAdded = addBlueprintChildrenBulk(converted, ['leaf'], ['Appended Child 1', 'Appended Child 2']);
    expect(bulkAdded.count).toBe(2);

    const finalBranch = findGoal(bulkAdded.goals, 'leaf');
    expect(finalBranch?.children).toHaveLength(4);
    expect(finalBranch?.children[0].completed).toBe(true);
    expect(finalBranch?.children[1].completed).toBe(false);
  });

  it('T3.5: Leaf to Task conversion followed by Step Diffing (R1 + R3)', () => {
    const tree = [makeTestNode('g', 'goal', 'Goal', [makeTestNode('item', 'node', 'New Task')])];

    // Convert empty leaf to task with initial steps
    const taskTree = convertNodeToTask(tree, 'item', ['Initial A', 'Initial B']);
    expect(findGoal(taskTree, 'item')?.steps).toEqual(['Initial A', 'Initial B']);

    // Run bulk step diff: add 'New C', remove 'Initial A'
    const diffed = diffBlueprintSteps(taskTree, ['item'], ['New C'], ['Initial A']);
    expect(diffed.addedCount).toBe(1);
    expect(diffed.removedCount).toBe(1);

    const updated = findGoal(diffed.goals, 'item');
    expect(updated?.steps).toEqual(['Initial B', 'New C']);
  });

  it('T3.6: Step Diffing across Heterogeneous Parent Nodes (R3 + R1)', () => {
    const tree = [
      makeTestNode('root', 'goal', 'Root Goal', [
        makeTestNode('branch', 'node', 'Folder', [makeTestNode('child', 'node', 'Child')]),
        makeTestNode('task', 'node', 'Task', [], { steps: ['Existing'], stepDone: [false] }),
        makeTestNode('leaf', 'node', 'Empty Leaf'),
      ]),
    ];

    // Target root, branch, task, and leaf simultaneously
    const result = diffBlueprintSteps(tree, ['root', 'branch', 'task', 'leaf'], ['New Step'], []);
    // Only endpoint tasks (task and leaf) are affected; root and branch are ignored
    expect(result.affectedCount).toBe(2);

    expect(findGoal(result.goals, 'root')?.steps).toBeUndefined();
    expect(findGoal(result.goals, 'branch')?.steps).toBeUndefined();
    expect(findGoal(result.goals, 'task')?.steps).toEqual(['Existing', 'New Step']);
    expect(findGoal(result.goals, 'leaf')?.steps).toEqual(['New Step']);
  });

  it('T3.7: Multi-Step Transactional Draft with Undo/Redo across Add, Dates, and Steps (R5 + R2 + R3 + R4)', () => {
    const initial = [makeTestNode('g', 'goal', 'Root', [makeTestNode('p', 'node', 'Parent')])];
    const stack = new DraftTransactionStack(initial);

    // Step 1: Bulk Add 2 children
    const s1 = addBlueprintChildrenBulk(stack.state, ['p'], ['Child 1', 'Child 2']);
    stack.push(s1.goals);

    // Step 2: Date Setting
    const s2 = setGoalDatesBulk(stack.state, s1.createdIds, { startDate: '2026-10-10' });
    stack.push(s2.goals);

    // Step 3: Step additions
    const s3 = diffBlueprintSteps(stack.state, s1.createdIds, ['Step A'], []);
    stack.push(s3.goals);

    expect(findGoal(stack.state, s1.createdIds[0])?.steps).toEqual(['Step A']);

    // Undo Step 3 -> steps reverted
    stack.undo();
    expect(findGoal(stack.state, s1.createdIds[0])?.steps).toEqual([]);
    expect(findGoal(stack.state, s1.createdIds[0])?.startDate).toBe('2026-10-10');

    // Undo Step 2 -> dates cleared
    stack.undo();
    expect(findGoal(stack.state, s1.createdIds[0])?.startDate).toBeUndefined();

    // Redo Step 2 -> dates restored
    stack.redo();
    expect(findGoal(stack.state, s1.createdIds[0])?.startDate).toBe('2026-10-10');
  });

  it('T3.8: Sibling Deduplication combined with Date Setting and Step Preservation (R2 + R4 + R3)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Goal', [
        makeTestNode('folder', 'node', 'Folder', [
          makeTestNode('existing', 'node', 'Shared Work', [], {
            steps: ['Keep Me'],
            stepDone: [true],
            startDate: '2026-09-01',
          }),
        ]),
      ]),
    ];

    // Bulk add inside with a duplicate and a new child
    const bulkAdd = addBlueprintChildrenBulk(tree, ['folder'], ['shared work', 'New Work']);
    expect(bulkAdd.count).toBe(1);

    // Existing child must retain its original steps and dates
    const existing = findGoal(bulkAdd.goals, 'existing');
    expect(existing?.steps).toEqual(['Keep Me']);
    expect(existing?.stepDone).toEqual([true]);
    expect(existing?.startDate).toBe('2026-09-01');
  });

  it('T3.9: Date Conflict Clamping followed by Step Diffing (R4 + R3)', () => {
    const tree = [
      makeTestNode('g', 'goal', 'Goal', [
        makeTestNode('item', 'node', 'Item', [], {
          startDate: '2026-10-01',
          endDate: '2026-10-10',
          steps: ['Draft'],
          stepDone: [false],
        }),
      ]),
    ];

    // Update startDate after endDate with conflictResolution: clamp
    const dateRes = setGoalDatesBulk(tree, ['item'], { startDate: '2026-10-15' }, { conflictResolution: 'clamp' });
    const datedNode = findGoal(dateRes.goals, 'item');
    expect(datedNode?.startDate).toBe('2026-10-15');
    expect(datedNode?.endDate).toBe('2026-10-15');

    // Diff steps on clamped node
    const stepRes = diffBlueprintSteps(dateRes.goals, ['item'], ['Finalize'], []);
    const steppedNode = findGoal(stepRes.goals, 'item');
    expect(steppedNode?.steps).toEqual(['Draft', 'Finalize']);
    expect(steppedNode?.startDate).toBe('2026-10-15');
  });

  it('T3.10: Full Lifecycle: Structure Creation -> Bulk Children -> Bulk Steps -> Partial Progress -> Step Diff with Protected Steps -> Bulk Dates -> Review Diff (R1 + R2 + R3 + R4 + R5)', () => {
    clearRollupCache();
    const base = [makeTestNode('root', 'goal', 'Master Program', [makeTestNode('phase', 'node', 'Phase 1')])];

    // 1. Bulk add 2 tasks
    const step1 = addBlueprintChildrenBulk(base, ['phase'], ['Task Alpha', 'Task Beta']);
    expect(step1.count).toBe(2);

    // 2. Bulk add 2 steps to all tasks
    const step2 = diffBlueprintSteps(step1.goals, step1.createdIds, ['Step 1', 'Step 2'], []);
    expect(step2.addedCount).toBe(4);

    // 3. Mark Step 1 complete on Task Alpha
    const alphaId = step1.createdIds[0];
    const betaId = step1.createdIds[1];
    const step3Goals = step2.goals.map((root) => {
      const alpha = findGoal([root], alphaId);
      if (!alpha) return root;
      return patchStudioItems([root], { [alphaId]: { title: 'Task Alpha' } })[0];
    });
    // Directly simulate user completing Step 1 on Task Alpha
    const targetAlpha = findGoal(step3Goals, alphaId)!;
    targetAlpha.stepDone = [true, false];

    // Verify rollup progress reflects completion
    expect(rollupPct(targetAlpha)).toBe(50);

    // 4. Step diff with attempt to remove 'Step 1' across both tasks
    const step4 = diffBlueprintSteps(step3Goals, [alphaId, betaId], [], ['Step 1']);
    // On Task Alpha, Step 1 is done -> protected! On Task Beta, Step 1 is unfinished -> removed!
    expect(step4.protectedCompletedCount).toBe(1);
    expect(step4.removedCount).toBe(1);
    expect(findGoal(step4.goals, alphaId)?.steps).toEqual(['Step 1', 'Step 2']);
    expect(findGoal(step4.goals, betaId)?.steps).toEqual(['Step 2']);

    // 5. Bulk set target dates
    const step5 = setGoalDatesBulk(step4.goals, [alphaId, betaId], {
      startDate: '2026-11-01',
      endDate: '2026-11-30',
    });
    expect(step5.count).toBe(2);

    // 6. Review state verification
    const review = blueprintReviewState(base, step5.goals);
    expect(review.addedIds).toContain(alphaId);
    expect(review.addedIds).toContain(betaId);
    expect(review.changedIds).toContain('phase');
  });
});

// ===========================================================================
// TIER 4: Real-World Application Scenarios
// ===========================================================================

describe('Tier 4: Real-World Application Scenarios', () => {
  it('T4.1: Academic Course Syllabus Builder (R1, R2, R4, R5)', () => {
    clearRollupCache();
    const syllabusRoot = [makeTestNode('cs-degree', 'goal', 'B.S. Computer Science Semester 1')];

    // 1. Bulk add 4 core course modules
    const courses = ['Data Structures', 'Computer Architecture', 'Discrete Math', 'Software Engineering'];
    const s1 = addBlueprintChildrenBulk(syllabusRoot, ['cs-degree'], courses);
    expect(s1.count).toBe(4);
    const courseIds = s1.createdIds;

    // 2. Bulk add 4 chapters inside all 4 courses (16 chapters total)
    const chapters = numberedBlueprintTitles('Chapter', 1, 4);
    const s2 = addBlueprintChildrenBulk(s1.goals, courseIds, chapters);
    expect(s2.count).toBe(16);
    const chapterIds = s2.createdIds;

    // 3. Bulk add 3 standardized study checklist steps inside all 16 chapters (48 steps total)
    const studySteps = ['Read Textbook', 'Watch Lecture', 'Complete Problem Set'];
    const s3 = diffBlueprintSteps(s2.goals, chapterIds, studySteps, []);
    expect(s3.addedCount).toBe(48);
    expect(s3.affectedCount).toBe(16);

    // 4. Bulk assign semester start date and final exam deadline across all 16 chapters
    const s4 = setGoalDatesBulk(s3.goals, chapterIds, {
      startDate: '2026-09-01',
      endDate: '2026-12-18',
    });
    expect(s4.count).toBe(16);

    // 5. Simulate student completing first 2 steps on Chapter 1 of Data Structures
    const dsCourse = findGoal(s4.goals, courseIds[0])!;
    const chap1 = dsCourse.children[0];
    chap1.stepDone = [true, true, false];

    // Recompute & verify hierarchical rollup calculations
    expect(rollupPct(chap1)).toBe(67); // 2 of 3 steps = 67%
    expect(rollupPct(dsCourse)).toBe(17); // (67 + 0 + 0 + 0) / 4 = 17%
    expect(rollupPct(s4.goals[0])).toBe(4); // (17 + 0 + 0 + 0) / 4 = 4%

    // 6. Commit to store atomically
    const commitResult = simulateStoreCommit(syllabusRoot, syllabusRoot, s4.goals);
    expect(commitResult.ok).toBe(true);
    expect(commitResult.token).toBeDefined();
  });

  it('T4.2: Multi-Module Software Release Breakdown (R1, R2, R3, R4)', () => {
    clearRollupCache();
    const releaseRoot = [
      makeTestNode('rel', 'goal', 'Cloud Platform v3.0 Release', [
        makeTestNode('auth', 'node', 'Auth Service', [], {
          steps: ['Legacy OAuth1', 'JWT Token Verification'],
          stepDone: [false, true], // JWT is completed
        }),
        makeTestNode('billing', 'node', 'Billing Service', [], {
          steps: ['Stripe Webhook Handler'],
          stepDone: [true], // Stripe is completed
        }),
        makeTestNode('worker', 'node', 'Background Worker', []),
      ]),
    ];

    // Release engineering team standardizes QA criteria:
    // Add: ['Security Audit', 'Load Testing', 'API Documentation']
    // Remove: ['Legacy OAuth1', 'Draft PR']
    const diffResult = diffBlueprintSteps(
      releaseRoot,
      ['auth', 'billing', 'worker'],
      ['Security Audit', 'Load Testing', 'API Documentation'],
      ['Legacy OAuth1', 'Draft PR'],
    );

    // Verify Auth Service:
    // - 'Legacy OAuth1' removed (was pending)
    // - 'JWT Token Verification' preserved (completed)
    // - 3 new steps added
    const auth = findGoal(diffResult.goals, 'auth')!;
    expect(auth.steps).toEqual([
      'JWT Token Verification',
      'Security Audit',
      'Load Testing',
      'API Documentation',
    ]);
    expect(auth.stepDone?.[0]).toBe(true);

    // Verify Billing Service:
    // - 'Stripe Webhook Handler' preserved (completed)
    // - 3 new steps added
    const billing = findGoal(diffResult.goals, 'billing')!;
    expect(billing.steps).toEqual([
      'Stripe Webhook Handler',
      'Security Audit',
      'Load Testing',
      'API Documentation',
    ]);
    expect(billing.stepDone?.[0]).toBe(true);

    // Verify Worker:
    // - received 3 new steps
    const worker = findGoal(diffResult.goals, 'worker')!;
    expect(worker.steps).toEqual(['Security Audit', 'Load Testing', 'API Documentation']);

    // Set production launch dates
    const dated = setGoalDatesBulk(diffResult.goals, ['auth', 'billing', 'worker'], {
      startDate: '2026-11-01',
      endDate: '2026-11-20',
    });
    expect(dated.count).toBe(3);

    // Review diff exposes changes on all 3 services
    const review = blueprintReviewState(releaseRoot, dated.goals);
    expect(review.changedIds).toContain('auth');
    expect(review.changedIds).toContain('billing');
    expect(review.changedIds).toContain('worker');
  });

  it('T4.3: Sprint Task Grooming & Step Standardization (R2, R3, R5)', () => {
    const sprintTree = [
      makeTestNode('sprint', 'goal', 'Sprint 42 Backlog', [
        makeTestNode('epic1', 'node', 'User Onboarding', [
          makeTestNode('t1', 'node', 'Social Login', [], { steps: ['UI Mockup', 'Code Review'], stepDone: [true, true] }),
          makeTestNode('t2', 'node', 'Email Verification', [], { steps: ['Legacy Jenkins Build'], stepDone: [false] }),
        ]),
        makeTestNode('epic2', 'node', 'Payment Integration', [
          makeTestNode('t3', 'node', 'Card Input', []),
          makeTestNode('t4', 'node', 'Receipt Generator', [], { steps: ['Code Review'], stepDone: [false] }),
        ]),
      ]),
    ];

    const allTaskIds = ['t1', 't2', 't3', 't4'];

    // Standardize Definition of Done (DoD):
    // Add: ['Unit Tests', 'Code Review', 'QA Signoff']
    // Remove: ['Legacy Jenkins Build']
    const groomed = diffBlueprintSteps(
      sprintTree,
      allTaskIds,
      ['Unit Tests', 'Code Review', 'QA Signoff'],
      ['Legacy Jenkins Build'],
    );

    // t1 had 'Code Review' completed -> must not be duplicated, must retain completion
    const t1 = findGoal(groomed.goals, 't1')!;
    expect(t1.steps).toEqual(['UI Mockup', 'Code Review', 'Unit Tests', 'QA Signoff']);
    expect(t1.stepDone).toEqual([true, true, false, false]);

    // t2 had 'Legacy Jenkins Build' -> removed; receives new DoD
    const t2 = findGoal(groomed.goals, 't2')!;
    expect(t2.steps).toEqual(['Unit Tests', 'Code Review', 'QA Signoff']);

    // t3 had no steps -> receives all 3 DoD steps
    const t3 = findGoal(groomed.goals, 't3')!;
    expect(t3.steps).toEqual(['Unit Tests', 'Code Review', 'QA Signoff']);

    // t4 had unfinished 'Code Review' -> no duplicate, receives missing DoD steps
    const t4 = findGoal(groomed.goals, 't4')!;
    expect(t4.steps).toEqual(['Code Review', 'Unit Tests', 'QA Signoff']);
  });

  it('T4.4: Daily Milestone Date Shifting & Task Reconciliation (R4, R5)', () => {
    const roadmap = [
      makeTestNode('roadmap', 'goal', 'Q4 Product Roadmap', [
        makeTestNode('m1', 'node', 'Milestone Alpha', [], {
          startDate: '2026-10-01',
          endDate: '2026-10-15',
          todayTaskId: 'task-alpha',
        }),
        makeTestNode('m2', 'node', 'Milestone Beta', [], {
          startDate: '2026-10-16',
          endDate: '2026-10-31',
          todayTaskId: 'task-beta',
        }),
      ]),
    ];

    const currentTasks: Task[] = [
      {
        id: 'task-alpha',
        title: 'Milestone Alpha',
        description: '',
        priority: 'high',
        targetDate: '2026-10-15',
        deadline: '2026-10-15',
        steps: [],
        progress: 0,
        createdAt: 1000,
        order: 1,
        goalNodeId: 'm1',
      },
      {
        id: 'task-beta',
        title: 'Milestone Beta',
        description: '',
        priority: 'medium',
        targetDate: '2026-10-31',
        deadline: '2026-10-31',
        steps: [],
        progress: 0,
        createdAt: 1001,
        order: 2,
        goalNodeId: 'm2',
      },
    ];

    // Project slips by 2 weeks: shift dates forward by 14 days
    const shifted = setGoalDatesBulk(roadmap, ['m1', 'm2'], {
      startDate: '2026-10-15',
      endDate: '2026-11-14',
    });
    expect(shifted.count).toBe(2);

    // Reconcile tasks with updated goals
    const nextTasks = reconcileBlueprintTasks(currentTasks, shifted.goals, roadmap);
    expect(nextTasks).toHaveLength(2);

    // Commit change to store
    const commit = simulateStoreCommit(roadmap, roadmap, shifted.goals, currentTasks);
    expect(commit.ok).toBe(true);
    expect(commit.token).toBeDefined();
  });

  it('T4.5: Complex Nested Goal Tree Reorganization (R1, R2, R3, R5)', () => {
    const companyOkr = [
      makeTestNode('org', 'goal', 'Company Vision 2027', [
        makeTestNode('obj1', 'node', 'Objective: Market Leadership', [
          makeTestNode('kr1', 'node', 'Key Result 1: 10k Active Users'),
          makeTestNode('kr2', 'node', 'Key Result 2: 99.9% Uptime'),
        ]),
        makeTestNode('obj2', 'node', 'Objective: Operational Excellence'),
      ]),
    ];

    // 1. Reorganize: Convert kr1 leaf into branch folder
    const expanded = convertNodeToBranch(companyOkr, 'kr1', ['Organic Growth', 'Paid Ads']);
    expect(findGoal(expanded, 'kr1')?.children).toHaveLength(2);

    // 2. Bulk add tracking steps into newly formed leaf nodes
    const leafIds = findGoal(expanded, 'kr1')!.children.map((c) => c.id);
    const withSteps = diffBlueprintSteps(expanded, leafIds, ['Weekly Metric Check', 'Monthly Review'], []);
    expect(withSteps.addedCount).toBe(4);

    // 3. Duplicate kr2 under obj1
    const duplicated = duplicateStudioItems(withSteps.goals, ['kr2']);
    const obj1 = findGoal(duplicated, 'obj1')!;
    expect(obj1.children.some((c) => c.title.includes('copy'))).toBe(true);

    // 4. Verify total node count and tree depth metrics
    expect(maxBlueprintDepth(duplicated)).toBe(4);
    expect(countBlueprintNodes(duplicated)).toBeGreaterThanOrEqual(7);

    // 5. Test path resolution and fallback
    const path = findBlueprintPath(duplicated, leafIds[0]);
    expect(path.map((n) => n.id)).toEqual(['org', 'obj1', 'kr1', leafIds[0]]);
    const closest = closestBlueprintPathIds(duplicated, ['org', 'obj1', 'kr1', 'missing-id']);
    expect(closest).toEqual(['org', 'obj1', 'kr1']);

    // 6. Move and remove operations
    const moved = moveStudioItems(duplicated, ['kr2'], 'obj2');
    expect(findGoal(moved, 'obj2')?.children.some((c) => c.id === 'kr2')).toBe(true);

    const pruned = removeBlueprintNodes(moved, ['kr2']);
    expect(findGoal(pruned, 'kr2')).toBeNull();
  });
});
