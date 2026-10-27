import { describe, expect, it } from 'vitest';
import type { GoalNode, Task, TaskSession } from '../types';
import type { WorkspaceSlice } from './syncMerge';
import { mergeWorkspaceThreeWay } from './syncMerge3';

const leaf = (id: string, title: string, steps: string[] = [], stepDone: boolean[] = steps.map(() => false)): GoalNode => ({
  id, kind: 'node', title, children: [], createdAt: 1,
  ...(steps.length ? { steps, stepDone, completed: stepDone.length > 0 && stepDone.every(Boolean) } : {}),
});
const goal = (id: string, title: string, children: GoalNode[]): GoalNode => ({ id, kind: 'goal', title, children, createdAt: 1 });
const task = (id: string, title: string, extra: Partial<Task> = {}): Task => ({
  id, title, description: '', priority: 'medium', targetDate: '2026-10-27', deadline: null,
  steps: [], progress: 0, createdAt: 1, order: 0, ...extra,
});
const sitting = (id: string, taskId: string, netFocusMs: number): TaskSession => ({
  id, taskId, startTime: 1000, endTime: 1000 + netFocusMs, pausedDuration: 0, pauses: [], netFocusMs,
  wallClockStart: '9:00 AM', wallClockEnd: '10:00 AM', completed: false, completedStepIndices: [],
});
const slice = (goals: GoalNode[], tasks: Task[] = [], updatedAt = 1, extra: Partial<WorkspaceSlice> = {}): WorkspaceSlice => ({
  goals, tasks, sessionHistory: {}, recentlyDeletedGoals: [], deletionLedger: [], updatedAt, ...extra,
});
const tree = (s: WorkspaceSlice) => JSON.parse(JSON.stringify(s.goals)) as GoalNode[];
const find = (nodes: GoalNode[], id: string): GoalNode | undefined => {
  for (const n of nodes) {
    if (n.id === id) return n;
    const hit = find(n.children, id);
    if (hit) return hit;
  }
  return undefined;
};

const lecture = (done: boolean[]) => leaf('l7', 'Lecture - 7', ['Watch', 'Notes', 'DPP'], done);
const base = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture - 8')])]);

