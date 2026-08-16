import type { GoalNode, Task } from '../types';
import { todayISO } from './dates';
import { uid } from './ids';

export function countDirectChildren(node: GoalNode): number {
  if (node.children.length === 0) {
    return node.steps && node.steps.length > 0 ? node.steps.length : 1;
  }
  return node.children.length;
}

export function countCompletedDirectChildren(node: GoalNode): number {
  if (node.children.length === 0) {
    if (node.steps && node.steps.length > 0) {
      return (node.stepDone ?? []).filter(Boolean).length;
    }
    return node.completed ? 1 : 0;
  }
  return node.children.filter((c) => c.completed || rollupPct(c) === 100).length;
}

const rollupCache = new Map<string, number>();

export function clearRollupCache() {
  rollupCache.clear();
}

function leafWork(node: GoalNode): { done: number; total: number } {
  if (node.children.length > 0) {
    return node.children.reduce(
      (acc, child) => {
        const next = leafWork(child);
        return { done: acc.done + next.done, total: acc.total + next.total };
      },
      { done: 0, total: 0 },
    );
  }
  if (node.steps && node.steps.length > 0) {
    return { done: (node.stepDone ?? []).filter(Boolean).length, total: node.steps.length };
  }
  return { done: node.completed ? 1 : 0, total: 1 };
}

/** Share of leaf work done (steps, or one unit for a stepless leaf). */
export function rollupPct(node: GoalNode): number {
  const cached = rollupCache.get(node.id);
  if (cached !== undefined) return cached;
  const { done, total } = leafWork(node);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  rollupCache.set(node.id, pct);
  return pct;
}

export function recomputeCompleted(node: GoalNode): GoalNode {
  const children = (node.children ?? []).map(recomputeCompleted);
  let changed = children.length !== node.children.length;
  if (!changed) {
    for (let i = 0; i < children.length; i++) {
      if (children[i] !== node.children[i]) {
        changed = true;
        break;
      }
    }
  }

  let completed = node.completed;
  if (children.length === 0) {
    const steps = node.steps ?? [];
    if (steps.length > 0) {
      const stepDone = node.stepDone ?? [];
      completed = steps.every((_, i) => Boolean(stepDone[i]));
    }
  } else {
    completed = children.length > 0 && children.every((c) => c.completed);
  }

  if (!changed && completed === node.completed) return node;
  return { ...node, children, completed };
}

export function setSubtreeCompleted(node: GoalNode, isDone: boolean): GoalNode {
  const steps = node.steps ?? [];
  return {
    ...node,
    completed: isDone,
    stepDone: steps.length > 0 ? steps.map(() => isDone) : node.stepDone,
    children: node.children.map((child) => setSubtreeCompleted(child, isDone)),
  };
}

export function findNode(root: GoalNode, id: string): [GoalNode | null, GoalNode | null] {
  if (root.id === id) return [root, null];
  for (const child of root.children) {
    const [found, parent] = findNode(child, id);
    if (found) return [found, parent ?? root];
  }
  return [null, null];
}

