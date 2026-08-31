import { describe, expect, it } from 'vitest';
import type { GoalNode } from '../types';
import {
  addBlueprintChildren,
  addBlueprintSteps,
  countBlueprintNodes,
  maxBlueprintDepth,
  normalizeBlueprintTitles,
  numberedBlueprintTitles,
  removeBlueprintNodes,
  reconcileBlueprintTasks,
  renameBlueprintNodes,
} from './blueprintStudio';

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

  it('adds only missing steps and preserves completed step state', () => {
    const leaf = { ...node('l', 'leaf', 'Leaf'), steps: ['Do'], stepDone: [true], completed: true };
    const result = addBlueprintSteps([leaf], ['l'], ['do', 'Check']);
    expect(result.added).toBe(1);
    expect(result.goals[0].steps).toEqual(['Do', 'Check']);
    expect(result.goals[0].stepDone).toEqual([true, false]);
    expect(result.goals[0].completed).toBe(false);
  });

  it('ignores step edits for non-leaf nodes', () => {
    const goal = node('g', 'goal', 'Goal');
    const result = addBlueprintSteps([goal], ['g'], ['Check']);
    expect(result.goals).toEqual([goal]);
    expect(result.added).toBe(0);
  });

  it('renames and removes branches immutably', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Old', [node('s', 'section', 'Child')])])];
    const renamed = renameBlueprintNodes(goals, { p: 'New' });
    expect(renamed[0].children[0].title).toBe('New');
    expect(goals[0].children[0].title).toBe('Old');
    expect(removeBlueprintNodes(renamed, ['p', 's'])[0].children).toEqual([]);
  });

  it('counts nodes and depth for review', () => {
    const goals = [node('g', 'goal', 'Goal', [node('p', 'phase', 'Phase', [node('s', 'section', 'Section')])])];
    expect(countBlueprintNodes(goals)).toBe(3);
    expect(maxBlueprintDepth(goals)).toBe(3);
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
