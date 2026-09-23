import type { GoalNode, Task, TaskSession } from '../types';
import { collectDescendantIds } from './goalTree';
import { sanitizeSessionHistory } from './sessionStats';
import { mergeStreakMeta, type StreakMeta } from './focusTrends';
import { mergePacePrefs, type PacePrefs } from './paceBoard';
import { mergeDeletionLedgers, markerMatches, stableContent, type DeletionMarker } from './deletionLedger';

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
  deletionLedger?: DeletionMarker[];
  streakMeta?: StreakMeta | null;
  pacePrefs?: PacePrefs | null;
  updatedAt?: number;
};

function matchingNodeContent(a: GoalNode, b: GoalNode): boolean {
  const fields = (node: GoalNode) => Object.fromEntries(Object.entries(node).filter(([key]) => key !== 'children'));
  return stableContent(fields(a)) === stableContent(fields(b));
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

function dropDeletedGoals(nodes: GoalNode[], deleted: Set<string>): GoalNode[] {
  return nodes
    .filter((n) => !deleted.has(n.id))
    .map((n) => ({ ...n, children: dropDeletedGoals(n.children ?? [], deleted) }));
}

/** Legacy backups with no updatedAt: keep local overlapping nodes as-is, append remote-only. */
function unionGoalList(local: GoalNode[], remote: GoalNode[]): GoalNode[] {
  const remoteById = new Map(remote.filter((n) => n?.id).map((n) => [n.id, n]));
  const localIds = new Set(local.filter((n) => n?.id).map((n) => n.id));
  const result = local.filter((n) => n?.id);
  for (const localNode of result) {
    const remoteNode = remoteById.get(localNode.id);
    if (!remoteNode) throw new Error(`Cannot safely combine goal “${localNode.title}”: it exists on only one copy. Review both copies; neither was replaced.`);
    if (remoteNode && !matchingNodeContent(localNode, remoteNode)) {
      throw new Error(`Cannot safely combine goal “${localNode.title}”: its details differ between copies. Neither copy was replaced.`);
    }
  }
  for (const remoteNode of remote) {
    if (!remoteNode?.id || localIds.has(remoteNode.id)) continue;
    throw new Error(`Cannot safely combine goal “${remoteNode.title}”: it exists on only one copy. Review both copies; neither was replaced.`);
  }
  return result.map((n) => ({
    ...n,
    children: unionGoalList(n.children ?? [], remote.find((r) => r.id === n.id)?.children ?? []),
  }));
}

function unionTasks(local: Task[], remote: Task[]): Task[] {
  const byId = new Map<string, Task>();
  const localIds = new Set(local.filter(t => t?.id).map(t => t.id));
  const remoteIds = new Set(remote.filter(t => t?.id).map(t => t.id));
  for (const task of local) if (task?.id && !remoteIds.has(task.id)) {
    throw new Error(`Cannot safely combine task “${task.title}”: it exists on only one copy. Neither copy was replaced.`);
  }
  for (const task of remote) if (task?.id && !localIds.has(task.id)) {
    throw new Error(`Cannot safely combine task “${task.title}”: it exists on only one copy. Neither copy was replaced.`);
  }
  for (const t of [...local, ...remote]) {
    if (!t?.id) continue;
    const existing = byId.get(t.id);
    if (existing && stableContent(existing) !== stableContent(t)) {
      throw new Error(`Cannot safely combine task “${t.title}”: it differs between copies. Neither copy was replaced.`);
    }
    if (!existing) byId.set(t.id, t);
  }
  return local.map((task) => byId.get(task.id)!).filter(Boolean);
}

function findGoalNode(nodes: GoalNode[], id: string): GoalNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findGoalNode(node.children ?? [], id);
    if (child) return child;
  }
  return null;
}

