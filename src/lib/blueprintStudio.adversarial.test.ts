import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../types';
import {
  convertNodeToBranch,
  convertNodeToTask,
  isValidISODate,
  setGoalDatesBulk,
  validateGoalDates,
} from './blueprintStudio';

function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val !== null && typeof val === 'object') {
      deepFreeze(val);
    }
  }
  return obj;
}

function makeNode(id: string, kind: GoalNode['kind'], title: string, children: GoalNode[] = []): GoalNode {
  return { id, kind, title, children, createdAt: 1, completed: false };
}

describe('Challenger 2 Adversarial Stress Suite', () => {
  describe('Probe 1: isValidISODate & validateGoalDates', () => {
    it('probes leap years and century rules', () => {
      // 2024 is a leap year (divisible by 4)
      expect(isValidISODate('2024-02-29')).toBe(true);
      // 2025 is not a leap year
      expect(isValidISODate('2025-02-29')).toBe(false);
      // 2026 is not a leap year
      expect(isValidISODate('2026-02-29')).toBe(false);
      // 2000 is a leap year (divisible by 400)
      expect(isValidISODate('2000-02-29')).toBe(true);
      // 2100 is NOT a leap year (century not divisible by 400)
      expect(isValidISODate('2100-02-29')).toBe(false);
      // 1900 is NOT a leap year (century not divisible by 400)
      expect(isValidISODate('1900-02-29')).toBe(false);
    });

    it('probes month lengths and calendar limits', () => {
      // February 30 and 31
      expect(isValidISODate('2026-02-30')).toBe(false);
      expect(isValidISODate('2026-02-31')).toBe(false);
      // 30-day months probed with 31
      expect(isValidISODate('2026-04-31')).toBe(false); // April
      expect(isValidISODate('2026-06-31')).toBe(false); // June
      expect(isValidISODate('2026-09-31')).toBe(false); // September
      expect(isValidISODate('2026-11-31')).toBe(false); // November
      // 31-day months probed with 31
      expect(isValidISODate('2026-01-31')).toBe(true);
      expect(isValidISODate('2026-03-31')).toBe(true);
      expect(isValidISODate('2026-05-31')).toBe(true);
      expect(isValidISODate('2026-07-31')).toBe(true);
      expect(isValidISODate('2026-08-31')).toBe(true);
      expect(isValidISODate('2026-10-31')).toBe(true);
      expect(isValidISODate('2026-12-31')).toBe(true);
      // Out of range months
      expect(isValidISODate('2026-00-15')).toBe(false);
      expect(isValidISODate('2026-13-15')).toBe(false);
      // Out of range days
      expect(isValidISODate('2026-01-00')).toBe(false);
      expect(isValidISODate('2026-01-32')).toBe(false);
    });

    it('probes bad formats, types, and strings', () => {
      expect(isValidISODate('2026/05/01')).toBe(false);
      expect(isValidISODate('01-05-2026')).toBe(false);
      expect(isValidISODate('2026-5-1')).toBe(false);
      expect(isValidISODate('abc')).toBe(false);
      expect(isValidISODate('')).toBe(false);
      expect(isValidISODate('   ')).toBe(false);
      expect(isValidISODate('2026-05-01T00:00:00Z')).toBe(false);
      expect(isValidISODate(null)).toBe(false);
      expect(isValidISODate(undefined)).toBe(false);
      expect(isValidISODate(12345 as any)).toBe(false);
      expect(isValidISODate({} as any)).toBe(false);
    });

    it('validateGoalDates handles inverted ranges, valid ranges, and edge cases', () => {
      // Inverted range
      const inverted = validateGoalDates({ startDate: '2026-05-10', endDate: '2026-05-01' });
      expect(inverted.valid).toBe(false);
      expect(inverted.error).toContain('cannot be after');

      // Equal dates (single-day span)
      expect(validateGoalDates({ startDate: '2026-05-01', endDate: '2026-05-01' }).valid).toBe(true);

      // Normal valid span
      expect(validateGoalDates({ startDate: '2026-05-01', endDate: '2026-05-10' }).valid).toBe(true);

      // Invalid dates in input
      expect(validateGoalDates({ startDate: '2026-02-31' }).valid).toBe(false);
      expect(validateGoalDates({ endDate: '2025-02-29' }).valid).toBe(false);
      expect(validateGoalDates({ startDate: '2026/05/01' }).valid).toBe(false);
      expect(validateGoalDates({ startDate: 'abc' }).valid).toBe(false);

      // clearAll flag bypasses date checks
      expect(validateGoalDates({ clearAll: true, startDate: 'invalid' }).valid).toBe(true);

      // null and empty clearing
      expect(validateGoalDates({ startDate: null, endDate: null }).valid).toBe(true);
      expect(validateGoalDates({ startDate: '', endDate: '' }).valid).toBe(true);
      expect(validateGoalDates({}).valid).toBe(true);
    });
  });

  describe('Probe 2: setGoalDatesBulk & Conflict Resolution Policies', () => {
    it('probes conflictResolution: clear when new startDate > existing endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), endDate: '2026-05-10' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-05-20' }, { conflictResolution: 'clear' });
      expect(res.count).toBe(1);
      expect(res.adjustedCount).toBe(1);
      expect(res.goals[0].children[0].startDate).toBe('2026-05-20');
      expect(res.goals[0].children[0].endDate).toBeUndefined();
    });

    it('probes conflictResolution: clamp when new startDate > existing endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), endDate: '2026-05-10' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-05-20' }, { conflictResolution: 'clamp' });
      expect(res.count).toBe(1);
      expect(res.adjustedCount).toBe(1);
      expect(res.goals[0].children[0].startDate).toBe('2026-05-20');
      expect(res.goals[0].children[0].endDate).toBe('2026-05-20');
    });

    it('probes conflictResolution: skip when new startDate > existing endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), endDate: '2026-05-10' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-05-20' }, { conflictResolution: 'skip' });
      expect(res.count).toBe(0);
      expect(res.adjustedCount).toBe(0);
      expect(res.goals[0].children[0].startDate).toBeUndefined();
      expect(res.goals[0].children[0].endDate).toBe('2026-05-10');
    });

    it('probes conflictResolution: clear when existing startDate > new endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-05-20' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { endDate: '2026-05-10' }, { conflictResolution: 'clear' });
      expect(res.count).toBe(1);
      expect(res.adjustedCount).toBe(1);
      expect(res.goals[0].children[0].startDate).toBeUndefined();
      expect(res.goals[0].children[0].endDate).toBe('2026-05-10');
    });

    it('probes conflictResolution: clamp when existing startDate > new endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-05-20' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { endDate: '2026-05-10' }, { conflictResolution: 'clamp' });
      expect(res.count).toBe(1);
      expect(res.adjustedCount).toBe(1);
      expect(res.goals[0].children[0].startDate).toBe('2026-05-10');
      expect(res.goals[0].children[0].endDate).toBe('2026-05-10');
    });

    it('probes conflictResolution: skip when existing startDate > new endDate', () => {
      const node = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-05-20' };
      const goals = [makeNode('g', 'goal', 'Goal', [node])];

      const res = setGoalDatesBulk(goals, ['n1'], { endDate: '2026-05-10' }, { conflictResolution: 'skip' });
      expect(res.count).toBe(0);
      expect(res.adjustedCount).toBe(0);
      expect(res.goals[0].children[0].startDate).toBe('2026-05-20');
      expect(res.goals[0].children[0].endDate).toBeUndefined();
    });

    it('probes partial conflicts across multiple selected nodes with policy skip', () => {
      const n1 = { ...makeNode('n1', 'node', 'Conflicts'), endDate: '2026-05-10' };
      const n2 = { ...makeNode('n2', 'node', 'Compatible'), endDate: '2026-05-30' };
      const n3 = makeNode('n3', 'node', 'No Dates');
      const goals = [makeNode('g', 'goal', 'Goal', [n1, n2, n3])];

      const res = setGoalDatesBulk(goals, ['n1', 'n2', 'n3'], { startDate: '2026-05-20' }, { conflictResolution: 'skip' });
      expect(res.count).toBe(2);
      expect(res.adjustedCount).toBe(0);
      expect(res.goals[0].children[0].startDate).toBeUndefined(); // n1 skipped
      expect(res.goals[0].children[0].endDate).toBe('2026-05-10');
      expect(res.goals[0].children[1].startDate).toBe('2026-05-20'); // n2 updated
      expect(res.goals[0].children[1].endDate).toBe('2026-05-30');
      expect(res.goals[0].children[2].startDate).toBe('2026-05-20'); // n3 updated
    });

    it('probes date clearing with null, empty string, and clearAll', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      // Clearing via null
      const resNull = setGoalDatesBulk(goals, ['n1'], { startDate: null, endDate: null });
      expect(resNull.goals[0].children[0].startDate).toBeUndefined();
      expect(resNull.goals[0].children[0].endDate).toBeUndefined();

      // Clearing via empty string ''
      const resEmpty = setGoalDatesBulk(goals, ['n1'], { startDate: '', endDate: '' });
      expect(resEmpty.goals[0].children[0].startDate).toBeUndefined();
      expect(resEmpty.goals[0].children[0].endDate).toBeUndefined();

      // Clearing via clearAll: true
      const resClearAll = setGoalDatesBulk(goals, ['n1'], { clearAll: true });
      expect(resClearAll.goals[0].children[0].startDate).toBeUndefined();
      expect(resClearAll.goals[0].children[0].endDate).toBeUndefined();
    });

    it('EMPIRICAL BUG RESOLVED: whitespace string "   " clears date properties instead of setting ""', () => {
      const dated = { ...makeNode('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-15' };
      const goals = [makeNode('g', 'goal', 'Goal', [dated])];

      const resWhitespace = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
      expect(resWhitespace.goals[0].children[0].startDate).toBeUndefined();
      expect(resWhitespace.goals[0].children[0].endDate).toBeUndefined();
      expect('startDate' in resWhitespace.goals[0].children[0]).toBe(false);
      expect('endDate' in resWhitespace.goals[0].children[0]).toBe(false);
    });

    it('probes tree immutability under setGoalDatesBulk', () => {
      const original = deepFreeze([
        makeNode('g', 'goal', 'Goal', [
          makeNode('n1', 'node', 'Item 1'),
          makeNode('n2', 'node', 'Item 2'),
        ]),
      ]);

      const res = setGoalDatesBulk(original, ['n1'], { startDate: '2026-10-10', endDate: '2026-10-20' });
      expect(res.goals).not.toBe(original);
      expect(res.goals[0].children[0].startDate).toBe('2026-10-10');
      expect((original[0].children[0] as any).startDate).toBeUndefined();
      // Structural sharing: unaffected child n2 should be referentially preserved
      expect(res.goals[0].children[1]).toBe(original[0].children[1]);
    });
  });

  describe('Probe 3: convertNodeToBranch', () => {
    it('converts an empty leaf into a branch', () => {
      const leaf = makeNode('leaf-1', 'leaf', 'Leaf Task');
      const goals = [makeNode('g', 'goal', 'Goal', [leaf])];

      const res = convertNodeToBranch(goals, 'leaf-1', ['Child A', 'Child B']);
      const converted = res[0].children[0];

      expect(converted.kind).toBe('node');
      expect(converted.children).toHaveLength(2);
      expect(converted.children[0].title).toBe('Child A');
      expect(converted.children[1].title).toBe('Child B');
      expect(converted.steps).toBeUndefined();
      expect(converted.stepDone).toBeUndefined();
      expect(converted.completed).toBe(false);
    });

    it('converts a task with existing steps: convertExistingSteps=false clears steps', () => {
      const task = {
        ...makeNode('task-1', 'node', 'Task with steps'),
        steps: ['Step 1', 'Step 2'],
        stepDone: [false, true],
        todayTaskId: 'today-123',
      };
      const goals = [makeNode('g', 'goal', 'Goal', [task])];

      const res = convertNodeToBranch(goals, 'task-1', ['New Branch Child'], { convertExistingSteps: false });
      const converted = res[0].children[0];

      expect(converted.children).toHaveLength(1);
      expect(converted.children[0].title).toBe('New Branch Child');
      expect(converted.steps).toBeUndefined();
      expect(converted.stepDone).toBeUndefined();
      expect(converted.todayTaskId).toBeNull();
    });

    it('converts a task with existing steps: convertExistingSteps=true converts steps to child nodes and preserves completion', () => {
      const task = {
        ...makeNode('task-1', 'node', 'Task with steps'),
        steps: ['Step 1', 'Step 2'],
        stepDone: [true, false],
        todayTaskId: 'today-123',
      };
      const goals = [makeNode('g', 'goal', 'Goal', [task])];

      const res = convertNodeToBranch(goals, 'task-1', ['Extra Child'], { convertExistingSteps: true });
      const converted = res[0].children[0];

      expect(converted.children).toHaveLength(3);
      expect(converted.children[0].title).toBe('Step 1');
      expect(converted.children[0].completed).toBe(true);
      expect(converted.children[1].title).toBe('Step 2');
      expect(converted.children[1].completed).toBe(false);
      expect(converted.children[2].title).toBe('Extra Child');
      expect(converted.children[2].completed).toBe(false);
      expect(converted.steps).toBeUndefined();
      expect(converted.stepDone).toBeUndefined();
      expect(converted.todayTaskId).toBeNull();
      expect(converted.completed).toBe(false);
    });

    it('converts a node where ALL steps were completed: parent completed status rolls up correctly', () => {
      const task = {
        ...makeNode('task-1', 'node', 'Completed task'),
        steps: ['Step 1', 'Step 2'],
        stepDone: [true, true],
        completed: true,
      };
      const goals = [makeNode('g', 'goal', 'Goal', [task])];

      const res = convertNodeToBranch(goals, 'task-1', [], { convertExistingSteps: true });
      const converted = res[0].children[0];

      expect(converted.children).toHaveLength(2);
      expect(converted.children[0].completed).toBe(true);
      expect(converted.children[1].completed).toBe(true);
      // Since all converted children are completed and no new uncompleted children were added, parent should remain completed!
      expect(converted.completed).toBe(true);
    });

    it('deduplicates initialChildTitles against converted steps case-insensitively', () => {
      const task = {
        ...makeNode('task-1', 'node', 'Task with steps'),
        steps: ['Research', 'Draft'],
        stepDone: [false, false],
      };
      const goals = [makeNode('g', 'goal', 'Goal', [task])];

      const res = convertNodeToBranch(goals, 'task-1', ['draft', 'RESEARCH', 'Publish'], { convertExistingSteps: true });
      const converted = res[0].children[0];

      expect(converted.children).toHaveLength(3);
      expect(converted.children.map((c) => c.title)).toEqual(['Research', 'Draft', 'Publish']);
    });

    it('probes tree immutability under convertNodeToBranch', () => {
      const original = deepFreeze([
        makeNode('g', 'goal', 'Goal', [
          {
            ...makeNode('n1', 'leaf', 'Frozen leaf'),
            steps: ['Step A', 'Step B'],
            stepDone: [true, false],
          },
          makeNode('unaffected', 'node', 'Unaffected Sibling'),
        ]),
      ]);

      const res = convertNodeToBranch(original, 'n1', ['Child X'], { convertExistingSteps: true });
      expect(res).not.toBe(original);
      expect(res[0].children[0].children).toHaveLength(3);
      expect((original[0].children[0] as any).steps).toEqual(['Step A', 'Step B']);
      // Structural sharing on unaffected sibling
      expect(res[0].children[1]).toBe(original[0].children[1]);
    });
  });

  describe('Probe 4: convertNodeToTask', () => {
    it('converts an empty leaf into an executable task with steps', () => {
      const leaf = makeNode('leaf-1', 'leaf', 'Leaf');
      const goals = [makeNode('g', 'goal', 'Goal', [leaf])];

      const res = convertNodeToTask(goals, 'leaf-1', ['Step 1', 'Step 2']);
      const converted = res[0].children[0];

      expect(converted.kind).toBe('node');
      expect(converted.steps).toEqual(['Step 1', 'Step 2']);
      expect(converted.stepDone).toEqual([false, false]);
      expect(converted.completed).toBe(false);
    });

    it('normalizes and deduplicates initial checklist steps', () => {
      const leaf = makeNode('leaf-1', 'node', 'Item');
      const goals = [makeNode('g', 'goal', 'Goal', [leaf])];

      const res = convertNodeToTask(goals, 'leaf-1', ['  Step A  ', 'step a', '', '   ', 'Step B']);
      const converted = res[0].children[0];

      expect(converted.steps).toEqual(['Step A', 'Step B']);
      expect(converted.stepDone).toEqual([false, false]);
    });

    it('replaces steps cleanly on a task that already had steps', () => {
      const task = {
        ...makeNode('task-1', 'node', 'Task'),
        steps: ['Old 1', 'Old 2'],
        stepDone: [true, true],
        completed: true,
      };
      const goals = [makeNode('g', 'goal', 'Goal', [task])];

      const res = convertNodeToTask(goals, 'task-1', ['New 1']);
      const converted = res[0].children[0];

      expect(converted.steps).toEqual(['New 1']);
      expect(converted.stepDone).toEqual([false]);
      expect(converted.completed).toBe(false);
    });

    it('PROTECTS branches with children from invalid task conversion', () => {
      const branch = makeNode('b1', 'node', 'Branch', [makeNode('c1', 'node', 'Child')]);
      const goals = [makeNode('g', 'goal', 'Goal', [branch])];

      const res = convertNodeToTask(goals, 'b1', ['Invalid Step']);
      expect(res).toBe(goals);
      expect(res[0].children[0].steps).toBeUndefined();
    });

    it('PROTECTS root goal from invalid task conversion', () => {
      const goals = [makeNode('g', 'goal', 'Goal', [])];

      const res = convertNodeToTask(goals, 'g', ['Invalid Step']);
      expect(res).toBe(goals);
      expect(res[0].steps).toBeUndefined();
    });

    it('probes tree immutability under convertNodeToTask', () => {
      const original = deepFreeze([
        makeNode('g', 'goal', 'Goal', [
          makeNode('leaf-1', 'leaf', 'Frozen leaf'),
          makeNode('unaffected', 'node', 'Unaffected'),
        ]),
      ]);

      const res = convertNodeToTask(original, 'leaf-1', ['Step 1']);
      expect(res).not.toBe(original);
      expect(res[0].children[0].steps).toEqual(['Step 1']);
      expect((original[0].children[0] as any).steps).toBeUndefined();
      // Structural sharing on unaffected sibling
      expect(res[0].children[1]).toBe(original[0].children[1]);
    });
  });

  describe('Probe 5: Scalability & Stress', () => {
    it('handles deep trees up to depth 50 without stack overflow', () => {
      let current = makeNode('leaf-deep', 'leaf', 'Deep Leaf');
      for (let i = 49; i >= 1; i--) {
        current = makeNode(`node-${i}`, 'node', `Level ${i}`, [current]);
      }
      const root = makeNode('root', 'goal', 'Root', [current]);
      const tree = deepFreeze([root]);

      const res = convertNodeToBranch(tree, 'leaf-deep', ['Child Alpha', 'Child Beta']);
      expect(res).not.toBe(tree);
      // Verify node at depth 50 got children
      let target = res[0];
      while (target.children.length > 0 && target.id !== 'leaf-deep') {
        target = target.children[0];
      }
      expect(target.id).toBe('leaf-deep');
      expect(target.children).toHaveLength(2);
    });

    it('handles bulk date updates on 500 nodes efficiently', () => {
      const children: GoalNode[] = [];
      const targetIds: string[] = [];
      for (let i = 0; i < 500; i++) {
        const id = `bulk-${i}`;
        children.push(makeNode(id, 'node', `Item ${i}`));
        targetIds.push(id);
      }
      const root = makeNode('root', 'goal', 'Root', children);
      const tree = [root];

      const start = performance.now();
      const res = setGoalDatesBulk(tree, targetIds, { startDate: '2026-10-01', endDate: '2026-10-31' });
      const elapsed = performance.now() - start;

      expect(res.count).toBe(500);
      expect(elapsed).toBeLessThan(100); // Must be under 100ms
    });
  });
});
