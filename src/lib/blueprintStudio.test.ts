import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../types';
import {
  addBlueprintChildren,
  addBlueprintChildrenBulk,
  addBlueprintSteps,
  blueprintReviewState,
  closestBlueprintPathIds,
  collectBlueprintStepsSummary,
  convertNodeToBranch,
  convertNodeToTask,
  countBlueprintNodes,
  diffBlueprintSteps,
  groupBlueprintChildren,
  isValidISODate,
  maxBlueprintDepth,
  normalizeBlueprintTitles,
  numberedBlueprintTitles,
  removeBlueprintNodes,
  removeBlueprintSteps,
  reconcileBlueprintTasks,
  renameBlueprintStep,
  renameBlueprintNodes,
  setGoalDates,
  setGoalDatesBulk,
  updateBlueprintNodes,
} from './blueprintStudio';
import { patchStudioItems } from './studioWorkspace';

function node(id: string, kind: GoalNode['kind'], title: string, children: GoalNode[] = []): GoalNode {
  return { id, kind, title, children, createdAt: 1, completed: false };
}

describe('Blueprint Studio tree operations', () => {
  it('normalizes empty and duplicate titles without changing order', () => {
    expect(normalizeBlueprintTitles([' Alpha ', '', 'alpha', 'Beta   two'])).toEqual(['Alpha', 'Beta two']);
  });

  it('creates a bounded numbered sequence', () => {
    expect(numberedBlueprintTitles('Phase', 2, 3)).toEqual(['Phase 2', 'Phase 3', 'Phase 4']);
    expect(numberedBlueprintTitles('', 1, 500)).toHaveLength(100);
  });

  it('adds the same children to multiple parents and skips existing sibling names', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'phase', 'One'), node('p2', 'phase', 'Two', [node('s', 'section', 'Shared')])])];
    const result = addBlueprintChildren(goals, ['p1', 'p2'], 'section', ['Shared', 'Unique']);
    expect(result.added).toBe(3);
    expect(result.createdIds).toHaveLength(3);
    expect(result.goals[0].children[0].children.map((item) => item.title)).toEqual(['Shared', 'Unique']);
    expect(result.goals[0].children[1].children.map((item) => item.title)).toEqual(['Shared', 'Unique']);
    expect(goals[0].children[0].children).toHaveLength(0);
  });

  it('builds generic items at arbitrary depth', () => {
    const goals = [node('g', 'goal', 'Exam', [node('a', 'node', 'Stage')])];
    const levelTwo = addBlueprintChildren(goals, ['a'], 'node', ['Subject']);
    const subject = levelTwo.goals[0].children[0].children[0];
    const levelThree = addBlueprintChildren(levelTwo.goals, [subject.id], 'node', ['Chapter']);
    const chapter = levelThree.goals[0].children[0].children[0].children[0];
    const levelFour = addBlueprintChildren(levelThree.goals, [chapter.id], 'node', ['Lecture']);

    expect(maxBlueprintDepth(levelFour.goals)).toBe(5);
    expect(levelFour.goals[0].children[0].children[0].children[0].children[0]).toMatchObject({
      kind: 'node', title: 'Lecture', children: [],
    });
  });

  it('protects scheduled, completed, or checklist tasks from silently becoming a branch when requested', () => {
    const untouched = node('open', 'node', 'Can grow');
    const checklist = { ...node('steps', 'leaf', 'Checklist'), steps: ['Read'], stepDone: [false] };
    const completed = { ...node('done', 'task', 'Finished'), completed: true };
    const scheduled = { ...node('planned', 'section', 'Planned'), todayTaskId: 'task-1' };
    const goals = [node('g', 'goal', 'Exam', [untouched, checklist, completed, scheduled])];

    const result = addBlueprintChildren(goals, ['open', 'steps', 'done', 'planned'], 'node', ['Child'], { disallowExecutionState: true });

    expect(result.added).toBe(1);
    expect(result.blocked).toBe(3);
    expect(result.goals[0].children[0].children[0].title).toBe('Child');
    expect(result.goals[0].children.slice(1).every((entry) => entry.children.length === 0)).toBe(true);

    // Modern non-blocking behavior adds to all parents without blocking
    const modernResult = addBlueprintChildren(goals, ['open', 'steps', 'done', 'planned'], 'node', ['Child']);
    expect(modernResult.added).toBe(4);
    expect(modernResult.blocked).toBe(0);
  });

  it('adds only missing steps and preserves completed step state', () => {
    const leaf = { ...node('l', 'leaf', 'Leaf'), steps: ['Do'], stepDone: [true], completed: true };
    const result = addBlueprintSteps([leaf], ['l'], ['do', 'Check']);
    expect(result.added).toBe(1);
    expect(result.goals[0].steps).toEqual(['Do', 'Check']);
    expect(result.goals[0].stepDone).toEqual([true, false]);
    expect(result.goals[0].completed).toBe(false);
  });

  it('adds steps to any endpoint but not to roots or branches', () => {
    const endpoint = node('endpoint', 'phase', 'Legacy endpoint');
    const group = node('group', 'node', 'Branch', [node('child', 'node', 'Child')]);
    const goal = node('g', 'goal', 'Goal', [endpoint, group]);
    const result = addBlueprintSteps([goal], ['g', 'endpoint', 'group'], ['Check']);
    expect(result.goals[0].steps).toBeUndefined();
    expect(result.goals[0].children[0].steps).toEqual(['Check']);
    expect(result.goals[0].children[1].steps).toBeUndefined();
    expect(result.added).toBe(1);
    expect(result.affected).toBe(1);
  });

  it('removes unfinished bulk steps while protecting completed work', () => {
    const first = { ...node('l1', 'leaf', 'One'), steps: ['Read', 'Revise', 'Test'], stepDone: [true, false, false] };
    const second = { ...node('l2', 'leaf', 'Two'), steps: ['Read', 'Revise'], stepDone: [false, false] };
    const result = removeBlueprintSteps([first, second], ['l1', 'l2'], ['Read', 'Revise']);
    expect(result.removed).toBe(3);
    expect(result.affected).toBe(2);
    expect(result.protectedCompleted).toBe(1);
    expect(result.goals[0].steps).toEqual(['Read', 'Test']);
    expect(result.goals[0].stepDone).toEqual([true, false]);
    expect(result.goals[1].steps).toEqual([]);
    expect(result.goals[1].completed).toBe(false);
  });

  it('renames one existing step while preserving its completion state', () => {
    const leaf = { ...node('l', 'leaf', 'Leaf'), steps: ['Watch', 'Notes'], stepDone: [true, false], completed: false };
    const result = renameBlueprintStep([leaf], 'l', 1, 'Review notes');
    expect(result[0].steps).toEqual(['Watch', 'Review notes']);
    expect(result[0].stepDone).toEqual([true, false]);
    expect(renameBlueprintStep([leaf], 'l', 0, '   ')).toEqual([leaf]);
  });

  it('renames and removes branches immutably', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Old', [node('s', 'section', 'Child')])])];
    const renamed = renameBlueprintNodes(goals, { p: 'New' });
    expect(renamed[0].children[0].title).toBe('New');
    expect(goals[0].children[0].title).toBe('Old');
    expect(removeBlueprintNodes(renamed, ['p', 's'])[0].children).toEqual([]);
  });

  it('bulk edits descriptions without changing child branches', () => {
    const goals = [node('g', 'goal', 'Goal', [
      { ...node('p1', 'phase', 'Old one', [node('s1', 'section', 'Child')]), description: 'Previous note' },
      node('p2', 'phase', 'Old two'),
    ])];
    const updated = updateBlueprintNodes(goals, {
      p1: { title: 'New one', description: 'First phase context' },
      p2: { title: 'New two', description: '' },
    });
    expect(updated[0].children[0]).toMatchObject({ title: 'New one', description: 'First phase context' });
    expect(updated[0].children[0].children[0].title).toBe('Child');
    expect(updated[0].children[1]).toMatchObject({ title: 'New two' });
    expect(updated[0].children[1].description).toBeUndefined();
    expect(goals[0].children[0].title).toBe('Old one');
    expect(goals[0].children[0].description).toBe('Previous note');
  });

  it('groups matching existing children across selected branches for bulk editing', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'Phase 1', [node('c1', 'node', 'Chapter 1'), node('x', 'node', 'Extra')]),
      node('p2', 'node', 'Phase 2', [node('c2', 'node', ' chapter   1 '), node('c3', 'node', 'Chapter 2')]),
    ])];

    expect(groupBlueprintChildren(goals, ['p1', 'p2', 'p1'])).toEqual([
      {
        key: 'chapter 1',
        title: 'Chapter 1',
        nodeIds: ['c1', 'c2'],
        parentIds: ['p1', 'p2'],
        parentTitles: ['Phase 1', 'Phase 2'],
      },
      {
        key: 'chapter 2',
        title: 'Chapter 2',
        nodeIds: ['c3'],
        parentIds: ['p2'],
        parentTitles: ['Phase 2'],
      },
      {
        key: 'extra',
        title: 'Extra',
        nodeIds: ['x'],
        parentIds: ['p1'],
        parentTitles: ['Phase 1'],
      },
    ]);
  });

  it('counts nodes and depth for review', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Phase', [node('s', 'section', 'Section')])])];
    expect(countBlueprintNodes(goals)).toBe(3);
    expect(maxBlueprintDepth(goals)).toBe(3);
  });

  it('opens only paths containing additions and marks the new nodes', () => {
    const previous = [node('g', 'goal', 'Goal', [node('p1', 'phase', 'One'), node('p2', 'phase', 'Two')])];
    const next = [node('g', 'goal', 'Goal', [node('p1', 'phase', 'One', [node('s', 'section', 'New section')]), node('p2', 'phase', 'Two')])];
    const review = blueprintReviewState(previous, next);
    expect(review.addedIds).toEqual(['s']);
    expect(review.changedIds).toEqual(['s']);
    expect(review.expandedIds).toEqual(['g', 'p1', 's']);
    expect(review.expandedIds).not.toContain('p2');
  });

  it('exposes changed steps and the closest surviving parent after removal', () => {
    const previousLeaf = { ...node('l', 'leaf', 'Leaf'), steps: ['Watch'], stepDone: [false] };
    const previous = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Phase', [previousLeaf]), node('gone', 'phase', 'Remove me')])];
    const nextLeaf = { ...previousLeaf, steps: ['Watch', 'Revise'], stepDone: [false, false] };
    const next = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Phase', [nextLeaf])])];
    const review = blueprintReviewState(previous, next);
    expect(review.changedIds).toEqual(expect.arrayContaining(['l', 'g']));
    expect(review.expandedIds).toEqual(expect.arrayContaining(['g', 'p', 'l']));
    expect(review.addedStepsByNode).toEqual({ l: ['Revise'] });
  });

  it('opens Studio at the requested depth and falls back to a surviving parent', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Phase', [node('s', 'section', 'Section')])])];
    expect(closestBlueprintPathIds(goals, ['g', 'p', 's'])).toEqual(['g', 'p', 's']);

    const withoutSection = removeBlueprintNodes(goals, ['s']);
    expect(closestBlueprintPathIds(withoutSection, ['g', 'p', 's'])).toEqual(['g', 'p']);
    expect(closestBlueprintPathIds(withoutSection, ['missing'])).toEqual([]);
  });

  it('keeps generated node ids unique across repeated branches', () => {
    const goals = [node('g', 'goal', 'Goal', [node('a', 'phase', 'A'), node('b', 'phase', 'B')])];
    const result = addBlueprintChildren(goals, ['a', 'b'], 'section', ['One', 'Two', 'Three']);
    expect(new Set(result.createdIds).size).toBe(6);
  });

  it('updates only the current plan and preserves historical cards when branches change', () => {
    const leaf = { ...node('l', 'leaf', 'Leaf'), todayTaskId: 't', steps: ['One'], stepDone: [false] };
    const task = {
      id: 't', title: 'Old', description: '', priority: 'medium' as const, targetDate: null,
      deadline: null, steps: [], progress: 0, createdAt: 1, order: 0, goalNodeId: 'l',
    };
    const history = {
      ...task,
      id: 'history',
      title: 'Historical title',
      targetDate: '2000-01-01',
      progress: 1,
    };
    expect(reconcileBlueprintTasks([task], [leaf])[0].title).toBe('Leaf');
    expect(reconcileBlueprintTasks([history, task], [leaf])[0]).toEqual(history);
    expect(reconcileBlueprintTasks([history, task], [], [leaf])).toEqual([history]);

    const stalePointer = { ...leaf, todayTaskId: 'history' };
    expect(reconcileBlueprintTasks([history], [], [stalePointer])).toEqual([history]);
  });
});