export function updateNode(root: GoalNode, id: string, patch: (n: GoalNode) => GoalNode): GoalNode {
  if (root.id === id) return patch(root);
  let changed = false;
  const children = root.children.map((c) => {
    const next = updateNode(c, id, patch);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

export function removeNode(root: GoalNode, id: string): GoalNode {
  const kept = root.children.filter((c) => c.id !== id);
  let changed = kept.length !== root.children.length;
  const children = kept.map((c) => {
    const next = removeNode(c, id);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

export function removeNodes(root: GoalNode, ids: Set<string>): GoalNode {
  const kept = root.children.filter((c) => !ids.has(c.id));
  let changed = kept.length !== root.children.length;
  const children = kept.map((c) => {
    const next = removeNodes(c, ids);
    if (next !== c) changed = true;
    return next;
  });
  return changed ? { ...root, children } : root;
}

export function collectDescendantIds(node: GoalNode): string[] {
  const ids = [node.id];
  for (const child of node.children) ids.push(...collectDescendantIds(child));
  return ids;
}

export function collectDescendantTaskIds(node: GoalNode): string[] {
  const ids: string[] = [];
  if (node.todayTaskId) ids.push(node.todayTaskId);
  for (const child of node.children) ids.push(...collectDescendantTaskIds(child));
  return ids;
}

export function sanitizeTreeAndTasks(goals: GoalNode[], tasks: Task[]): { cleanedGoals: GoalNode[]; cleanedTasks: Task[] } {
  const existingTaskIds = new Set(tasks.map((t) => t.id));
  const seenNodeIds = new Set<string>();

  function sanitizeNode(node: GoalNode): GoalNode {
    let id = node.id;
    if (!id || seenNodeIds.has(id)) id = uid('goal');
    seenNodeIds.add(id);

    let todayTaskId = node.todayTaskId;
    if (todayTaskId && !existingTaskIds.has(todayTaskId)) todayTaskId = null;

    return {
      ...node,
      id,
      todayTaskId,
      children: (node.children ?? []).map(sanitizeNode),
    };
  }

  return { cleanedGoals: (goals ?? []).map(sanitizeNode), cleanedTasks: tasks ?? [] };
}

export function pathTitles(root: GoalNode, id: string): string[] {
  if (root.id === id) return [root.title];
  for (const child of root.children) {
    const sub = pathTitles(child, id);
    if (sub.length) return [root.title, ...sub];
  }
  return [];
}

export function pathNodes(root: GoalNode, id: string): GoalNode[] {
  if (root.id === id) return [root];
  for (const child of root.children) {
    const sub = pathNodes(child, id);
    if (sub.length) return [root, ...sub];
  }
  return [];
}

export function findGoal(goals: GoalNode[], id: string): GoalNode | null {
  for (const root of goals) {
    const [n] = findNode(root, id);
    if (n) return n;
  }
  return null;
}

export function cloneNode(node: GoalNode): GoalNode {
  return {
    ...node,
    id: uid('n'),
    todayTaskId: null,
    pinned: false,
    createdAt: Date.now(),
    children: node.children.map(cloneNode),
  };
}

export function syncStepDone(node: GoalNode, taskProgress: number, slice: number[] | undefined): boolean[] {
  const steps = node.steps ?? [];
  const s = slice ?? steps.map((_, i) => i);
  const existing = node.stepDone ?? steps.map(() => false);
  const result = [...existing];
  s.forEach((masterIdx, slicePos) => {
    if (masterIdx < result.length) result[masterIdx] = slicePos < taskProgress;
  });
  return result;
}

export function countSlicedDone(node: GoalNode, slice: number[] | undefined): number {
  const stepDone = node.stepDone ?? [];
  const s = slice ?? (node.steps ?? []).map((_, i) => i);
  return s.filter((idx) => stepDone[idx]).length;
}

/** One-way: goal node is source of truth for title, description, and micro-steps. */
export function mirrorGoalContentToTask(task: Task, node: GoalNode): Task {
  if (task.goalNodeId !== node.id) return task;
  const master = node.steps ?? [];
  if (master.length === 0) {
    return applyBacklogSchedule({
      ...task,
      title: node.title,
      description: node.description ?? '',
      steps: [],
      progress: node.completed ? 1 : 0,
      stepSlice: undefined,
    });
  }
  const requested = task.stepSlice;
  const slice =
    requested && requested.length > 0
      ? requested.filter((i) => i >= 0 && i < master.length)
      : master.map((_, i) => i);
  const isFull = slice.length === master.length && slice.every((v, i) => v === i);
  return applyBacklogSchedule({
    ...task,
    title: node.title,
    description: node.description ?? '',
    steps: slice.map((idx) => master[idx] ?? `Step ${idx + 1}`),
    progress: countSlicedDone(node, isFull ? undefined : slice),
    stepSlice: isFull ? undefined : slice,
  });
}

export function syncLinkedTasksFromGoal(tasks: Task[], node: GoalNode): Task[] {
  return tasks.map((t) => (t.goalNodeId === node.id ? mirrorGoalContentToTask(t, node) : t));
}

export function isTaskComplete(task: { steps: string[]; progress: number }): boolean {
  const total = task.steps.length > 0 ? task.steps.length : 1;
  return task.progress >= total;
}

/**
 * Incomplete overdue work stays on its original date (Backlog tab).
 * Completed catch-up stays in Backlog until local midnight, then drops off.
 */
export function isBacklogTask(task: Task, today = todayISO()): boolean {
  if (!task.targetDate) return false;
  if (isTaskComplete(task)) {
    return !!task.originalTargetDate && task.targetDate === today;
  }
  if (task.targetDate < today) return true;
  return !!task.originalTargetDate && task.targetDate === today;
}

/** Open (incomplete) backlog — use for badges and “N overdue”, not for the list itself. */
export function isOpenBacklogTask(task: Task, today = todayISO()): boolean {
  return isBacklogTask(task, today) && !isTaskComplete(task);
}

/** When overdue work is finished today, stamp today as the clear date and keep the miss for calendar/stats. */
export function clearBacklogIfComplete(task: Task, today = todayISO()): Task {
  if (!isTaskComplete(task)) return task;
  const missed =
    task.originalTargetDate ||
    (task.targetDate && task.targetDate < today ? task.targetDate : null);
  if (!missed) return task;
  const failed = task.pastFailedNativeDates ?? [];
  return {
    ...task,
    originalTargetDate: missed,
    targetDate: today,
    pastFailedNativeDates: failed.includes(missed) ? failed : [...failed, missed],
  };
}

export function restoreBacklogIfIncomplete(task: Task): Task {
  if (isTaskComplete(task) || !task.originalTargetDate) return task;
  return {
    ...task,
    targetDate: task.originalTargetDate,
    originalTargetDate: undefined,
  };
}

function applyBacklogSchedule(task: Task): Task {
  return isTaskComplete(task) ? clearBacklogIfComplete(task) : restoreBacklogIfIncomplete(task);
}

export function reorderNodesArray(nodes: GoalNode[], fromId: string, toId: string): GoalNode[] {
  const fromIdx = nodes.findIndex((n) => n.id === fromId);
  const toIdx = nodes.findIndex((n) => n.id === toId);
  if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return nodes;
  const result = [...nodes];
  const [removed] = result.splice(fromIdx, 1);
  result.splice(toIdx, 0, removed);
  return result;
}

export function moveNodeInArray(nodes: GoalNode[], id: string, direction: 'up' | 'down'): GoalNode[] {
  const idx = nodes.findIndex((n) => n.id === id);
  if (idx === -1) return nodes;
  const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (targetIdx < 0 || targetIdx >= nodes.length) return nodes;
  const result = [...nodes];
  const temp = result[idx];
  result[idx] = result[targetIdx];
  result[targetIdx] = temp;
  return result;
}

export function sameTree(a: GoalNode[], b: GoalNode[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function sameTasks(a: Task[], b: Task[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
