import type { GoalNode, Task, TaskSession } from '../types';
import { collectDescendantIds } from './goalTree';
import { sanitizeSessionHistory } from './sessionStats';

export type TrashRecord = {
  id: string;
  node: GoalNode;
  deletedAt: number;
  parentRootId: string | null;
  tasks: Task[];
};

export type WorkspaceSlice = {
  tasks: Task[];
  goals: GoalNode[];
  sessionHistory: Record<string, TaskSession[]>;
  recentlyDeletedGoals: TrashRecord[];
};

function unionIds(a?: string[], b?: string[]): string[] | undefined {
  const set = new Set([...(a ?? []), ...(b ?? [])].filter(Boolean));
  return set.size ? [...set] : undefined;
}

function orBools(a?: boolean[], b?: boolean[]): boolean[] | undefined {
  const len = Math.max(a?.length ?? 0, b?.length ?? 0);
  if (len === 0) return a ?? b;
  return Array.from({ length: len }, (_, i) => Boolean(a?.[i] || b?.[i]));
}

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

function mergeNode(remote: GoalNode, local: GoalNode): GoalNode {
  const stepDone = orBools(remote.stepDone, local.stepDone);
  const steps = (local.steps?.length ?? 0) >= (remote.steps?.length ?? 0) ? local.steps ?? remote.steps : remote.steps;
  return {
    ...remote,
    ...local,
    title: local.title || remote.title,
    description: local.description || remote.description,
    steps,
    stepDone,
    completed: Boolean(local.completed || remote.completed || stepDone?.every(Boolean)),
    pinned: Boolean(local.pinned || remote.pinned),
    children: mergeGoalList(local.children ?? [], remote.children ?? []),
  };
}

function mergeGoalList(local: GoalNode[], remote: GoalNode[]): GoalNode[] {
  // Build a lookup of remote nodes for O(1) access
  const remoteById = new Map<string, GoalNode>();
  for (const node of remote) {
    if (node?.id) remoteById.set(node.id, node);
  }

  // Track which IDs exist locally so we know what remote nodes are "new"
  const localIds = new Set(local.filter((n) => n?.id).map((n) => n.id));
  const result: GoalNode[] = [];

  // 1. Process local nodes IN LOCAL ORDER, merging data with remote counterpart when both exist.
  //    This ensures the user's intentional ordering on the current device is preserved.
  for (const localNode of local) {
    if (!localNode?.id) continue;
    const remoteNode = remoteById.get(localNode.id);
    if (remoteNode) {
      // Both sides have this node — merge with local taking precedence
      result.push(mergeNode(remoteNode, localNode));
    } else {
      // Local-only node (deleted on the other device but still in trash? Keep it)
      result.push(localNode);
    }
  }

  // 2. Append remote-only nodes (added on another device) at the end.
  for (const remoteNode of remote) {
    if (!remoteNode?.id || localIds.has(remoteNode.id)) continue;
    result.push(remoteNode);
  }

  return result;
}

function dropDeletedGoals(nodes: GoalNode[], deleted: Set<string>): GoalNode[] {
  return nodes
    .filter((n) => !deleted.has(n.id))
    .map((n) => ({ ...n, children: dropDeletedGoals(n.children ?? [], deleted) }));
}

export function mergeTasks(local: Task[], remote: Task[]): Task[] {
  const byId = new Map<string, Task>();
  const order: string[] = [];
  const ingest = (list: Task[], isLocal: boolean) => {
    for (const t of list) {
      if (!t?.id) continue;
      const prev = byId.get(t.id);
      if (!prev) {
        order.push(t.id);
        byId.set(t.id, t);
        continue;
      }
      const a = isLocal ? t : prev;
      const b = isLocal ? prev : t;
      byId.set(t.id, {
        ...b,
        ...a,
        title: a.title || b.title,
        progress: Math.max(a.progress ?? 0, b.progress ?? 0),
        pastFailedNativeDates: unionIds(a.pastFailedNativeDates, b.pastFailedNativeDates),
        pastFailedBacklogDates: unionIds(a.pastFailedBacklogDates, b.pastFailedBacklogDates),
        goalNodeId: a.goalNodeId || b.goalNodeId,
      });
    }
  };
  ingest(remote, false);
  ingest(local, true);
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

export function mergeWorkspace(local: WorkspaceSlice, remote: WorkspaceSlice): WorkspaceSlice {
  const trash = mergeTrash(local.recentlyDeletedGoals ?? [], remote.recentlyDeletedGoals ?? []);
  const deleted = deletedNodeIds(trash);
  const goals = dropDeletedGoals(mergeGoalList(local.goals ?? [], remote.goals ?? []), deleted);
  const tasks = mergeTasks(local.tasks ?? [], remote.tasks ?? []).filter(
    (t) => !t.goalNodeId || !deleted.has(t.goalNodeId),
  );
  return {
    tasks,
    goals,
    sessionHistory: mergeSessionHistories(local.sessionHistory, remote.sessionHistory),
    recentlyDeletedGoals: trash,
  };
}

export function workspaceSignature(slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals'>): string {
  return JSON.stringify({
    tasks: slice.tasks,
    goals: slice.goals,
    sessionHistory: slice.sessionHistory,
    recentlyDeletedGoals: slice.recentlyDeletedGoals,
  });
}
