import type { GoalNode, Task, TaskSession } from '../types';
import { recomputeCompleted } from './goalTree';
import { sanitizeSessionHistory } from './sessionStats';
import { mergeStreakMeta } from './focusTrends';
import { mergePacePrefs } from './paceBoard';
import { markerMatches, sortDeletionLedger, stableContent, type DeletionMarker } from './deletionLedger';
import type { TrashRecord, WorkspaceSlice } from './syncMerge';

/**
 * Three-way workspace merge. Each device's copy is compared with the copy both
 * devices last agreed on (the base), so a change made on only one device is
 * simply taken. With no base every difference counts as a clash, which still
 * resolves without throwing.
 *
 * Progress is never lost: a step ticked on either device stays ticked, a
 * card's progress keeps the higher count, sittings are kept from both copies,
 * and an item edited on one device but deleted on the other is kept. Any other
 * detail changed differently on both devices takes the newer device's value;
 * the caller saves both original copies as restore points first.
 */
export type ThreeWayMerge = {
  slice: WorkspaceSlice;
  /** Titles of items where the same detail changed on both devices (newer kept). */
  clashes: string[];
  /** Titles of items deleted on one device but kept because the other changed them. */
  kept: string[];
};

type FlatGoal = { node: Omit<GoalNode, 'children'>; parentId: string | null; index: number };

const same = (a: unknown, b: unknown) => stableContent(a ?? null) === stableContent(b ?? null);

function flattenGoals(goals: GoalNode[]): Map<string, FlatGoal> {
  const map = new Map<string, FlatGoal>();
  const visit = (nodes: GoalNode[], parentId: string | null) => {
    nodes.forEach((node, index) => {
      if (!node?.id || map.has(node.id)) return;
      const { children, ...rest } = node;
      map.set(node.id, { node: rest, parentId, index });
      visit(children ?? [], node.id);
    });
  };
  visit(goals ?? [], null);
  return map;
}

/** Classic three-way pick; `clash` runs only when both sides changed differently. */
function pick<T>(hasBase: boolean, base: T | undefined, local: T | undefined, remote: T | undefined, clash: () => T | undefined): T | undefined {
  if (same(local, remote)) return local;
  if (hasBase && same(base, local)) return remote;
  if (hasBase && same(base, remote)) return local;
  return clash();
}

/** Done state keyed by step label (and its occurrence), so renamed or added steps keep ticks. */
function doneByLabel(steps: string[] | undefined, done: boolean[] | undefined): Map<string, boolean> {
  const map = new Map<string, boolean>();
  const seen = new Map<string, number>();
  (steps ?? []).forEach((label, i) => {
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    map.set(`${n}:${label}`, Boolean(done?.[i]));
  });
  return map;
}

type StepFields = Pick<GoalNode, 'steps' | 'stepDone'>;

function mergeSteps(
  hasBase: boolean,
  base: StepFields | undefined,
  local: StepFields,
  remote: StepFields,
  localNewer: boolean,
): { steps?: string[]; stepDone?: boolean[]; clash: boolean } {
  let clash = false;
  const steps = pick(hasBase, base?.steps, local.steps, remote.steps, () => {
    clash = true;
    return localNewer ? local.steps : remote.steps;
  });
  if (!steps) return { clash };
  const b = doneByLabel(base?.steps, base?.stepDone);
  const l = doneByLabel(local.steps, local.stepDone);
  const r = doneByLabel(remote.steps, remote.stepDone);
  const seen = new Map<string, number>();
  const stepDone = steps.map((label) => {
    const n = seen.get(label) ?? 0;
    seen.set(label, n + 1);
    const key = `${n}:${label}`;
    // A tick on either device survives a clash: sync never undoes progress.
    return Boolean(pick(hasBase && b.has(key), b.get(key), l.get(key), r.get(key), () => Boolean(l.get(key)) || Boolean(r.get(key))));
  });
  return { steps, stepDone, clash };
}