describe('R1: Flexible Node Expansion & Conversion', () => {
  it('R1-01: converts an empty node to a task with an empty checklist', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1');
    const target = updated[0].children[0];

    expect(target.steps).toEqual([]);
    expect(target.stepDone).toEqual([]);
    expect(target.completed).toBe(false);
  });

  it('R1-02: converts an empty node to a task with initial checklist steps', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1', ['Read document', 'Submit PR']);
    const target = updated[0].children[0];

    expect(target.steps).toEqual(['Read document', 'Submit PR']);
    expect(target.stepDone).toEqual([false, false]);
    expect(target.completed).toBe(false);
  });

  it('R1-03: normalizes and deduplicates initial checklist steps', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'item-1', ['  Read doc  ', '', 'read doc', 'Submit PR  ']);
    const target = updated[0].children[0];

    expect(target.steps).toEqual(['Read doc', 'Submit PR']);
    expect(target.stepDone).toEqual([false, false]);
  });

  it('R1-04: converts node that already has steps by replacing steps cleanly', () => {
    const nodeWithSteps: GoalNode = { ...node('item-1', 'node', 'Item'), steps: ['Old step'], stepDone: [false] };
    const goals = [node('g', 'goal', 'Goal', [nodeWithSteps])];
    const updated = convertNodeToTask(goals, 'item-1', ['New step 1', 'New step 2']);
    const target = updated[0].children[0];

    expect(target.steps).toEqual(['New step 1', 'New step 2']);
    expect(target.stepDone).toEqual([false, false]);
  });

  it('R1-05: protects branches with children from invalid task conversion', () => {
    const goals = [node('g', 'goal', 'Goal', [node('branch-1', 'node', 'Branch', [node('child-1', 'node', 'Child')])])];
    const updated = convertNodeToTask(goals, 'branch-1', ['Invalid step']);

    expect(updated[0].children[0].children).toHaveLength(1);
    expect(updated[0].children[0].steps).toBeUndefined();
  });

  it('R1-06: safely handles non-existent node ID', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(goals, 'missing-id', ['Step']);
    expect(updated).toEqual(goals);
  });

  it('R1-07: maintains immutability during task conversion', () => {
    const original = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToTask(original, 'item-1', ['Step']);
    expect(original[0].children[0].steps).toBeUndefined();
    expect(updated[0].children[0].steps).toEqual(['Step']);
  });

  it('R1-08: expands an empty node into a branch with child nodes', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Section A', 'Section B']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(2);
    expect(target.children.map((c) => c.title)).toEqual(['Section A', 'Section B']);
    expect(target.children[0].id).not.toBe(target.children[1].id);
    expect(target.steps).toBeUndefined();
  });

  it('R1-09: converts a node with steps into a branch and clears checklist state', () => {
    const nodeWithSteps: GoalNode = {
      ...node('item-1', 'node', 'Task with steps'),
      steps: ['Step 1', 'Step 2'],
      stepDone: [true, false],
      todayTaskId: 'task-123',
    };
    const goals = [node('g', 'goal', 'Goal', [nodeWithSteps])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Subtask A']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(1);
    expect(target.children[0].title).toBe('Subtask A');
    expect(target.steps).toBeUndefined();
    expect(target.stepDone).toBeUndefined();
    expect(target.todayTaskId).toBeNull();
  });

  it('R1-10: converts existing steps into child nodes when convertExistingSteps is true', () => {
    const nodeWithSteps: GoalNode = {
      ...node('item-1', 'node', 'Task with steps'),
      steps: ['Step 1', 'Step 2'],
      stepDone: [true, false],
      todayTaskId: 'task-123',
    };
    const goals = [node('g', 'goal', 'Goal', [nodeWithSteps])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Subtask A'], { convertExistingSteps: true });
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(3);
    expect(target.children[0].title).toBe('Step 1');
    expect(target.children[0].completed).toBe(true);
    expect(target.children[1].title).toBe('Step 2');
    expect(target.children[1].completed).toBe(false);
    expect(target.children[2].title).toBe('Subtask A');
    expect(target.steps).toBeUndefined();
    expect(target.stepDone).toBeUndefined();
  });

  it('R1-11: appends new children to node that already has children', () => {
    const branch: GoalNode = node('b', 'node', 'Branch', [node('c1', 'node', 'Child 1')]);
    const goals = [node('g', 'goal', 'Goal', [branch])];
    const updated = convertNodeToBranch(goals, 'b', ['Child 2']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(2);
    expect(target.children.map((c) => c.title)).toEqual(['Child 1', 'Child 2']);
  });

  it('R1-12: deduplicates initial child titles case-insensitively and collapses whitespace', () => {
    const goals = [node('g', 'goal', 'Goal', [node('item-1', 'node', 'Item')])];
    const updated = convertNodeToBranch(goals, 'item-1', ['Phase 1', 'phase 1', '  Phase   1  ']);
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(1);
    expect(target.children[0].title).toBe('Phase 1');
  });

  it('R1-17: falls back to Step N when converting blank or whitespace legacy steps', () => {
    const nodeWithBlankSteps: GoalNode = {
      ...node('item-blank', 'node', 'Task with blank steps'),
      steps: ['   ', '', '\t\n '],
      stepDone: [false, true, false],
    };
    const goals = [node('g', 'goal', 'Goal', [nodeWithBlankSteps])];
    const updated = convertNodeToBranch(goals, 'item-blank', [], { convertExistingSteps: true });
    const target = updated[0].children[0];

    expect(target.children).toHaveLength(3);
    expect(target.children[0].title).toBe('Step 1');
    expect(target.children[1].title).toBe('Step 2');
    expect(target.children[2].title).toBe('Step 3');
  });
});

describe('R2: Bulk "Add Inside" (addBlueprintChildrenBulk)', () => {
  it('R2-01: adds children to a single parent', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'Parent')])];
    const result = addBlueprintChildrenBulk(goals, ['p1'], ['Item A', 'Item B']);

    expect(result.count).toBe(2);
    expect(result.createdIds).toHaveLength(2);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Item A', 'Item B']);
  });

  it('R2-02: adds children simultaneously to multiple parents', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'Parent 1'), node('p2', 'node', 'Parent 2')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['Task A', 'Task B']);

    expect(result.count).toBe(4);
    expect(result.createdIds).toHaveLength(4);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Task A', 'Task B']);
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['Task A', 'Task B']);
  });

  it('R2-03: generates unique UIDs across all generated children and parents', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1'), node('p2', 'node', 'P2'), node('p3', 'node', 'P3')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2', 'p3'], ['Sub 1', 'Sub 2']);

    expect(result.createdIds).toHaveLength(6);
    expect(new Set(result.createdIds).size).toBe(6);
  });

  it('R2-04: deduplicates child titles per parent independently', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'P1', [node('c1', 'node', 'Alpha')]),
      node('p2', 'node', 'P2', []),
    ])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['Alpha', 'Beta']);

    expect(result.count).toBe(3);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Alpha', 'Beta']);
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['Alpha', 'Beta']);
  });

  it('R2-05: deduplicates case-insensitively and collapses whitespace runs', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'P1', [node('c1', 'node', 'Module 1')]),
    ])];
    const result = addBlueprintChildrenBulk(goals, ['p1'], ['  module   1  ', 'Module 2']);

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Module 1', 'Module 2']);
  });

  it('R2-06: handles parents with different existing children subsets', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('p1', 'node', 'P1', [node('c1', 'node', 'A'), node('c2', 'node', 'B')]),
      node('p2', 'node', 'P2', [node('c3', 'node', 'B'), node('c4', 'node', 'C')]),
    ])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p2'], ['A', 'B', 'C', 'D']);

    expect(result.count).toBe(4);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['A', 'B', 'C', 'D']);
    expect(result.goals[0].children[1].children.map((c) => c.title)).toEqual(['B', 'C', 'A', 'D']);
  });

  it('R2-07: does NOT block parents that have checklist steps', () => {
    const parentWithSteps: GoalNode = {
      ...node('p-steps', 'node', 'Parent with steps'),
      steps: ['Existing step'],
      stepDone: [false],
    };
    const goals = [node('g', 'goal', 'Goal', [parentWithSteps])];
    const result = addBlueprintChildrenBulk(goals, ['p-steps'], ['Child Item']);

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].children).toHaveLength(1);
    expect(result.goals[0].children[0].children[0].title).toBe('Child Item');
  });

  it('R2-08: deduplicates redundant parentIds in target list', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1')])];
    const result = addBlueprintChildrenBulk(goals, ['p1', 'p1', 'p1'], ['Unique Item']);

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].children).toHaveLength(1);
  });

  it('R2-09: returns count 0 and unchanged tree when parentIds is empty', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1')])];
    const result = addBlueprintChildrenBulk(goals, [], ['Child']);

    expect(result.count).toBe(0);
    expect(result.goals).toEqual(goals);
  });

  it('R2-10: returns count 0 and unchanged tree when titles are empty or whitespace', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p1', 'node', 'P1')])];
    const result = addBlueprintChildrenBulk(goals, ['p1'], ['  ', '']);

    expect(result.count).toBe(0);
    expect(result.goals).toEqual(goals);
  });

  it('R2-11: supports converting existing steps to child nodes in bulk add', () => {
    const parentWithSteps: GoalNode = {
      ...node('p-steps', 'node', 'Parent'),
      steps: ['Step 1', 'Step 2'],
      stepDone: [true, false],
    };
    const goals = [node('g', 'goal', 'Goal', [parentWithSteps])];
    const result = addBlueprintChildrenBulk(goals, ['p-steps'], ['Added Child'], { convertExistingSteps: true });

    expect(result.goals[0].children[0].children).toHaveLength(3);
    expect(result.goals[0].children[0].children.map((c) => c.title)).toEqual(['Step 1', 'Step 2', 'Added Child']);
    expect(result.goals[0].children[0].children[0].completed).toBe(true);
  });

  it('R2-12: handles adding children across mixed hierarchy depths', () => {
    const child = node('child', 'node', 'Child node');
    const parent = node('parent', 'node', 'Parent node', [child]);
    const root = node('g', 'goal', 'Root Goal', [parent]);
    const result = addBlueprintChildrenBulk([root], ['g', 'parent', 'child'], ['Sub-item']);

    expect(result.count).toBe(3);
    expect(result.goals[0].children.some((c) => c.title === 'Sub-item')).toBe(true);
    expect(result.goals[0].children[0].children.some((c) => c.title === 'Sub-item')).toBe(true);
    expect(result.goals[0].children[0].children[0].children.some((c) => c.title === 'Sub-item')).toBe(true);
  });
});

