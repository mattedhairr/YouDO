import type { GoalNode, Task, TaskSession } from '../types';
import { collectDescendantIds } from './goalTree';
import { sanitizeSessionHistory } from './sessionStats';
import { mergeStreakMeta, type StreakMeta } from './focusTrends';
import { mergePacePrefs, type PacePrefs } from './paceBoard';

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
  streakMeta?: StreakMeta | null;
  pacePrefs?: PacePrefs | null;
  updatedAt?: number;
};

function stableContent(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableContent).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${stableContent(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

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
    if (remoteNode && !matchingNodeContent(localNode, remoteNode)) {
      throw new Error(`Cannot safely combine goal “${localNode.title}”: its details differ between copies. Neither copy was replaced.`);
    }
  }
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
    const existing = byId.get(t.id);
    if (existing && stableContent(existing) !== stableContent(t)) {
      throw new Error(`Cannot safely combine task “${t.title}”: it differs between copies. Neither copy was replaced.`);
    }
    if (!byId.has(t.id)) {
      order.push(t.id);
      byId.set(t.id, t);
    }
  }
  return order.map((id) => byId.get(id)!).filter(Boolean);
}

function mergeGoalLists(primary: GoalNode[], secondary: GoalNode[]): GoalNode[] {
  const secondaryById = new Map(secondary.filter((node) => node?.id).map((node) => [node.id, node]));
  const primaryIds = new Set(primary.filter((node) => node?.id).map((node) => node.id));
  const merged = primary
    .filter((node) => node?.id)
    .map((node) => {
      const older = secondaryById.get(node.id);
      if (!older) return node;
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
    merged.push(node);
  }
  return merged;
}

function goalIdSet(nodes: GoalNode[]): Set<string> {
  const ids = new Set<string>();
  const visit = (items: GoalNode[]) => {
    for (const node of items) {
      if (!node?.id) continue;
      ids.add(node.id);
      visit(node.children ?? []);
    }
  };
  visit(nodes);
  return ids;
}

function keepTasksForRecoveredBranches(primary: WorkspaceSlice, secondary: WorkspaceSlice, goals: GoalNode[], deleted: Set<string>): Task[] {
  const result = [...(primary.tasks ?? [])];
  const taskIds = new Set(result.map((task) => task.id));
  const primaryGoalIds = goalIdSet(primary.goals ?? []);
  const mergedGoalIds = goalIdSet(goals);
  for (const task of secondary.tasks ?? []) {
    if (!task?.id || taskIds.has(task.id) || (task.goalNodeId && deleted.has(task.goalNodeId))) continue;
    if (task.goalNodeId && mergedGoalIds.has(task.goalNodeId) && !primaryGoalIds.has(task.goalNodeId)) {
      result.push(task);
      taskIds.add(task.id);
    } else {
      // Legacy backups have no per-task deletion markers. Absence could mean a
      // deletion OR independent work; neither silently dropping nor restoring it
      // is justified. Keep both copies unchanged for an explicit restore decision.
      throw new Error('YouDO cannot safely combine these copies because a task exists on only one device. Export both copies before choosing which workspace to keep. Nothing was replaced.');
    }
  }
  return result;
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
 * Branches that exist on only one device are retained unless a deletion tombstone removes them.
 */
export function mergeWorkspace(local: WorkspaceSlice, remote: WorkspaceSlice): WorkspaceSlice {
  const trash = mergeTrash(local.recentlyDeletedGoals ?? [], remote.recentlyDeletedGoals ?? []);
  const deleted = deletedNodeIds([...(local.recentlyDeletedGoals ?? []), ...(remote.recentlyDeletedGoals ?? [])]);
  const sessionHistory = mergeSessionHistories(local.sessionHistory, remote.sessionHistory);

  const localAt = local.updatedAt ?? 0;
  const remoteAt = remote.updatedAt ?? 0;
  let goals: GoalNode[];
  let tasks: Task[];

  if (localAt > 0 || remoteAt > 0) {
    const primary = localAt >= remoteAt ? local : remote;
    const secondary = primary === local ? remote : local;
    goals = mergeGoalLists(primary.goals ?? [], secondary.goals ?? []);
    const secondaryTasks = new Map((secondary.tasks ?? []).map(task => [task.id, task]));
    for (const task of primary.tasks ?? []) {
      const other = secondaryTasks.get(task.id);
      if (other && stableContent(task) !== stableContent(other)) {
        throw new Error(`Cannot safely combine task “${task.title}”: it differs between copies. Review the copies; neither was replaced.`);
      }
    }
    tasks = keepTasksForRecoveredBranches(primary, secondary, goals, deleted);
  } else {
    goals = unionGoalList(local.goals ?? [], remote.goals ?? []);
    tasks = unionTasks(local.tasks ?? [], remote.tasks ?? []);
  }

  return {
    tasks: tasks.filter((t) => !t.goalNodeId || !deleted.has(t.goalNodeId)),
    goals: dropDeletedGoals(goals, deleted),
    sessionHistory,
    recentlyDeletedGoals: trash,
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
  slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals' | 'streakMeta' | 'pacePrefs'>,
): string {
  return JSON.stringify({
    tasks: slice.tasks,
    goals: slice.goals,
    sessionHistory: slice.sessionHistory,
    recentlyDeletedGoals: slice.recentlyDeletedGoals,
    streakMeta: slice.streakMeta ?? null,
    pacePrefs: slice.pacePrefs ?? null,
  });
}

/** Compact deterministic identity used to detect edits on two devices without duplicating the backup in storage. */
export function workspaceFingerprint(
  slice: Pick<WorkspaceSlice, 'tasks' | 'goals' | 'sessionHistory' | 'recentlyDeletedGoals' | 'streakMeta' | 'pacePrefs'>,
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