function mergeGoalFields(base: FlatGoal | undefined, local: FlatGoal, remote: FlatGoal, localNewer: boolean): { flat: FlatGoal; clash: boolean } {
  const hasBase = Boolean(base);
  let clash = false;
  const node: Record<string, unknown> = {};
  const b = base?.node as Record<string, unknown> | undefined;
  const l = local.node as Record<string, unknown>;
  const r = remote.node as Record<string, unknown>;
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (key === 'steps' || key === 'stepDone') continue;
    node[key] = pick(hasBase, b?.[key], l[key], r[key], () => {
      if (key === 'completed') return Boolean(l[key]) || Boolean(r[key]);
      clash = true;
      return localNewer ? l[key] : r[key];
    });
  }
  const steps = mergeSteps(hasBase, base?.node, local.node, remote.node, localNewer);
  if (steps.clash) clash = true;
  node.steps = steps.steps;
  node.stepDone = steps.stepDone;
  for (const key of Object.keys(node)) if (node[key] === undefined) delete node[key];
  const parentId = pick(hasBase, base?.parentId, local.parentId, remote.parentId, () => {
    clash = true;
    return localNewer ? local.parentId : remote.parentId;
  }) ?? null;
  return { flat: { node: node as Omit<GoalNode, 'children'>, parentId, index: localNewer ? local.index : remote.index }, clash };
}

const unionDates = (a?: string[], b?: string[]) => {
  const all = [...new Set([...(a ?? []), ...(b ?? [])])].sort();
  return all.length ? all : undefined;
};

function mergeTaskFields(base: Task | undefined, local: Task, remote: Task, localNewer: boolean): { task: Task; clash: boolean } {
  const hasBase = Boolean(base);
  let clash = false;
  const out: Record<string, unknown> = {};
  const b = base as unknown as Record<string, unknown> | undefined;
  const l = local as unknown as Record<string, unknown>;
  const r = remote as unknown as Record<string, unknown>;
  for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) {
    if (key === 'pastFailedNativeDates' || key === 'pastFailedBacklogDates') {
      out[key] = unionDates(l[key] as string[] | undefined, r[key] as string[] | undefined);
      continue;
    }
    out[key] = pick(hasBase, b?.[key], l[key], r[key], () => {
      // Progress keeps the higher count: a card never steps backwards in a merge.
      if (key === 'progress') return Math.max(Number(l[key]) || 0, Number(r[key]) || 0);
      clash = true;
      return localNewer ? l[key] : r[key];
    });
  }
  for (const key of Object.keys(out)) if (out[key] === undefined) delete out[key];
  return { task: out as unknown as Task, clash };
}

/** True when `side` deleted this item and it has not changed since. */
function deletedUnchanged(side: WorkspaceSlice, id: string, kind: 'goal' | 'task', live: GoalNode | Task, liveFlat?: FlatGoal): boolean {
  const marker = (side.deletionLedger ?? []).find((m) => m.kind === kind && m.id === id);
  if (marker) return markerMatches(marker, live);
  for (const record of side.recentlyDeletedGoals ?? []) {
    if (!record?.node) continue;
    if (kind === 'task') {
      const saved = (record.tasks ?? []).find((t) => t.id === id);
      if (saved) return same(saved, live);
      continue;
    }
    const saved = flattenGoals([record.node]).get(id);
    if (saved && liveFlat) return same(saved.node, liveFlat.node);
  }
  return false;
}

function mergeSessions(local: unknown, remote: unknown, localNewer: boolean): Record<string, TaskSession[]> {
  const byId = new Map<string, TaskSession>();
  const histories = localNewer ? [sanitizeSessionHistory(remote), sanitizeSessionHistory(local)] : [sanitizeSessionHistory(local), sanitizeSessionHistory(remote)];
  for (const history of histories) {
    for (const rows of Object.values(history)) {
      for (const row of rows) {
        const prior = byId.get(row.id);
        // A sitting that differs between copies keeps the longer record of work.
        if (!prior || (row.netFocusMs ?? 0) >= (prior.netFocusMs ?? 0)) byId.set(row.id, row);
      }
    }
  }
  const out: Record<string, TaskSession[]> = {};
  for (const row of byId.values()) (out[row.taskId] ??= []).push(row);
  for (const rows of Object.values(out)) rows.sort((x, y) => x.startTime - y.startTime);
  return out;
}