describe('R3: Bulk Step Diffing (diffBlueprintSteps & collectBlueprintStepsSummary)', () => {
  it('R3-01: Set-Union additions to empty nodes', () => {
    const n1 = node('n1', 'node', 'Task 1');
    const n2 = node('n2', 'node', 'Task 2');
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];
    const result = diffBlueprintSteps(goals, ['n1', 'n2'], ['Step 1', 'Step 2'], []);

    expect(result.addedCount).toBe(4);
    expect(result.affectedCount).toBe(2);
    expect(result.goals[0].children[0].steps).toEqual(['Step 1', 'Step 2']);
    expect(result.goals[0].children[0].stepDone).toEqual([false, false]);
    expect(result.goals[0].children[1].steps).toEqual(['Step 1', 'Step 2']);
  });

  it('R3-02: applies Set-Union additions without creating duplicate steps', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Design', 'Code'], stepDone: [false, false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Code', 'Review'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    const result = diffBlueprintSteps(goals, ['n1', 'n2'], ['Code', 'Test'], []);

    expect(result.goals[0].children[0].steps).toEqual(['Design', 'Code', 'Test']);
    expect(result.goals[0].children[0].stepDone).toEqual([false, false, false]);
    expect(result.goals[0].children[1].steps).toEqual(['Code', 'Review', 'Test']);
    expect(result.goals[0].children[1].stepDone).toEqual([false, false, false]);
  });

  it('R3-03: case-insensitively matches existing steps with whitespace normalization', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Review PR'], stepDone: [false] };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], ['  review   pr  ', 'Deploy'], []);

    expect(result.goals[0].children[0].steps).toEqual(['Review PR', 'Deploy']);
    expect(result.addedCount).toBe(1);
  });

  it('R3-04: applies Set-Difference removals to nodes possessing the step', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Read', 'Write'], stepDone: [false, false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Read', 'Review'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    const result = diffBlueprintSteps(goals, ['n1', 'n2'], [], ['Read']);

    expect(result.goals[0].children[0].steps).toEqual(['Write']);
    expect(result.goals[0].children[1].steps).toEqual(['Review']);
    expect(result.removedCount).toBe(2);
  });

  it('R3-05: silently skips nodes lacking the removed step without throwing errors', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Read'], stepDone: [false] };
    const n2 = { ...node('n2', 'node', 'Task 2'), steps: ['Code'], stepDone: [false] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    expect(() => {
      const result = diffBlueprintSteps(goals, ['n1', 'n2'], [], ['Read', 'NonExistent']);
      expect(result.goals[0].children[0].steps).toEqual([]);
      expect(result.goals[0].children[1].steps).toEqual(['Code']);
    }).not.toThrow();
  });

  it('R3-06: PROTECTS completed steps from bulk deletion', () => {
    const n1 = {
      ...node('n1', 'node', 'Task 1'),
      steps: ['Draft', 'Revise', 'Publish'],
      stepDone: [true, false, false],
    };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], [], ['Draft', 'Revise']);

    expect(result.goals[0].children[0].steps).toEqual(['Draft', 'Publish']);
    expect(result.goals[0].children[0].stepDone).toEqual([true, false]);
    expect(result.protectedCount).toBe(1);
    expect(result.protectedCompletedCount).toBe(1);
    expect(result.removedCount).toBe(1);
  });

  it('R3-07: forceRemoveCompleted allows deletion of completed steps when explicitly requested', () => {
    const n1 = {
      ...node('n1', 'node', 'Task 1'),
      steps: ['Draft', 'Revise'],
      stepDone: [true, false],
    };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], [], ['Draft', 'Revise'], { forceRemoveCompleted: true });

    expect(result.goals[0].children[0].steps).toEqual([]);
    expect(result.removedCount).toBe(2);
    expect(result.protectedCount).toBe(0);
  });

  it('R3-08: applies simultaneous step additions and removals in a single pass', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Old step', 'Keep step'], stepDone: [false, false] };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], ['New step'], ['Old step']);

    expect(result.goals[0].children[0].steps).toEqual(['Keep step', 'New step']);
    expect(result.goals[0].children[0].stepDone).toEqual([false, false]);
  });

  it('R3-09: marks completed node as uncompleted when an unfinished step is added', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Done step'], stepDone: [true], completed: true };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], ['Next step'], []);

    expect(result.goals[0].children[0].completed).toBe(false);
    expect(result.goals[0].children[0].stepDone).toEqual([true, false]);
  });

  it('R3-10: marks node as completed when only completed steps remain after removal', () => {
    const n1 = { ...node('n1', 'node', 'Task 1'), steps: ['Done', 'Undone'], stepDone: [true, false], completed: false };
    const goals = [node('g', 'goal', 'Goal', [n1])];

    const result = diffBlueprintSteps(goals, ['n1'], [], ['Undone']);

    expect(result.goals[0].children[0].steps).toEqual(['Done']);
    expect(result.goals[0].children[0].completed).toBe(true);
  });

  it('R3-11: ignores non-endpoint branches and root goals', () => {
    const branch = node('b', 'node', 'Branch', [node('c', 'node', 'Child')]);
    const root = node('g', 'goal', 'Root', [branch]);
    const result = diffBlueprintSteps([root], ['g', 'b'], ['Step'], []);

    expect(result.affectedCount).toBe(0);
    expect(result.goals[0].steps).toBeUndefined();
    expect(result.goals[0].children[0].steps).toBeUndefined();
  });

  it('R3-12: returns unchanged tree on empty target IDs or empty input steps', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Task')])];
    expect(diffBlueprintSteps(goals, [], ['Step'], []).affectedCount).toBe(0);
    expect(diffBlueprintSteps(goals, ['n1'], [], []).affectedCount).toBe(0);
  });

  it('R3-13: collectBlueprintStepsSummary aggregates occurrences, universality, and completion', () => {
    const n1 = { ...node('n1', 'node', 'T1'), steps: ['Common', 'Only1'], stepDone: [true, false] };
    const n2 = { ...node('n2', 'node', 'T2'), steps: ['Common', 'Only2'], stepDone: [true, true] };
    const goals = [node('g', 'goal', 'Goal', [n1, n2])];

    const summary = collectBlueprintStepsSummary(goals, ['n1', 'n2']);

    expect(summary.totalEligibleNodes).toBe(2);
    expect(summary.items).toHaveLength(3);

    const common = summary.items.find((item) => item.key === 'common');
    expect(common).toMatchObject({
      title: 'Common',
      occurrences: 2,
      totalNodes: 2,
      isUniversal: true,
      allCompleted: true,
      anyCompleted: true,
    });

    const only1 = summary.items.find((item) => item.key === 'only1');
    expect(only1).toMatchObject({
      title: 'Only1',
      occurrences: 1,
      isUniversal: false,
      allCompleted: false,
    });
  });
});

