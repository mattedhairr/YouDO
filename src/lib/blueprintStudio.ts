import type { GoalKind, GoalNode, Task } from '../types';
import { uid } from './ids';
import { findGoal, mirrorGoalContentToTask, removeNodes, updateNode } from './goalTree';

export const BLUEPRINT_LEVELS: GoalKind[] = ['goal', 'phase', 'section', 'task', 'sub', 'leaf'];

export const BLUEPRINT_LABELS: Record<GoalKind, { singular: string; plural: string; hint: string }> = {
  goal: {
    singular: 'goal',
    plural: 'goals',
    hint: 'The exam-preparation result you want to reach.',
  },
  phase: {
    singular: 'phase',
    plural: 'phases',
    hint: 'A big stage of preparation, such as building fundamentals, covering the syllabus, or revising.',
  },
  section: {
    singular: 'section',
    plural: 'sections',
    hint: 'A group that keeps related subjects or preparation work together inside one phase.',
  },
  task: {
    singular: 'task',
    plural: 'tasks',
    hint: 'A clear piece of study or practice work that produces a result when finished.',
  },
  sub: {
    singular: 'subtask',
    plural: 'subtasks',
    hint: 'A smaller study part that makes a larger task easier to start and finish.',
  },
  leaf: {
    singular: 'leaf task',
    plural: 'leaf tasks',
    hint: 'The smallest piece of preparation you want to schedule and complete separately.',
  },
};

export function nextBlueprintKind(kind: GoalKind): GoalKind | null {
  const index = BLUEPRINT_LEVELS.indexOf(kind);
  return index >= 0 && index < BLUEPRINT_LEVELS.length - 1 ? BLUEPRINT_LEVELS[index + 1] : null;
}

export function nextKindAfter(kind: GoalKind): GoalKind | 'steps' | null {
  return nextBlueprintKind(kind) ?? (kind === 'leaf' ? 'steps' : null);
}

export function normalizeBlueprintTitles(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, ' ');
    const key = clean.toLocaleLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    result.push(clean);
  }
  return result;
}

export function numberedBlueprintTitles(prefix: string, start: number, count: number): string[] {
  const cleanPrefix = prefix.trim().replace(/\s+/g, ' ') || 'Item';
  const safeStart = Number.isFinite(start) ? Math.max(0, Math.floor(start)) : 1;
  const safeCount = Math.max(1, Math.min(100, Math.floor(count) || 1));
  return Array.from({ length: safeCount }, (_, index) => `${cleanPrefix} ${safeStart + index}`);
}

export function makeBlueprintNode(kind: GoalKind, title: string, now = Date.now()): GoalNode {
  return {
    id: uid('goal'),
    kind,
    title: title.trim(),
    children: [],
    steps: kind === 'leaf' ? [] : undefined,
    stepDone: kind === 'leaf' ? [] : undefined,
    completed: false,
    createdAt: now,
  };
}

export interface AddChildrenResult {
  goals: GoalNode[];
  createdIds: string[];
  added: number;
}

/** Add the same ordered child list to every target. Existing sibling titles are skipped per parent. */
export function addBlueprintChildren(
  goals: GoalNode[],
  parentIds: string[],
  kind: GoalKind,
  rawTitles: string[],
): AddChildrenResult {
  const titles = normalizeBlueprintTitles(rawTitles);
  if (titles.length === 0 || parentIds.length === 0) return { goals, createdIds: [], added: 0 };

  let next = goals;
  const createdIds: string[] = [];
  let added = 0;

  for (const parentId of [...new Set(parentIds)]) {
    const parent = findGoal(next, parentId);
    if (!parent) continue;
    const existing = new Set(parent.children.map((child) => child.title.trim().toLocaleLowerCase()));
    const nodes = titles
      .filter((title) => !existing.has(title.toLocaleLowerCase()))
      .map((title) => makeBlueprintNode(kind, title));
    if (nodes.length === 0) continue;
    createdIds.push(...nodes.map((node) => node.id));
    added += nodes.length;
    next = next.map((root) => updateNode(root, parentId, (node) => ({ ...node, children: [...node.children, ...nodes] })));
  }

  return { goals: next, createdIds, added };
}