describe('mergeWorkspaceThreeWay', () => {
  it('takes a tick from one device and a rename from the other', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([true, false, false]), leaf('l8', 'Lecture - 8')])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture 8 (revision)')])], [], 3);
    const { slice: out, clashes } = mergeWorkspaceThreeWay(base, phone, laptop);
    expect(find(out.goals, 'l7')?.stepDone).toEqual([true, false, false]);
    expect(find(out.goals, 'l8')?.title).toBe('Lecture 8 (revision)');
    expect(clashes).toEqual([]);
  });

  it('keeps ticks from both devices on the same goal (the "Lecture - 7" case)', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([true, false, false]), leaf('l8', 'Lecture - 8')])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, true, false]), leaf('l8', 'Lecture - 8')])], [], 3);
    const out = mergeWorkspaceThreeWay(base, phone, laptop);
    expect(find(out.slice.goals, 'l7')?.stepDone).toEqual([true, true, false]);
    expect(out.clashes).toEqual([]);
  });

  it('never unticks progress when there is no shared copy to compare with', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([true, true, true])])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, false, true])])], [], 9);
    const l7 = find(mergeWorkspaceThreeWay(null, phone, laptop).slice.goals, 'l7')!;
    expect(l7.stepDone).toEqual([true, true, true]);
    expect(l7.completed).toBe(true);
  });

  it('keeps ticks when the other device renamed or added steps', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([false, true, false]), leaf('l8', 'Lecture - 8')])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [leaf('l7', 'Lecture - 7', ['Watch', 'Notes', 'DPP', 'Revise'], [false, false, false, false]), leaf('l8', 'Lecture - 8')])], [], 3);
    const l7 = find(mergeWorkspaceThreeWay(base, phone, laptop).slice.goals, 'l7')!;
    expect(l7.steps).toEqual(['Watch', 'Notes', 'DPP', 'Revise']);
    expect(l7.stepDone).toEqual([false, true, false, false]);
  });

  it('keeps items added on both devices', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture - 8'), leaf('p1', 'Phone note')])], [task('t1', 'Phone card')], 2);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture - 8'), leaf('w1', 'Laptop note')])], [task('t2', 'Laptop card')], 3);
    const out = mergeWorkspaceThreeWay(base, phone, laptop).slice;
    expect(find(out.goals, 'g')!.children.map((n) => n.id)).toEqual(['l7', 'l8', 'w1', 'p1']);
    expect(out.tasks.map((t) => t.id).sort()).toEqual(['t1', 't2']);
  });

  it('applies a delete from one device when the other did not touch the item', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([false, false, false])])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027 ', [lecture([false, false, false]), leaf('l8', 'Lecture - 8')])], [], 3);
    const out = mergeWorkspaceThreeWay(base, phone, laptop);
    expect(find(out.slice.goals, 'l8')).toBeUndefined();
    expect(out.kept).toEqual([]);
  });

  it('keeps an item deleted on one device but edited on the other', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([false, false, false])])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture - 8', ['Watch'], [true])])], [], 3);
    const out = mergeWorkspaceThreeWay(base, phone, laptop);
    expect(find(out.slice.goals, 'l8')?.stepDone).toEqual([true]);
    expect(out.kept).toEqual(['Lecture - 8']);
  });

  it('resolves the same detail changed on both devices to the newer edit and reports it', () => {
    const phone = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture 8 (phone)')])], [], 5);
    const laptop = slice([goal('g', 'GATE 2027', [lecture([false, false, false]), leaf('l8', 'Lecture 8 (laptop)')])], [], 3);
    const out = mergeWorkspaceThreeWay(base, phone, laptop);
    expect(find(out.slice.goals, 'l8')?.title).toBe('Lecture 8 (phone)');
    expect(out.clashes).toEqual(['Lecture 8 (phone)']);
  });

  it('follows a move made on one device', () => {
    const b = slice([goal('a', 'A', [leaf('x', 'X')]), goal('b', 'B', [])]);
    const phone = slice([goal('a', 'A', []), goal('b', 'B', [leaf('x', 'X')])], [], 2);
    const laptop = slice([goal('a', 'A', [leaf('x', 'X'), leaf('y', 'Y')]), goal('b', 'B', [])], [], 3);
    const out = tree(mergeWorkspaceThreeWay(b, phone, laptop).slice);
    expect(find(out, 'b')!.children.map((n) => n.id)).toEqual(['x']);
    expect(find(out, 'a')!.children.map((n) => n.id)).toEqual(['y']);
  });

  it('breaks a loop when two devices move items under each other', () => {
    const b = slice([goal('a', 'A', []), goal('b', 'B', [])]);
    const phone = slice([goal('a', 'A', [goal('b', 'B', [])])], [], 2);
    const laptop = slice([goal('b', 'B', [goal('a', 'A', [])])], [], 3);
    const out = tree(mergeWorkspaceThreeWay(b, phone, laptop).slice);
    const ids = JSON.stringify(out);
    expect(ids.match(/"id":"a"/g)).toHaveLength(1);
    expect(ids.match(/"id":"b"/g)).toHaveLength(1);
  });

  it('keeps the higher card progress and every sitting from both devices', () => {
    const b = slice([], [task('t', 'DPP-1', { steps: ['a', 'b', 'c'], progress: 0 })]);
    const phone = slice([], [task('t', 'DPP-1', { steps: ['a', 'b', 'c'], progress: 2 })], 2, { sessionHistory: { t: [sitting('s1', 't', 600)] } });
    const laptop = slice([], [task('t', 'DPP-1', { steps: ['a', 'b', 'c'], progress: 1 })], 3, { sessionHistory: { t: [sitting('s2', 't', 900), sitting('s1', 't', 300)] } });
    const out = mergeWorkspaceThreeWay(b, phone, laptop).slice;
    expect(out.tasks[0].progress).toBe(2);
    expect(out.sessionHistory.t.map((s) => [s.id, s.netFocusMs]).sort()).toEqual([['s1', 600], ['s2', 900]]);
  });

  it('keeps a card and its goal when the goal was deleted on the other device but the card changed', () => {
    const b = slice([goal('g', 'GATE 2027', [leaf('l9', 'Lecture - 9')])], [task('t', 'L9 card', { goalNodeId: 'l9' })]);
    const phone = slice([goal('g', 'GATE 2027', [])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [leaf('l9', 'Lecture - 9')])], [task('t', 'L9 card', { goalNodeId: 'l9', progress: 1 })], 3);
    const out = mergeWorkspaceThreeWay(b, phone, laptop).slice;
    expect(out.tasks.map((t) => t.id)).toEqual(['t']);
    expect(find(out.goals, 'l9')).toBeDefined();
  });

  it('without a shared copy keeps everything from both devices', () => {
    const phone = slice([goal('g', 'GATE 2027', [leaf('p', 'Only on phone')])], [], 2);
    const laptop = slice([goal('g', 'GATE 2027', [leaf('w', 'Only on laptop')])], [], 3);
    const out = mergeWorkspaceThreeWay(null, phone, laptop).slice;
    expect(find(out.goals, 'g')!.children.map((n) => n.id).sort()).toEqual(['p', 'w']);
  });
});
