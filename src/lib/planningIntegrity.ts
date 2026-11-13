import type { GoalNode, Task, TaskSession } from '../types';
import { todayISO } from './dates';
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

/** The card a step plans onto: its linked one, or an unfinished card that lost its link. */
export function currentGoalPlan(tasks: Task[], node: GoalNode): Task | undefined {
  const linked = tasks.filter((task) => task.goalNodeId === node.id);
  const pointed = linked.find((task) => task.id === node.todayTaskId);
  if (pointed && !isTaskComplete(pointed)) return pointed;
  return linked.find((task) => !isTaskComplete(task)) ?? pointed;
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

export interface PlannedWork {
  goals: GoalNode[];
  tasks: Task[];
  sessionHistory: Record<string, TaskSession[]>;
}

/**
 * A Goal step has at most one unfinished dated card. Two devices that plan the
 * same step before they sync (or a step that lost its link) can leave two; they
 * become one: the step's current card (or the newest), keeping the other's
 * missed dates and focus sittings. `keepTaskId` (a running sitting) always stays.
 * Returns the same object when nothing needed fixing.
 */
export function collapseDuplicatePlans<T extends PlannedWork>(work: T, today = todayISO(), keepTaskId?: string | null): T {
  const pointers = new Map<string, string | null | undefined>();
  const visit = (node: GoalNode) => {
    pointers.set(node.id, node.todayTaskId);
    node.children?.forEach(visit);
  };
  work.goals.forEach(visit);

  const openByNode = new Map<string, Task[]>();
  for (const task of work.tasks) {
    if (!task.goalNodeId || !pointers.has(task.goalNodeId) || isTaskComplete(task)) continue;
    openByNode.set(task.goalNodeId, [...(openByNode.get(task.goalNodeId) ?? []), task]);
  }

  const replaced = new Map<string, Task>();
  const dropped = new Map<string, string>(); // dropped id -> kept id
  const repoint = new Map<string, string>(); // node id -> kept id
  for (const [nodeId, cards] of openByNode) {
    if (cards.length < 2) continue;
    const pointer = pointers.get(nodeId);
    const kept = cards.find((card) => card.id === keepTaskId)
      ?? cards.find((card) => card.id === pointer)
      ?? [...cards].sort((a, b) =>
        (b.targetDate ?? '').localeCompare(a.targetDate ?? '') || b.createdAt - a.createdAt)[0];
    const missed = new Set(kept.pastFailedNativeDates ?? []);
    const backlogMissed = new Set(kept.pastFailedBacklogDates ?? []);
    let resumeNote = kept.resumeNote;
    for (const card of cards) {
      if (card.id === kept.id) continue;
      dropped.set(card.id, kept.id);
      card.pastFailedNativeDates?.forEach((date) => missed.add(date));
      card.pastFailedBacklogDates?.forEach((date) => backlogMissed.add(date));
      const date = card.originalTargetDate || card.targetDate;
      if (date && date < today && date !== (kept.originalTargetDate || kept.targetDate)) missed.add(date);
      resumeNote ||= card.resumeNote;
    }
    replaced.set(kept.id, {
      ...kept,
      ...(missed.size ? { pastFailedNativeDates: [...missed].sort() } : {}),
      ...(backlogMissed.size ? { pastFailedBacklogDates: [...backlogMissed].sort() } : {}),
      ...(resumeNote ? { resumeNote } : {}),
    });
    if (pointer !== kept.id) repoint.set(nodeId, kept.id);
  }
  if (dropped.size === 0) return work;

  const tasks = work.tasks
    .filter((task) => !dropped.has(task.id))
    .map((task) => replaced.get(task.id) ?? task);
  let goals = work.goals;
  for (const [nodeId, taskId] of repoint) {
    goals = goals.map((root) => updateNode(root, nodeId, (node) => ({ ...node, todayTaskId: taskId })));
  }
  const sessionHistory = { ...work.sessionHistory };
  for (const [from, to] of dropped) {
    const moved = sessionHistory[from];
    if (!moved) continue;
    delete sessionHistory[from];
    const seen = new Set((sessionHistory[to] ?? []).map((session) => session.id));
    sessionHistory[to] = [
      ...(sessionHistory[to] ?? []),
      ...moved.filter((session) => !seen.has(session.id)).map((session) => ({ ...session, taskId: to })),
    ].sort((a, b) => a.startTime - b.startTime);
  }
  return { ...work, goals, tasks, sessionHistory };
}
