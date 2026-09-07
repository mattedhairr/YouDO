import { describe, expect, it } from 'vitest';
import type { GoalNode, Task } from '../types';
import { findGoal } from './goalTree';
import { flattenBlueprint, reconcileBlueprintTasks, addBlueprintChildren, addBlueprintSteps } from './blueprintStudio';
import { parseBackupPayload } from './backup';
import { canMoveStudioItems, duplicateStudioItems, editStudioSteps, moveStudioItems, patchStudioItems, reorderStudioItems, studioChangeDetails, studioItemPath, topStudioSelection } from './studioWorkspace';

const item = (id: string, children: GoalNode[] = [], patch: Partial<GoalNode> = {}): GoalNode => ({
  id, title: id, kind: 'node', children, createdAt: 1, completed: false, ...patch,
});
const tree = () => [item('exam', [
  item('chapter-a', [item('lecture-a', [], { title: 'Lecture 3', steps: ['Read', 'Practise'], stepDone: [true, false], todayTaskId: 'planned', pinned: true })], { kind: 'phase' }),
  item('chapter-b', [item('lecture-b', [], { title: 'Lecture 3' })], { kind: 'section' }),
  item('empty'),
], { kind: 'goal' })];

describe('contextual Studio edits', () => {
  it('skips whitespace-equivalent additions without replacing existing items', () => {
    const original = [item('g', [item('a', [], { title: 'Lecture  3', steps: ['Read  notes'], stepDone: [false] })], { kind: 'goal' })];
    expect(addBlueprintChildren(original, ['g'], 'node', ['lecture 3']).added).toBe(0);
    expect(addBlueprintSteps(original, ['a'], ['read notes']).added).toBe(0);
  });
  it('reviews actual renames and moves with distinct source paths', () => {
    const original = tree();
    const edited = patchStudioItems(original, { 'lecture-a': { title: 'Review' } });
    expect(studioChangeDetails(original, edited)).toEqual([{ id: 'lecture-a', title: 'Review', path: 'exam / chapter-a', detail: 'Renamed from “Lecture 3”' }]);
    const moved = moveStudioItems(original, ['lecture-a'], 'chapter-b');
    expect(studioChangeDetails(original, moved)).toContainEqual({ id: 'lecture-a', title: 'Lecture 3', path: 'exam / chapter-b', detail: 'Moved from exam / chapter-a' });
  });

  it('reviews additions, removals and order independently', () => {
    const original = tree();
    const added = addBlueprintChildren(original, ['empty'], 'node', ['New']);
    expect(studioChangeDetails(original, added.goals).map((entry) => entry.detail)).toEqual(['Added']);
    expect(studioChangeDetails(added.goals, original).map((entry) => entry.detail)).toEqual(['Removed']);
    const reordered = reorderStudioItems(original, ['chapter-b'], 'up');
    expect(studioChangeDetails(original, reordered)).toEqual([{ id: 'exam', title: 'exam', path: 'All goals', detail: 'Items reordered' }]);
    expect(studioChangeDetails(original, original)).toEqual([]);
  });

  it('edits by ID without changing identically named copies elsewhere', () => {
    const original = tree();
    const next = patchStudioItems(original, { 'lecture-a': { title: '  Review  ', description: 'Notes', endDate: '2026-10-01' } });
    expect(findGoal(next, 'lecture-a')).toMatchObject({ id: 'lecture-a', title: 'Review', description: 'Notes', steps: ['Read', 'Practise'], stepDone: [true, false], pinned: true, todayTaskId: 'planned' });
    expect(findGoal(next, 'lecture-b')).toBe(findGoal(original, 'lecture-b'));
    expect(findGoal(original, 'lecture-a')?.title).toBe('Lecture 3');
  });

  it('distinguishes repeated names by their complete parent path', () => {
    expect(studioItemPath(tree(), 'lecture-a')).toBe('exam / chapter-a');
    expect(studioItemPath(tree(), 'lecture-b')).toBe('exam / chapter-b');
    expect(studioItemPath(tree(), 'exam')).toBe('All goals');
  });

  it('clears only explicitly edited optional fields', () => {
    const original = [item('a', [], { description: 'Old', startDate: '2026-09-01', endDate: '2026-10-01' })];
    expect(patchStudioItems(original, { a: { description: undefined } })[0]).toMatchObject({ description: undefined, startDate: '2026-09-01', endDate: '2026-10-01' });
    expect(patchStudioItems(original, { a: { title: '   ' } })[0].title).toBe('a');
  });

  it('normalizes overlapping and duplicate structural selections', () => {
    expect(topStudioSelection(tree(), ['lecture-a', 'chapter-a', 'chapter-a', 'missing', 'lecture-b'])).toEqual(['chapter-a', 'lecture-b']);
  });

  it('preserves legacy kinds and executable state through backup parsing', () => {
    const next = patchStudioItems(tree(), { 'chapter-a': { description: 'Phase description' }, 'lecture-a': { description: 'Task description' } });
    const imported = parseBackupPayload(JSON.stringify({ goals: next, tasks: [] }))!;
    expect(flattenBlueprint(imported.goals).map((node) => node.id)).toEqual(flattenBlueprint(next).map((node) => node.id));
    expect(findGoal(imported.goals, 'chapter-a')?.kind).toBe('phase');
    expect(findGoal(imported.goals, 'lecture-a')).toMatchObject({ steps: ['Read', 'Practise'], stepDone: [true, false], todayTaskId: 'planned', pinned: true });
  });
});

