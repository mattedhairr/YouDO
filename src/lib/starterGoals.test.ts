import { describe, expect, it } from 'vitest';
import { buildStarterGoal, firstEndpoint, STARTER_CHOICES, type StarterExam } from './starterGoals';
import type { GoalNode } from '../types';

const all = (goal: GoalNode): GoalNode[] => [goal, ...goal.children.flatMap(all)];

describe('starter goals', () => {
  it('builds a goal of subjects, each holding chapters with three steps', () => {
    const goal = buildStarterGoal('UPSC', '', 1_000);
    expect(goal.kind).toBe('goal');
    expect(goal.title).toBe('UPSC CSE preparation');
    expect(goal.endDate).toBeUndefined();
    expect(goal.children.map((subject) => subject.title)).toEqual(['GS Paper I', 'GS Paper II', 'GS Paper III', 'Essay', 'CSAT']);
    const chapter = goal.children[0].children[0];
    expect(chapter.title).toBe('Modern History');
    expect(chapter.steps).toHaveLength(3);
    expect(chapter.stepDone).toEqual([false, false, false]);
    expect(all(goal).every((item) => item.createdAt === 1_000)).toBe(true);
  });

  it('gives every node its own id', () => {
    const ids = all(buildStarterGoal('JEE')).map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a plan for every choice on the screen', () => {
    for (const choice of STARTER_CHOICES) {
      const goal = buildStarterGoal(choice.exam);
      expect(goal.children.length).toBeGreaterThan(1);
      expect(firstEndpoint(goal)?.steps?.length).toBe(3);
    }
  });

  it('names a goal of your own, with one first task', () => {
    const goal = buildStarterGoal('Other', '  SSC CGL 2027  ');
    expect(goal.title).toBe('SSC CGL 2027');
    expect(goal.children).toHaveLength(1);
    expect(firstEndpoint(goal)?.title).toBe('Getting started');
    expect(buildStarterGoal('Other', '   ').title).toBe('My goal');
  });

  it('finds the first chapter to plan', () => {
    expect(firstEndpoint(buildStarterGoal('NEET'))?.title).toBe('Kinematics');
    const empty: GoalNode = { id: 'g', kind: 'goal', title: 'x', children: [], createdAt: 0 };
    expect(firstEndpoint(empty)).toBeNull();
  });

  it('covers each exam type', () => {
    const exams: StarterExam[] = ['JEE', 'NEET', 'UPSC', 'GATE', 'CAT', 'Boards', 'Other'];
    for (const exam of exams) expect(buildStarterGoal(exam).title.length).toBeGreaterThan(0);
  });
});
