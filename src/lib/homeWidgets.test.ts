import { describe, expect, it } from 'vitest';
import type { GoalNode, Task } from '../types';
import { avatarColor, parseWidgetActions, planWidgetMoves, widgetGoals, widgetRooms, widgetTodayTasks } from './homeWidgets';

const task = (id: string, order: number, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: '', priority: 'medium', targetDate: '2026-10-28', deadline: null,
  steps: ['a', 'b'], progress: 0, createdAt: 0, order, ...extra,
});

const node = (id: string, extra: Partial<GoalNode> = {}): GoalNode => ({ id, kind: 'node', title: id, children: [], createdAt: 0, ...extra });

describe('widgetTodayTasks', () => {
  it('lists open cards in Today order with their rank, path and steps', () => {
    const goals = [node('Novel', { kind: 'goal', children: [node('Part one', { children: [node('n1')] })] })];
    const cards = widgetTodayTasks([
      task('b', 5, { goalNodeId: 'n1', progress: 1 }),
      task('done', 1, { progress: 2 }),
      task('a', 2),
    ], goals);
    expect(cards.map((card) => [card.id, card.rank])).toEqual([['a', 1], ['b', 2]]);
    expect(cards[1]).toMatchObject({ path: 'Novel › Part one', done: 1, total: 2 });
    expect(cards[0].path).toBe('Quick task');
  });
});

describe('planWidgetMoves', () => {
  const today = [task('a', 0), task('b', 1), task('c', 2), task('done', 3, { progress: 2 })];

  it('swaps a card with its open neighbour', () => {
    expect(planWidgetMoves(today, [{ taskId: 'b', dir: 'up' }])).toEqual([['b', 'a']]);
    expect(planWidgetMoves(today, [{ taskId: 'b', dir: 'down' }])).toEqual([['b', 'c']]);
  });

  it('lets later taps see earlier ones, as the widget showed them', () => {
    expect(planWidgetMoves(today, [{ taskId: 'c', dir: 'up' }, { taskId: 'c', dir: 'up' }])).toEqual([['c', 'b'], ['c', 'a']]);
  });

  it('drops moves past either end, of finished cards and of unknown ones', () => {
    expect(planWidgetMoves(today, [
      { taskId: 'a', dir: 'up' }, { taskId: 'c', dir: 'down' }, { taskId: 'done', dir: 'up' }, { taskId: 'x', dir: 'up' },
    ])).toEqual([]);
  });
});

describe('widgetGoals', () => {
  it('counts every step under a goal and keeps only a dated deadline', () => {
    const goal = node('g', {
      kind: 'goal', endDate: '2026-12-15',
      children: [node('x', { steps: ['1', '2', '3'], stepDone: [true, false, true] }), node('y', { completed: true })],
    });
    expect(widgetGoals([goal])[0]).toMatchObject({ deadline: '2026-12-15', stepsDone: 3, stepsTotal: 4 });
    expect(widgetGoals([{ ...goal, endDate: 'soon' }])[0].deadline).toBeNull();
  });
});

describe('widgetRooms', () => {
  it('shows at most four members with their live state', () => {
    const rooms = widgetRooms([{
      id: 'r1', name: 'Morning Writers',
      members: ['asha', 'ben', 'mira', 'leo', 'extra'].map((name, i) => ({ id: `u${i}`, name })),
    }], { u0: { userId: 'u0', state: 'focusing', startedAt: '2026-10-28T09:00:00.000Z', pausedMs: 0, updatedAt: '2026-10-28T09:00:00.000Z' } });
    expect(rooms[0].members).toHaveLength(4);
    expect(rooms[0].members[0]).toMatchObject({ initial: 'A', state: 'focusing', startedAt: Date.parse('2026-10-28T09:00:00.000Z') });
    expect(rooms[0].members[1]).toMatchObject({ initial: 'B', state: 'idle', startedAt: null });
    expect(rooms[0].members[0].color).toBe(avatarColor('u0'));
  });
});

describe('parseWidgetActions', () => {
  it('keeps only well-formed moves and stops', () => {
    expect(parseWidgetActions([
      { type: 'move', taskId: 'a', dir: 'up' }, { type: 'move', taskId: 'a', dir: 'left' },
      { type: 'stop', taskId: 'b' }, { type: 'start', taskId: 'c' }, null, 'x',
    ])).toEqual([{ type: 'move', taskId: 'a', dir: 'up' }, { type: 'stop', taskId: 'b' }]);
    expect(parseWidgetActions(undefined)).toEqual([]);
  });
});