function mergeLedgers(local: DeletionMarker[], remote: DeletionMarker[]): DeletionMarker[] {
  const byKey = new Map<string, DeletionMarker>();
  for (const marker of [...local, ...remote]) {
    const key = `${marker.kind}:${marker.id}`;
    const prior = byKey.get(key);
    if (!prior || marker.deletedAt > prior.deletedAt) byKey.set(key, marker);
  }
  return sortDeletionLedger([...byKey.values()]);
}

export function mergeWorkspaceThreeWay(base: WorkspaceSlice | null, local: WorkspaceSlice, remote: WorkspaceSlice, now = Date.now()): ThreeWayMerge {
  const localNewer = (local.updatedAt ?? 0) >= (remote.updatedAt ?? 0);
  const clashes = new Set<string>();
  const kept = new Set<string>();

  // ── Goals: decide each item, then rebuild the tree. ──
  const bGoals = base ? flattenGoals(base.goals) : new Map<string, FlatGoal>();
  const lGoals = flattenGoals(local.goals);
  const rGoals = flattenGoals(remote.goals);
  const goals = new Map<string, FlatGoal>();
  for (const id of new Set([...lGoals.keys(), ...rGoals.keys()])) {
    const b = bGoals.get(id);
    const l = lGoals.get(id);
    const r = rGoals.get(id);
    if (l && r) {
      const merged = mergeGoalFields(b, l, r, localNewer);
      if (merged.clash) clashes.add(merged.flat.node.title);
      goals.set(id, merged.flat);
      continue;
    }
    const present = (l ?? r)!;
    const other = l ? remote : local;
    // Present on one copy: added there, or deleted on the other. Deleted wins
    // only when the surviving copy has not changed since.
    const deleted = b
      ? same(b.node, present.node) && same(b.parentId, present.parentId)
      : deletedUnchanged(other, id, 'goal', { ...present.node, children: [] } as GoalNode, present);
    if (deleted) continue;
    if (b || other.deletionLedger?.some((m) => m.kind === 'goal' && m.id === id)) kept.add(present.node.title);
    goals.set(id, { ...present });
  }

  // ── Tasks ──
  const byId = (list: Task[] | undefined) => new Map((list ?? []).filter((t) => t?.id).map((t) => [t.id, t]));
  const bTasks = byId(base?.tasks);
  const lTasks = byId(local.tasks);
  const rTasks = byId(remote.tasks);
  const tasks = new Map<string, Task>();
  for (const id of new Set([...lTasks.keys(), ...rTasks.keys()])) {
    const b = bTasks.get(id);
    const l = lTasks.get(id);
    const r = rTasks.get(id);
    if (l && r) {
      const merged = mergeTaskFields(b, l, r, localNewer);
      if (merged.clash) clashes.add(merged.task.title);
      tasks.set(id, merged.task);
      continue;
    }
    const present = (l ?? r)!;
    const other = l ? remote : local;
    if (b ? same(b, present) : deletedUnchanged(other, id, 'task', present)) continue;
    if (b || other.deletionLedger?.some((m) => m.kind === 'task' && m.id === id)) kept.add(present.title);
    tasks.set(id, present);
  }

  // A kept card keeps its goal, and a kept goal its parents, so nothing dangles.
  const restore = (start: string | null | undefined) => {
    let cursor = start ?? null;
    const guard = new Set<string>();
    while (cursor && !goals.has(cursor) && !guard.has(cursor)) {
      guard.add(cursor);
      const source = lGoals.get(cursor) ?? rGoals.get(cursor) ?? bGoals.get(cursor);
      if (!source) return;
      goals.set(cursor, { ...source });
      kept.add(source.node.title);
      cursor = source.parentId;
    }
  };
  for (const task of tasks.values()) restore(task.goalNodeId);
  for (const flat of [...goals.values()]) restore(flat.parentId);

  // Moves on both devices could form a loop; such an item goes where the newer
  // device put it, or to the top level.
  const primary = localNewer ? lGoals : rGoals;
  const secondary = localNewer ? rGoals : lGoals;
  for (const [id, flat] of goals) {
    const seen = new Set([id]);
    let cursor = flat.parentId;
    while (cursor) {
      if (seen.has(cursor)) {
        const fallback = primary.get(id)?.parentId ?? null;
        flat.parentId = fallback && fallback !== id && goals.has(fallback) && goals.get(fallback)!.parentId !== id ? fallback : null;
        break;
      }
      seen.add(cursor);
      cursor = goals.get(cursor)?.parentId ?? null;
    }
    if (flat.parentId && !goals.has(flat.parentId)) flat.parentId = null;
  }

  const childrenOf = new Map<string | null, string[]>();
  for (const [id, flat] of goals) childrenOf.set(flat.parentId, [...(childrenOf.get(flat.parentId) ?? []), id]);
  // Children keep the newer device's order; the other device's additions follow.
  const orderKey = (id: string, parentId: string | null): [number, number] => {
    const p = primary.get(id);
    if (p && p.parentId === parentId) return [0, p.index];
    return [1, secondary.get(id)?.index ?? goals.get(id)!.index];
  };
  const build = (parentId: string | null): GoalNode[] => [...(childrenOf.get(parentId) ?? [])]
    .sort((x, y) => {
      const [ax, ai] = orderKey(x, parentId);
      const [bx, bi] = orderKey(y, parentId);
      return ax - bx || ai - bi;
    })
    .map((id) => ({ ...goals.get(id)!.node, children: build(id) }) as GoalNode);
  const mergedGoals = build(null).map(recomputeCompleted);

  const order = [...((localNewer ? local.tasks : remote.tasks) ?? []), ...((localNewer ? remote.tasks : local.tasks) ?? [])]
    .map((t) => t?.id)
    .filter((id): id is string => Boolean(id));
  const mergedTasks = [...new Set(order)].map((id) => tasks.get(id)).filter((t): t is Task => Boolean(t));

  // Deletion records must not name anything alive in the result.
  const deletionLedger = mergeLedgers(local.deletionLedger ?? [], remote.deletionLedger ?? [])
    .filter((m) => (m.kind === 'goal' ? !goals.has(m.id) : !tasks.has(m.id)));
  const trash = new Map<string, TrashRecord>();
  for (const row of [...(remote.recentlyDeletedGoals ?? []), ...(local.recentlyDeletedGoals ?? [])]) {
    if (!row?.id || !row.node || goals.has(row.node.id)) continue;
    const prior = trash.get(row.id);
    if (!prior || row.deletedAt >= prior.deletedAt) trash.set(row.id, row);
  }

  return {
    slice: {
      tasks: mergedTasks,
      goals: mergedGoals,
      sessionHistory: mergeSessions(local.sessionHistory, remote.sessionHistory, localNewer),
      recentlyDeletedGoals: [...trash.values()].sort((a, b) => b.deletedAt - a.deletedAt).slice(0, 20),
      deletionLedger,
      streakMeta: mergeStreakMeta(
        local.streakMeta ?? { bestStreak: 0, barHours: 1, barEffectiveFrom: '1970-01-01', revive: null, updatedAt: 0 },
        remote.streakMeta,
      ),
      pacePrefs: mergePacePrefs(
        local.pacePrefs ?? { optedIn: false, displayName: '', examLabel: '', updatedAt: 0 },
        remote.pacePrefs,
      ),
      updatedAt: Math.max(now, local.updatedAt ?? 0, remote.updatedAt ?? 0),
    },
    clashes: [...clashes],
    kept: [...kept],
  };
}
