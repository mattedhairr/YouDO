import type { GoalNode, Task } from '../types';
import {
  collectDescendantIds,
  countSlicedDone,
  findGoal,
  findNode,
  hasGoalExecutionState,
  isGoalEndpoint,
  isTaskComplete,
  recomputeCompleted,
  removeNode,
  rescheduleOpenBacklogTask,
  updateNode,
} from './goalTree';

export interface DeletedBranchSnapshot {
  node: GoalNode;
  tasks: Task[];
  parentRootId: string | null;
  parentNodeId?: string | null;
  /** Older trash records cloned node IDs and lost their Today pointers. */
  linkageVersion?: 1;
}

export function goalDeletionLocation(goals: GoalNode[], rootId: string, nodeId: string) {
  const root = goals.find((item) => item.id === rootId);
  if (!root) return null;
  const [node, parent] = findNode(root, nodeId);
  if (!node) return null;
  return { node, parentRootId: rootId === nodeId ? null : rootId, parentNodeId: parent?.id ?? null };
}

export function appendGoalChild(goals: GoalNode[], parentId: string, child: GoalNode): GoalNode[] {
  return goals.map((root) => recomputeCompleted(updateNode(root, parentId, (parent) => {
    if (isGoalEndpoint(parent) && hasGoalExecutionState(parent)) return parent;
    return { ...parent, children: [...parent.children, child] };
  })));
}

export function removeGoalBranch(goals: GoalNode[], rootId: string, nodeId: string): GoalNode[] {
  if (!goalDeletionLocation(goals, rootId, nodeId)) return goals;
  return goals
    .filter((root) => root.id !== nodeId)
    .map((root) => root.id === rootId ? recomputeCompleted(removeNode(root, nodeId)) : root);
}

/** Removing a branch must not erase completed dated cards or focus history. */
export function activePlansForDeletedBranch(node: GoalNode, tasks: Task[]): Task[] {
  const ids = new Set(collectDescendantIds(node));
  return tasks.filter((task) => !!task.goalNodeId && ids.has(task.goalNodeId) && !isTaskComplete(task));
}

/** Replanning unfinished work keeps its identity and any earlier failed dates. */
export function rescheduleExistingGoalPlan(task: Task, date: string, today: string): Task | null {
  if (isTaskComplete(task)) return null;
  return rescheduleOpenBacklogTask(task, date, today) ?? { ...task, targetDate: date };
}

/** The current Goal node owns content/progress; dated cards own their schedule. */
export function isValidGoalPlanSlice(node: GoalNode, slice: number[]): boolean {
  const length = node.steps?.length ?? 0;
  return (length === 0 ? slice.length === 0 : slice.length > 0) &&
    new Set(slice).size === slice.length &&
    slice.every((index) => Number.isInteger(index) && index >= 0 && index < length);
}

export function buildGoalPlanTask(
  node: GoalNode,
  targetDate: string,
  requestedSlice: number[],
  prior: Task | null,
  id: string,
  order: number,
  createdAt: number,
): Task {
  if (!isValidGoalPlanSlice(node, requestedSlice)) {
    throw new Error('Cannot schedule an empty or invalid Goal checklist selection');
  }
  const master = node.steps ?? [];
  const slice = requestedSlice;
  const full = slice.length === master.length && slice.every((index, position) => index === position);
  return {
    ...(prior ?? {}),
    id,
    title: node.title,
    description: node.description ?? '',
    priority: 'medium',
    targetDate,
    deadline: null,
    steps: slice.map((index) => master[index]),
    progress: countSlicedDone(node, full ? undefined : slice),
    createdAt,
    order,
    goalNodeId: node.id,
    stepSlice: full ? undefined : slice,
  };
}

/** Refuse ambiguous collisions rather than silently overwriting another goal or card. */
export function restoreDeletedBranch(
  goals: GoalNode[],
  tasks: Task[],
  snapshot: DeletedBranchSnapshot,
): { goals: GoalNode[]; tasks: Task[] } | null {
  const restoredIds = collectDescendantIds(snapshot.node);
  if (restoredIds.some((id) => !!findGoal(goals, id))) return null;
  const taskIds = new Set(tasks.map((task) => task.id));
  if (snapshot.tasks.some((task) => taskIds.has(task.id))) return null;

  const restoredTasks = snapshot.linkageVersion === 1
    ? snapshot.tasks
    : snapshot.tasks.map((task) => ({ ...task, goalNodeId: undefined, stepSlice: undefined }));

  let nextGoals: GoalNode[];
  if (snapshot.parentNodeId && findGoal(goals, snapshot.parentNodeId)) {
    nextGoals = goals.map((root) =>
      updateNode(root, snapshot.parentNodeId!, (parent) => ({
        ...parent, children: [...parent.children, snapshot.node],
      })),
    );
  } else if (snapshot.parentRootId && goals.some((root) => root.id === snapshot.parentRootId)) {
    nextGoals = goals.map((root) => root.id === snapshot.parentRootId
      ? { ...root, children: [...root.children, snapshot.node] }
      : root);
  } else {
    nextGoals = [...goals, snapshot.node];
  }
  return { goals: nextGoals.map(recomputeCompleted), tasks: [...tasks, ...restoredTasks] };
}
