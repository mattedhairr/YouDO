import { describe, expect, it } from 'vitest';
import type { GoalNode, Task } from '../types';
import { avatarColor, parseWidgetActions, widgetAccent, widgetBacklogTasks, widgetFocus, widgetGoals, widgetRooms, widgetStreak, widgetTodayTasks, widgetUpcomingTasks } from './homeWidgets';

const task = (id: string, order: number, extra: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: '', priority: 'medium', targetDate: '2026-10-28', deadline: null,
  steps: ['a', 'b'], progress: 0, createdAt: 0, order, ...extra,
});

const node = (id: string, extra: Partial<GoalNode> = {}): GoalNode => ({ id, kind: 'node', title: id, children: [], createdAt: 0, ...extra });

describe('widgetTodayTasks', () => {
  it('lists open cards in Today order with their rank, path and steps', () => {
    const goals = [node('Novel', { kind: 'goal', children: [node('Part one', { children: [node('Ch 1', { children: [node('Scene', { children: [node('n1')] })] })] })] })];
    const cards = widgetTodayTasks([
      task('b', 5, { goalNodeId: 'n1', progress: 1 }),
      task('done', 1, { progress: 2 }),
      task('a', 2),
    ], goals);
    expect(cards.map((card) => [card.id, card.rank])).toEqual([['a', 1], ['b', 2]]);
    // As Today's cards: two levels as the eyebrow, the rest under the title.
    expect(cards[1]).toMatchObject({ origin: 'Novel • Part one', context: 'Ch 1 / Scene', done: 1, total: 2, next: 'b' });
    expect(widgetTodayTasks([task('x', 0, { steps: [] })], [])[0].next).toBeNull();
    expect(cards[0]).toMatchObject({ origin: null, context: '', goal: null });
    expect(cards[1].goal).toBe('Novel');
  });
});

describe('widgetBacklogTasks', () => {
  it('lists open overdue cards oldest first, with the date they were due', () => {
    const cards = widgetBacklogTasks([
      task('late', 0, { targetDate: '2026-10-27' }),
      task('later', 1, { targetDate: '2026-10-25' }),
      task('fixed', 2, { targetDate: '2026-10-24', progress: 2 }),
    ], []);
    expect(cards.map((card) => [card.id, card.due, card.rank])).toEqual([['later', '2026-10-25', 1], ['late', '2026-10-27', 2]]);
  });
});

