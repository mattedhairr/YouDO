import type { GoalNode, Task, TaskSession } from '../types';
import { collectDescendantIds } from './goalTree';
import { sanitizeSessionHistory } from './sessionStats';

export type TrashRecord = {
  id: string;
  node: GoalNode;
  deletedAt: number;
  parentRootId: string | null;
  parentNodeId?: string | null;
  tasks: Task[];
};

export type WorkspaceSlice = {
  tasks: Task[];
  goals: GoalNode[];
  sessionHistory: Record<string, TaskSession[]>;
  recentlyDeletedGoals: TrashRecord[];
  updatedAt?: number;
};

function deletedNodeIds(trash: TrashRecord[]): Set<string> {
  const ids = new Set<string>();
  for (const row of trash) {
    if (!row?.node) continue;
    for (const id of collectDescendantIds(row.node)) ids.add(id);
  }
  return ids;
}

function mergeTrash(local: TrashRecord[], remote: TrashRecord[]): TrashRecord[] {
  const byId = new Map<string, TrashRecord>();
  for (const row of [...remote, ...local]) {
    if (!row?.id || !row.node) continue;
    const prev = byId.get(row.id);
    if (!prev || row.deletedAt >= prev.deletedAt) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, 20);
}

function dropDeletedGoals(nodes: GoalNode[], deleted: Set<string>): GoalNode[] {
  return nodes
    .filter((n) => !deleted.has(n.id))
    .map((n) => ({ ...n, children: dropDeletedGoals(n.children ?? [], deleted) }));
}

/** Legacy backups with no updatedAt: keep local overlapping nodes as-is, append remote-only. */
function unionGoalList(local: GoalNode[], remote: GoalNode[]): GoalNode[] {
  const localIds = new Set(local.filter((n) => n?.id).map((n) => n.id));
  const result = local.filter((n) => n?.id);
  for (const remoteNode of remote) {
    if (!remoteNode?.id || localIds.has(remoteNode.id)) continue;
    result.push(remoteNode);
  }
  return result.map((n) => ({
    ...n,
    children: unionGoalList(n.children ?? [], remote.find((r) => r.id === n.id)?.children ?? []),
  }));
}

function unionTasks(local: Task[], remote: Task[]): Task[] {
  const byId = new Map<string, Task>();
  const order: string[] = [];
  for (const t of [...local, ...remote]) {
    if (!t?.id) continue;
    if (!byId.has(t.id)) {
      order.push(t.id);
      byId.set(t.id, t);
    }
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

export function mergeSessionHistories(
  local: unknown,
  remote: unknown,
): Record<string, TaskSession[]> {
  const a = sanitizeSessionHistory(local);
  const b = sanitizeSessionHistory(remote);
  const taskIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, TaskSession[]> = {};
  for (const taskId of taskIds) {
    const byId = new Map<string, TaskSession>();
    for (const row of [...(b[taskId] ?? []), ...(a[taskId] ?? [])]) {
      byId.set(row.id, row);
    }
    const rows = [...byId.values()].sort((x, y) => x.startTime - y.startTime);
    if (rows.length) out[taskId] = rows;
  }
  return out;
}

/**
 * Sessions: union by id.
 * Deletes: union trash, then drop those nodes.
 * Goals + tasks: last-write-wins by updatedAt. Never OR completion flags.
 */
export function mergeWorkspace(local: WorkspaceSlice, remote: WorkspaceSlice): WorkspaceSlice {
  const trash = mergeTrash(local.recentlyDeletedGoals ?? [], remote.recentlyDeletedGoals ?? []);
  const deleted = deletedNodeIds(trash);
  const sessionHistory = mergeSessionHistories(local.sessionHistory, remote.sessionHistory);

  const localAt = local.updatedAt ?? 0;
  const remoteAt = remote.updatedAt ?? 0;
  let goals: GoalNode[];
  let tasks: Task[];

  if (localAt > 0 || remoteAt > 0) {
    const tree = localAt >= remoteAt ? local : remote;
    goals = tree.goals ?? [];
    tasks = tree.tasks ?? [];
  } else {
    goals = unionGoalList(local.goals ?? [], remote.goals ?? []);
    tasks = unionTasks(local.tasks ?? [], remote.tasks ?? []);
  }

  return {
    tasks: tasks.filter((t) => !t.goalNodeId || !deleted.has(t.goalNodeId)),
    goals: dropDeletedGoals(goals, deleted),
    sessionHistory,
    recentlyDeletedGoals: trash,
    updatedAt: Math.max(localAt, remoteAt),
  };
}

export function workspaceSignature(
  slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals'>,
): string {
  return JSON.stringify({
    tasks: slice.tasks,
    goals: slice.goals,
    sessionHistory: slice.sessionHistory,
    recentlyDeletedGoals: slice.recentlyDeletedGoals,
  });
}