function assertNoEditedDeletedBranches(deleting: WorkspaceSlice, other: WorkspaceSlice): void {
  for (const record of deleting.recentlyDeletedGoals ?? []) {
    if (!record?.node) continue;
    const current = findGoalNode(other.goals ?? [], record.node.id);
    if (!current) continue;
    if (stableContent(current) !== stableContent(record.node)) {
      throw new Error(`Goal “${record.node.title}” was deleted on one device and edited on another. Cannot safely combine; neither copy was replaced.`);
    }
    const deletedIds = deletedNodeIds([record]);
    const savedTasks = new Map((record.tasks ?? []).map(task => [task.id, task]));
    for (const task of other.tasks ?? []) {
      if (!task.goalNodeId || !deletedIds.has(task.goalNodeId)) continue;
      const previous = savedTasks.get(task.id);
      if (!previous || stableContent(task) !== stableContent(previous)) {
        throw new Error(`Task “${task.title}” belongs to a deleted goal and changed on another device. Cannot safely combine; neither copy was replaced.`);
      }
    }
  }
}

function mergeGoalLists(primary: GoalNode[], secondary: GoalNode[]): GoalNode[] {
  const secondaryById = new Map(secondary.filter((node) => node?.id).map((node) => [node.id, node]));
  const primaryIds = new Set(primary.filter((node) => node?.id).map((node) => node.id));
  const merged = primary
    .filter((node) => node?.id)
    .map((node) => {
      const older = secondaryById.get(node.id);
      if (!older) throw new Error(`Cannot safely combine goal “${node.title}”: it exists on only one copy. Review both copies; neither was replaced.`);
      if (!matchingNodeContent(node, older)) {
        throw new Error(`Cannot safely combine goal “${node.title}”: its details changed on both copies. Review the copies; neither was replaced.`);
      }
      return {
        ...node,
        children: mergeGoalLists(node.children ?? [], older.children ?? []),
      };
    });
  for (const node of secondary) {
    if (!node?.id || primaryIds.has(node.id)) continue;
    throw new Error(`Cannot safely combine goal “${node.title}”: it exists on only one copy. Review both copies; neither was replaced.`);
  }
  return merged;
}