export interface AddStepsResult {
  goals: GoalNode[];
  added: number;
  affected: number;
}

/** Append missing steps to leaf nodes. Duplicate labels are skipped without disturbing completion state. */
export function addBlueprintSteps(goals: GoalNode[], nodeIds: string[], rawSteps: string[]): AddStepsResult {
  const steps = normalizeBlueprintTitles(rawSteps);
  if (steps.length === 0 || nodeIds.length === 0) return { goals, added: 0, affected: 0 };

  let added = 0;
  let affected = 0;
  const targets = new Set(nodeIds);
  const next = goals.map((root) => {
    let changedRoot = root;
    for (const id of targets) {
      changedRoot = updateNode(changedRoot, id, (node) => {
        if (node.kind !== 'leaf') return node;
        const oldSteps = node.steps ?? [];
        const oldDone = node.stepDone ?? oldSteps.map(() => false);
        const existing = new Set(oldSteps.map((step) => step.trim().toLocaleLowerCase()));
        const missing = steps.filter((step) => !existing.has(step.toLocaleLowerCase()));
        if (missing.length === 0) return node;
        added += missing.length;
        affected += 1;
        return {
          ...node,
          steps: [...oldSteps, ...missing],
          stepDone: [...oldDone, ...missing.map(() => false)],
          completed: false,
        };
      });
    }
    return changedRoot;
  });
  return { goals: next, added, affected };
}

export function renameBlueprintNodes(goals: GoalNode[], titlesById: Record<string, string>): GoalNode[] {
  let next = goals;
  for (const [id, rawTitle] of Object.entries(titlesById)) {
    const title = rawTitle.trim().replace(/\s+/g, ' ');
    if (!title) continue;
    next = next.map((root) => updateNode(root, id, (node) => ({ ...node, title })));
  }
  return next;
}

/** Remove selected branches once. Descendants of another selected node are ignored as redundant targets. */
export function removeBlueprintNodes(goals: GoalNode[], nodeIds: string[]): GoalNode[] {
  const targets = new Set(nodeIds);
  if (targets.size === 0) return goals;
  return goals.map((root) => removeNodes(root, targets)).filter((root) => !targets.has(root.id));
}

export function flattenBlueprint(goals: GoalNode[]): GoalNode[] {
  const result: GoalNode[] = [];
  const visit = (node: GoalNode) => {
    result.push(node);
    node.children.forEach(visit);
  };
  goals.forEach(visit);
  return result;
}

export function countBlueprintNodes(goals: GoalNode[]): number {
  return flattenBlueprint(goals).length;
}

export function maxBlueprintDepth(goals: GoalNode[]): number {
  const depth = (node: GoalNode): number => 1 + Math.max(0, ...node.children.map(depth));
  return Math.max(0, ...goals.map(depth));
}

export function findBlueprintPath(goals: GoalNode[], id: string): GoalNode[] {
  const walk = (node: GoalNode): GoalNode[] => {
    if (node.id === id) return [node];
    for (const child of node.children) {
      const path = walk(child);
      if (path.length) return [node, ...path];
    }
    return [];
  };
  for (const root of goals) {
    const path = walk(root);
    if (path.length) return path;
  }
  return [];
}

export function blueprintChildrenAt(goals: GoalNode[], parentId: string | null): GoalNode[] {
  return parentId ? findGoal(goals, parentId)?.children ?? [] : goals;
}

/** Keep linked Today copies valid after an atomic blueprint edit; removed branches lose their mirrors. */
export function reconcileBlueprintTasks(tasks: Task[], goals: GoalNode[]): Task[] {
  return tasks
    .filter((task) => !task.goalNodeId || Boolean(findGoal(goals, task.goalNodeId)))
    .map((task) => {
      if (!task.goalNodeId) return task;
      const node = findGoal(goals, task.goalNodeId);
      return node ? mirrorGoalContentToTask(task, node) : task;
    });
}