describe('Studio moves, copies and order', () => {
  it('blocks cycles, missing destinations and no-op moves', () => {
    const goals = tree();
    for (const destination of ['exam', 'chapter-a', 'lecture-a']) expect(canMoveStudioItems(goals, ['exam'], destination)).toBe(false);
    expect(canMoveStudioItems(goals, ['chapter-a'], 'lecture-a')).toBe(false);
    expect(canMoveStudioItems(goals, ['lecture-a'], 'chapter-a')).toBe(false);
    expect(canMoveStudioItems(goals, ['lecture-a'], 'missing')).toBe(false);
    expect(canMoveStudioItems(goals, [], 'chapter-b')).toBe(false);
    expect(moveStudioItems(goals, ['chapter-a'], 'lecture-a')).toBe(goals);
  });

  it('blocks hiding executable endpoint work in a destination or root promotion', () => {
    const goals = tree();
    expect(canMoveStudioItems(goals, ['empty'], 'lecture-a')).toBe(false);
    expect(canMoveStudioItems(goals, ['lecture-a'], null)).toBe(false);
    expect(canMoveStudioItems(goals, ['lecture-a', 'chapter-b'], null)).toBe(false);
    expect(canMoveStudioItems([item('g', [item('done', [], { completed: true }), item('a')], { kind: 'goal' })], ['a'], 'done')).toBe(false);
  });

  it('moves only the top selected subtree and preserves IDs and planned work', () => {
    const original = tree();
    const next = moveStudioItems(original, ['chapter-a', 'lecture-a'], 'chapter-b');
    expect(findGoal(next, 'chapter-b')?.children.map((node) => node.id)).toEqual(['lecture-b', 'chapter-a']);
    expect(findGoal(next, 'lecture-a')).toEqual(findGoal(original, 'lecture-a'));
    expect(flattenBlueprint(next)).toHaveLength(flattenBlueprint(original).length);
    expect(studioItemPath(next, 'lecture-a')).toBe('exam / chapter-b / chapter-a');
    expect(original[0].children).toHaveLength(3);
  });

  it('can promote a branch or nest a goal without changing descendants', () => {
    const original = tree();
    const promoted = moveStudioItems(original, ['chapter-a'], null);
    expect(promoted.map((node) => node.id)).toEqual(['exam', 'chapter-a']);
    expect(promoted[1].kind).toBe('goal');
    expect(findGoal(promoted, 'lecture-a')).toEqual(findGoal(original, 'lecture-a'));
    const nested = moveStudioItems(promoted, ['chapter-a'], 'empty');
    expect(findGoal(nested, 'chapter-a')?.kind).toBe('node');
    expect(findGoal(nested, 'lecture-a')).toEqual(findGoal(original, 'lecture-a'));
  });

  it('does not reorder already-contained selections when moving mixed sources', () => {
    const goals = tree();
    const next = moveStudioItems(goals, ['lecture-b', 'lecture-a'], 'chapter-b');
    expect(findGoal(next, 'chapter-b')?.children.map((node) => node.id)).toEqual(['lecture-b', 'lecture-a']);
  });

  it('duplicates with fresh IDs, unique names and cleared execution state', () => {
    const original = tree();
    const first = duplicateStudioItems(original, ['chapter-a', 'lecture-a']);
    const next = duplicateStudioItems(first, ['chapter-a']);
    const children = next[0].children;
    expect(children.map((node) => node.title)).toEqual(['chapter-a', 'chapter-a (copy 2)', 'chapter-a (copy)', 'chapter-b', 'empty']);
    const copiedTask = children[1].children[0];
    expect(copiedTask.id).not.toBe('lecture-a');
    expect(copiedTask).toMatchObject({ todayTaskId: null, pinned: false, completed: false, stepDone: [false, false], steps: ['Read', 'Practise'] });
    const ids = flattenBlueprint(next).map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findGoal(next, 'lecture-a')).toEqual(findGoal(original, 'lecture-a'));
    expect(original[0].children).toHaveLength(3);
  });

  it('moves sibling selections one position while retaining relative order', () => {
    const goals = [item('g', ['a', 'b', 'c', 'd'].map((id) => item(id)), { kind: 'goal' })];
    expect(reorderStudioItems(goals, ['b', 'c'], 'up')[0].children.map((node) => node.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(reorderStudioItems(goals, ['b', 'c'], 'down')[0].children.map((node) => node.id)).toEqual(['a', 'd', 'b', 'c']);
    expect(reorderStudioItems(goals, ['a'], 'up')[0].children.map((node) => node.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('Studio checklist and Today compatibility', () => {
  it('applies simultaneous removals and renames by original index, not repeated name', () => {
    const original = [item('a', [], { steps: ['Read', 'Read', 'Practise'], stepDone: [false, false, true] })];
    const next = editStudioSteps(original, [{ nodeId: 'a', index: 0, title: null }, { nodeId: 'a', index: 1, title: 'Review' }, { nodeId: 'a', index: 2, title: null }]);
    expect(next[0]).toMatchObject({ steps: ['Review', 'Practise'], stepDone: [false, true], completed: false });
    expect(original[0].steps).toEqual(['Read', 'Read', 'Practise']);
  });

  it('protects every scheduled step index while allowing label edits', () => {
    const next = editStudioSteps(tree(), [{ nodeId: 'lecture-a', index: 0, title: null }, { nodeId: 'lecture-a', index: 1, title: null }]);
    expect(findGoal(next, 'lecture-a')?.steps).toEqual(['Read', 'Practise']);
    expect(findGoal(next, 'lecture-a')?.stepDone).toEqual([true, false]);
    expect(findGoal(editStudioSteps(next, [{ nodeId: 'lecture-a', index: 1, title: 'Practise again' }]), 'lecture-a')?.steps).toEqual(['Read', 'Practise again']);
  });

  it('does not modify branch checklists or erase labels with blank renames', () => {
    const goals = [item('a', [item('child')], { steps: ['Legacy'] }), item('b', [], { steps: ['Read'], stepDone: [true] })];
    const next = editStudioSteps(goals, [{ nodeId: 'a', index: 0, title: null }, { nodeId: 'b', index: 0, title: '  ' }]);
    expect(next[0].steps).toEqual(['Legacy']);
    expect(next[1]).toMatchObject({ steps: ['Read'], stepDone: [true], completed: true });
  });

  it('keeps Today slices and historical cards intact after detail edits and moving', () => {
    const original = tree();
    const task: Task = { id: 'planned', title: 'Lecture 3', description: '', priority: 'medium', targetDate: null, deadline: null, steps: ['Practise'], stepSlice: [1], goalNodeId: 'lecture-a', progress: 0, createdAt: 1, order: 0 };
    const history = { ...task, id: 'past', targetDate: '2020-01-01', progress: 1 };
    let next = patchStudioItems(original, { 'lecture-a': { title: 'Review', description: 'Context' } });
    next = moveStudioItems(next, ['lecture-a'], 'chapter-b');
    const reconciled = reconcileBlueprintTasks([task, history], next, original);
    expect(reconciled[0]).toMatchObject({ id: 'planned', title: 'Review', description: 'Context', stepSlice: [1], steps: ['Practise'], progress: 0 });
    expect(reconciled[1]).toEqual(history);
  });

  it('still permits arbitrary-depth additions after moving a clean branch', () => {
    const moved = moveStudioItems(tree(), ['empty'], 'chapter-b');
    const next = addBlueprintChildren(moved, ['empty'], 'node', ['Level 1']);
    const child = findGoal(next.goals, 'empty')!.children[0];
    expect(addBlueprintChildren(next.goals, [child.id], 'node', ['Level 2']).added).toBe(1);
  });
});