describe('R4: Bulk & Individual Date Changing (setGoalDatesBulk & setGoalDates)', () => {
  it('R4-01: sets startDate and endDate on a single node', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-10', endDate: '2026-10-20' });

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].startDate).toBe('2026-10-10');
    expect(result.goals[0].children[0].endDate).toBe('2026-10-20');
  });

  it('R4-02: sets dates across multiple selected nodes simultaneously', () => {
    const goals = [node('g', 'goal', 'Goal', [
      node('n1', 'node', 'Item 1'),
      node('n2', 'node', 'Item 2'),
      node('n3', 'node', 'Item 3'),
    ])];
    const result = setGoalDatesBulk(goals, ['n1', 'n2', 'n3'], { startDate: '2026-11-01', endDate: '2026-11-15' });

    expect(result.count).toBe(3);
    for (const child of result.goals[0].children) {
      expect(child.startDate).toBe('2026-11-01');
      expect(child.endDate).toBe('2026-11-15');
    }
  });

  it('R4-03: updates startDate while preserving existing endDate', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), endDate: '2026-12-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-11-01' });

    expect(result.goals[0].children[0].startDate).toBe('2026-11-01');
    expect(result.goals[0].children[0].endDate).toBe('2026-12-31');
  });

  it('R4-04: updates endDate while preserving existing startDate', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-05-01' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { endDate: '2026-05-15' });

    expect(result.goals[0].children[0].startDate).toBe('2026-05-01');
    expect(result.goals[0].children[0].endDate).toBe('2026-05-15');
  });

  it('R4-05: clears dates when passed null or clearAll', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: null, endDate: null });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBeUndefined();

    const withClearAll = setGoalDatesBulk(goals, ['n1'], { clearAll: true });
    expect(withClearAll.goals[0].children[0].startDate).toBeUndefined();
    expect(withClearAll.goals[0].children[0].endDate).toBeUndefined();
  });

  it('R4-06: clears only startDate when passed null', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: null });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBe('2026-01-31');
  });

  it('R4-07: rejects invalid date formats that do not match YYYY-MM-DD', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '10/20/2026' });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.count).toBe(0);
  });

  it('R4-08: rejects invalid calendar dates', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    expect(setGoalDatesBulk(goals, ['n1'], { startDate: '2026-02-31' }).count).toBe(0);
    expect(setGoalDatesBulk(goals, ['n1'], { startDate: '2025-02-29' }).count).toBe(0); // Not leap year
    expect(setGoalDatesBulk(goals, ['n1'], { startDate: '2024-02-29' }).count).toBe(1); // Leap year
  });

  it('R4-09: rejects date ranges where startDate is strictly after endDate', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-25', endDate: '2026-10-10' });

    expect(result.goals[0].children[0].startDate).toBeUndefined();
    expect(result.goals[0].children[0].endDate).toBeUndefined();
    expect(result.count).toBe(0);
  });

  it('R4-10: resolves conflicting single date updates according to conflictResolution policy', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), endDate: '2026-10-10' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    // Policy 'clear' (default): clears conflicting endDate
    const clearedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15' }, { conflictResolution: 'clear' });
    expect(clearedResult.goals[0].children[0].startDate).toBe('2026-10-15');
    expect(clearedResult.goals[0].children[0].endDate).toBeUndefined();

    // Policy 'clamp': clamps endDate forward to new startDate
    const clampedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15' }, { conflictResolution: 'clamp' });
    expect(clampedResult.goals[0].children[0].startDate).toBe('2026-10-15');
    expect(clampedResult.goals[0].children[0].endDate).toBe('2026-10-15');

    // Policy 'skip': skips updating the conflicting node
    const skippedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15' }, { conflictResolution: 'skip' });
    expect(skippedResult.goals[0].children[0].startDate).toBeUndefined();
    expect(skippedResult.goals[0].children[0].endDate).toBe('2026-10-10');
  });

  it('R4-11: allows single-day spans where startDate equals endDate', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-10', endDate: '2026-10-10' });

    expect(result.count).toBe(1);
    expect(result.goals[0].children[0].startDate).toBe('2026-10-10');
    expect(result.goals[0].children[0].endDate).toBe('2026-10-10');
  });

  it('R4-12: preserves other fields (description, steps, pinned, children) untouched', () => {
    const itemNode: GoalNode = {
      ...node('n1', 'node', 'Item'),
      description: 'Preserved note',
      steps: ['Step 1'],
      stepDone: [false],
      pinned: true,
    };
    const goals = [node('g', 'goal', 'Goal', [itemNode])];
    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-10' });
    const updated = result.goals[0].children[0];

    expect(updated.description).toBe('Preserved note');
    expect(updated.steps).toEqual(['Step 1']);
    expect(updated.pinned).toBe(true);
  });

  it('R4-13: isValidISODate validates strictly', () => {
    expect(isValidISODate('2026-10-10')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2025-02-29')).toBe(false);
    expect(isValidISODate('2026-02-31')).toBe(false);
    expect(isValidISODate('10/20/2026')).toBe(false);
    expect(isValidISODate('invalid')).toBe(false);
    expect(isValidISODate(null)).toBe(false);
    expect(isValidISODate(undefined)).toBe(false);
  });

  it('R4-14: setGoalDates convenience wrapper operates on single node ID', () => {
    const goals = [node('g', 'goal', 'Goal', [node('n1', 'node', 'Item')])];
    const updated = setGoalDates(goals, 'n1', { startDate: '2026-10-10', endDate: '2026-10-20' });

    expect(updated[0].children[0].startDate).toBe('2026-10-10');
    expect(updated[0].children[0].endDate).toBe('2026-10-20');
  });

  it('R4-15: deletes both date properties when passed whitespace-only strings', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(false);

    // Also verify single-node convenience wrapper setGoalDates
    const singleResult = setGoalDates(goals, 'n1', { startDate: '   ', endDate: '   ' });
    const singleUpdated = singleResult[0].children[0];
    expect(singleUpdated.startDate).toBeUndefined();
    expect(singleUpdated.endDate).toBeUndefined();
    expect('startDate' in singleUpdated).toBe(false);
    expect('endDate' in singleUpdated).toBe(false);

    // Verify clearing individual dates via whitespace preserves the opposing date
    const startOnlyCleared = setGoalDatesBulk(goals, ['n1'], { startDate: '   ' });
    expect(startOnlyCleared.goals[0].children[0].startDate).toBeUndefined();
    expect('startDate' in startOnlyCleared.goals[0].children[0]).toBe(false);
    expect(startOnlyCleared.goals[0].children[0].endDate).toBe('2026-01-31');

    const endOnlyCleared = setGoalDatesBulk(goals, ['n1'], { endDate: '   ' });
    expect(endOnlyCleared.goals[0].children[0].startDate).toBe('2026-01-01');
    expect(endOnlyCleared.goals[0].children[0].endDate).toBeUndefined();
    expect('endDate' in endOnlyCleared.goals[0].children[0]).toBe(false);
  });

  it('R4-16: sets startDate and deletes endDate when endDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '2026-10-15', endDate: '   ' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBe('2026-10-15');
    expect(updated.endDate).toBeUndefined();
    expect('startDate' in updated).toBe(true);
    expect('endDate' in updated).toBe(false);
    expect(isValidISODate(updated.startDate)).toBe(true);
  });

  it('R4-17: deletes startDate and sets endDate when startDate is whitespace', () => {
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const result = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '2026-10-15' });

    expect(result.count).toBe(1);
    const updated = result.goals[0].children[0];
    expect(updated.startDate).toBeUndefined();
    expect(updated.endDate).toBe('2026-10-15');
    expect('startDate' in updated).toBe(false);
    expect('endDate' in updated).toBe(true);
    expect(isValidISODate(updated.endDate)).toBe(true);
  });

  it('R4-18: verifies downstream consumers (isValidISODate & patchStudioItems) handle whitespace and cleared dates cleanly', () => {
    // 1. isValidISODate rejection of whitespace
    expect(isValidISODate('')).toBe(false);
    expect(isValidISODate(' ')).toBe(false);
    expect(isValidISODate('   ')).toBe(false);
    expect(isValidISODate(' \t\n ')).toBe(false);
    expect(isValidISODate('  2026-10-15  ')).toBe(true);

    // 2. Nodes with deleted dates flowing into patchStudioItems
    const datedNode: GoalNode = { ...node('n1', 'node', 'Item'), startDate: '2026-01-01', endDate: '2026-01-31' };
    const goals = [node('g', 'goal', 'Goal', [datedNode])];

    const clearedResult = setGoalDatesBulk(goals, ['n1'], { startDate: '   ', endDate: '   ' });
    const clearedNode = clearedResult.goals[0].children[0];
    expect(clearedNode.startDate).toBeUndefined();
    expect(clearedNode.endDate).toBeUndefined();

    // patchStudioItems on the cleared tree preserves undefined dates
    const patchedTree = patchStudioItems(clearedResult.goals, { n1: { title: 'Updated Title' } });
    const patchedNode = patchedTree[0].children[0];
    expect(patchedNode.title).toBe('Updated Title');
    expect(patchedNode.startDate).toBeUndefined();
    expect(patchedNode.endDate).toBeUndefined();
    expect('startDate' in patchedNode).toBe(false);
    expect('endDate' in patchedNode).toBe(false);

    // 3. patchStudioItems directly receives whitespace date in patch - cleanly deletes date property
    const nodeWithDates = [node('n2', 'node', 'Item 2')];
    nodeWithDates[0].startDate = '2026-05-01';
    const sanitizedPatch = patchStudioItems(nodeWithDates, { n2: { startDate: '   ' } });
    expect(sanitizedPatch[0].startDate).toBeUndefined();
    expect('startDate' in sanitizedPatch[0]).toBe(false);

    // Invalid non-whitespace date formats revert to original date
    const invalidDatePatch = patchStudioItems(nodeWithDates, { n2: { startDate: 'not-a-date' } });
    expect(invalidDatePatch[0].startDate).toBe('2026-05-01');
  });
});