describe('widgetUpcomingTasks', () => {
  it('lists open cards for the next seven days, by date and then order, each with its day', () => {
    const cards = widgetUpcomingTasks([
      task('today', 0, { targetDate: '2026-10-28' }),
      task('fri', 3, { targetDate: '2026-10-30' }),
      task('thu', 1, { targetDate: '2026-10-29' }),
      task('fri-first', 1, { targetDate: '2026-10-30' }),
      task('done', 0, { targetDate: '2026-10-29', progress: 2 }),
      task('week-out', 0, { targetDate: '2026-11-04' }),
      task('too-far', 0, { targetDate: '2026-11-05' }),
      task('undated', 0, { targetDate: null }),
    ], [], '2026-10-28');
    expect(cards.map((card) => [card.id, card.due])).toEqual([
      ['thu', '2026-10-29'], ['fri-first', '2026-10-30'], ['fri', '2026-10-30'], ['week-out', '2026-11-04'],
    ]);
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

describe('widgetFocus', () => {
  it('averages the days since focus began, up to the last 30, without today', () => {
    const byDate = new Map([['2026-10-29', 600_000], ['2026-10-27', 3_600_000], ['2026-10-28', 0]]);
    // Focus began on the 27th: two days (27th, 28th) before today.
    expect(widgetFocus(byDate, 4, '2026-10-29')).toEqual({
      todayMs: 600_000, avgMs: 1_800_000, bestMs: 3_600_000, bestDate: '2026-10-27', barMs: 4 * 3_600_000,
    });
    expect(widgetFocus(new Map(), 4, '2026-10-29')).toMatchObject({ todayMs: 0, avgMs: 0, bestMs: 0, bestDate: null });
  });

  it('finds the best of the 30 days before today, the latest on a tie', () => {
    const byDate = new Map([
      ['2026-09-28', 9_000_000], // 31 days back: outside
      ['2026-10-10', 7_200_000],
      ['2026-10-20', 7_200_000],
      ['2026-10-29', 9_000_000], // today is not counted
    ]);
    expect(widgetFocus(byDate, 4, '2026-10-29')).toMatchObject({ bestMs: 7_200_000, bestDate: '2026-10-20' });
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

  it('names members by first name, and the signed-in member as You', () => {
    const rooms = widgetRooms([{
      id: 'r1', name: 'Room', members: [{ id: 'u0', name: 'Asha Rao' }, { id: 'u1', name: 'Bartholomew-Longname' }],
    }], {}, 'u1');
    expect(rooms[0].members.map((member) => member.name)).toEqual(['Asha', 'You']);
    expect(widgetRooms([{ id: 'r', name: 'R', members: [{ id: 'x', name: 'Bartholomew-Longname' }] }], {})[0].members[0].name).toBe('Bartholomew-');
  });
});

describe('widgetRooms avatars', () => {
  it('uses the room emoji and emoji avatars, and a letter for photos or none', () => {
    const [room] = widgetRooms([{
      id: 'r', name: 'Gaters', icon: '🦉',
      members: [{ id: 'a', name: 'Asha', avatar: '🐼' }, { id: 'b', name: 'ben', avatar: 'https://x.test/b.png' }, { id: 'c', name: 'Cy' }],
    }], {});
    expect(room.icon).toBe('🦉');
    expect(room.members.map((member) => member.initial)).toEqual(['🐼', 'B', 'C']);
    expect(widgetRooms([{ id: 'r', name: 'R', members: [] }], {})[0].icon).toBe('🔥');
  });
});

describe('widgetStreak', () => {
  const revive = { active: true, windowEnds: '2026-10-28', previousStreak: 12 };
  it('keeps a broken streak that can still be restored, until the end of its window', () => {
    const now = new Date(2026, 9, 28, 10, 0).getTime();
    expect(widgetStreak({ current: 0, revive }, now)).toEqual({ days: 0, save: { days: 12, endsAt: new Date(2026, 9, 29).getTime(), hint: 'hit your focus bar' } });
  });
  it('says what restoring still takes', () => {
    expect(widgetStreak({ current: 0, revive: { ...revive, mode: 'backlog', remainingTasks: 2, remainingScheduled: 1 } }).save?.hint).toBe('finish 3 tasks and hit your focus bar');
    expect(widgetStreak({ current: 0, revive: { ...revive, mode: 'challenge', challengeBarHours: 8 } }).save?.hint).toBe('focus 8h in a day');
  });
  it('has nothing to save once the window is gone or there was no streak', () => {
    expect(widgetStreak({ current: 3, revive: null }).save).toBeNull();
    expect(widgetStreak({ current: 0, revive: { ...revive, active: false } }).save).toBeNull();
    expect(widgetStreak({ current: 0, revive: { ...revive, previousStreak: 0 } }).save).toBeNull();
  });
});

describe('widgetAccent', () => {
  it('sends the chosen accent for light and dark phones', () => {
    expect(widgetAccent('slate')).toEqual({ light: '#4A6A93', dark: '#8DA6C9' });
    expect(widgetAccent(undefined)).toEqual({ light: '#8C6A3A', dark: '#C9A46E' });
  });
});

describe('parseWidgetActions', () => {
  it('keeps only well-formed stops and places to open', () => {
    expect(parseWidgetActions([
      { type: 'move', taskId: 'a', dir: 'up' }, { type: 'stop', taskId: 'b' }, { type: 'stop' }, { type: 'start', taskId: 'c' }, null, 'x',
      { type: 'open', kind: 'room', id: 'r1' }, { type: 'open', kind: 'board', id: 'x' }, { type: 'open', kind: 'goal' },
    ])).toEqual([{ type: 'stop', taskId: 'b' }, { type: 'open', kind: 'room', id: 'r1' }]);
    expect(parseWidgetActions(undefined)).toEqual([]);
  });
});