export function mergeSessionHistories(
  local: unknown,
  remote: unknown,
): Record<string, TaskSession[]> {
  const a = sanitizeSessionHistory(local);
  const b = sanitizeSessionHistory(remote);
  const taskIds = new Set([...Object.keys(a), ...Object.keys(b)]);
  const out: Record<string, TaskSession[]> = {};
  const seenSessionTask = new Map<string, string>();
  for (const taskId of taskIds) {
    const byId = new Map<string, TaskSession>();
    for (const row of [...(b[taskId] ?? []), ...(a[taskId] ?? [])]) {
      const previousTask = seenSessionTask.get(row.id);
      if (previousTask && previousTask !== taskId) {
        throw new Error(`Cannot safely combine session ${row.id}: it belongs to different tasks in the copies. Neither copy was replaced.`);
      }
      seenSessionTask.set(row.id, taskId);
      const existing = byId.get(row.id);
      if (existing && stableContent(existing) !== stableContent(row)) {
        throw new Error(`Cannot safely combine session ${row.id}: the copies disagree. Neither copy was replaced.`);
      }
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
 * Existing goal/task values: refuse differing same-ID values rather than discard edits.
 * One-sided goals/tasks are ambiguous without a durable deletion ledger, so
 * they require explicit review instead of being automatically resurrected.
 */
export function mergeWorkspace(local: WorkspaceSlice, remote: WorkspaceSlice): WorkspaceSlice {
  const deletionLedger = mergeDeletionLedgers(local.deletionLedger ?? [], remote.deletionLedger ?? []);
  for (const marker of deletionLedger) {
    for (const slice of [local, remote]) {
      const live = marker.kind === 'goal'
        ? findGoalNode(slice.goals ?? [], marker.id)
        : (slice.tasks ?? []).find(task => task.id === marker.id);
      if (live) {
        throw new Error(markerMatches(marker, live)
          ? `${marker.kind === 'goal' ? 'Goal' : 'Task'} “${live.title}” was deleted on one device but is present on another. It may have been restored; review both copies before combining. Neither copy was replaced.`
          : `${marker.kind === 'goal' ? 'Goal' : 'Task'} “${live.title}” was deleted on one device and edited on another. Cannot safely combine; neither copy was replaced.`);
      }
    }
  }
  assertNoEditedDeletedBranches(local, remote);
  assertNoEditedDeletedBranches(remote, local);
  const trash = mergeTrash(local.recentlyDeletedGoals ?? [], remote.recentlyDeletedGoals ?? []);
  const deleted = deletedNodeIds([...(local.recentlyDeletedGoals ?? []), ...(remote.recentlyDeletedGoals ?? [])]);
  const deletedTasks = new Set<string>();
  for (const marker of deletionLedger) {
    if (marker.kind === 'goal') deleted.add(marker.id);
    else deletedTasks.add(marker.id);
  }
  const sessionHistory = mergeSessionHistories(local.sessionHistory, remote.sessionHistory);

  const clean = (slice: WorkspaceSlice): WorkspaceSlice => ({
    ...slice,
    goals: dropDeletedGoals(slice.goals ?? [], deleted),
    tasks: (slice.tasks ?? []).filter(task => !deletedTasks.has(task.id) && (!task.goalNodeId || !deleted.has(task.goalNodeId))),
  });
  const localClean = clean(local);
  const remoteClean = clean(remote);

  const localAt = local.updatedAt ?? 0;
  const remoteAt = remote.updatedAt ?? 0;
  let goals: GoalNode[];
  let tasks: Task[];

  if (localAt > 0 || remoteAt > 0) {
    const primary = localAt >= remoteAt ? localClean : remoteClean;
    const secondary = primary === localClean ? remoteClean : localClean;
    goals = mergeGoalLists(primary.goals ?? [], secondary.goals ?? []);
    tasks = unionTasks(primary.tasks ?? [], secondary.tasks ?? []);
  } else {
    goals = unionGoalList(localClean.goals ?? [], remoteClean.goals ?? []);
    tasks = unionTasks(localClean.tasks ?? [], remoteClean.tasks ?? []);
  }

  return {
    tasks: tasks.filter((t) => !deletedTasks.has(t.id) && (!t.goalNodeId || !deleted.has(t.goalNodeId))),
    goals: dropDeletedGoals(goals, deleted),
    sessionHistory,
    recentlyDeletedGoals: trash,
    deletionLedger,
    streakMeta: mergeStreakMeta(
      local.streakMeta ?? {
        bestStreak: 0,
        barHours: 1,
        barEffectiveFrom: '1970-01-01',
        revive: null,
        updatedAt: 0,
      },
      remote.streakMeta,
    ),
    pacePrefs: mergePacePrefs(
      local.pacePrefs ?? { optedIn: false, displayName: '', examLabel: '', updatedAt: 0 },
      remote.pacePrefs,
    ),
    updatedAt: Math.max(localAt, remoteAt),
  };
}

export function workspaceSignature(
  slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals' | 'streakMeta' | 'pacePrefs' | 'deletionLedger'>,
): string {
  return JSON.stringify({
    tasks: slice.tasks,
    goals: slice.goals,
    sessionHistory: slice.sessionHistory,
    recentlyDeletedGoals: slice.recentlyDeletedGoals,
    ...(slice.deletionLedger?.length ? { deletionLedger: slice.deletionLedger } : {}),
    streakMeta: slice.streakMeta ?? null,
    pacePrefs: slice.pacePrefs ?? null,
  });
}

/** Compact deterministic identity used to detect edits on two devices without duplicating the backup in storage. */
export function workspaceFingerprint(
  slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals' | 'streakMeta' | 'pacePrefs' | 'deletionLedger'>,
): string {
  const value = workspaceSignature(slice);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `${value.length}:${hash.toString(16).padStart(16, '0')}`;
}
