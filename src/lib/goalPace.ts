import type { GoalNode } from '../types';
import { rollupPct } from './goalTree';

/** Whole days from today to a local yyyy-mm-dd (0 on the day itself, negative once past). */
export function daysUntil(dateISO: string, today: string): number {
  const [ey, em, ed] = dateISO.slice(0, 10).split('-').map(Number);
  const [ty, tm, td] = today.split('-').map(Number);
  return Math.round((Date.UTC(ey, em - 1, ed) - Date.UTC(ty, tm - 1, td)) / 86_400_000);
}

/**
 * The stage of a goal that sets today's pace: of its open top-level branches
 * (with items of their own: a dated single item is a task, not a stage) that
 * have started and carry an end date, the one that ends first.
 *
 * Many people plan a goal one stage at a time, so a pace over the whole goal
 * would count the stages not planned yet as no work and promise an easy finish.
 * The stage in progress is always planned, so its pace is real.
 */
export function currentStage(goal: GoalNode, today: string): GoalNode | null {
  let stage: GoalNode | null = null;
  for (const child of goal.children) {
    const end = child.endDate?.slice(0, 10);
    if (!end || end < today || child.children.length === 0 || child.completed || rollupPct(child) >= 100) continue;
    if (child.startDate && child.startDate.slice(0, 10) > today) continue;
    if (!stage || end < (stage.endDate ?? '').slice(0, 10)) stage = child;
  }
  return stage;
}

export interface GoalPace {
  /** The stage the pace is for; null means the whole goal, as planned so far. */
  stage: GoalNode | null;
  /** Open work in that scope, as counted by the caller (tasks or steps). */
  open: number;
  daysLeft: number;
}

/**
 * The work left and the days for it, over the current stage when the goal has
 * dated stages, else over the whole goal up to its deadline. Null without a
 * date to pace against.
 */
export function goalPace(goal: GoalNode, goalEnd: string | undefined, openOf: (node: GoalNode) => number, today: string): GoalPace | null {
  const stage = currentStage(goal, today);
  const end = stage?.endDate ?? goalEnd;
  if (!end) return null;
  return { stage, open: openOf(stage ?? goal), daysLeft: daysUntil(end, today) };
}
