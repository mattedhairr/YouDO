import type { GoalNode, Task } from '../types';

export type DeletionMarker = {
  kind: 'goal' | 'task';
  id: string;
  contentFingerprint: string;
  deletedAt: number;
};

type Items = { tasks: Task[]; goals: GoalNode[] };

export function stableContent(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableContent).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter(key => record[key] !== undefined).sort()
      .map(key => `${JSON.stringify(key)}:${stableContent(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function contentFingerprint(value: unknown): string {
  const content = stableContent(value);
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= BigInt(content.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `${content.length}:${hash.toString(16).padStart(16, '0')}`;
}

function goalMap(goals: GoalNode[]): Map<string, GoalNode> {
  const map = new Map<string, GoalNode>();
  const visit = (nodes: GoalNode[]) => {
    for (const node of nodes) {
      if (!node?.id) continue;
      map.set(node.id, node);
      visit(node.children ?? []);
    }
  };
  visit(goals);
  return map;
}

function markerKey(marker: Pick<DeletionMarker, 'kind' | 'id'>): string {
  return `${marker.kind}:${marker.id}`;
}

export function sortDeletionLedger(markers: DeletionMarker[]): DeletionMarker[] {
  return [...markers].sort((a, b) => markerKey(a).localeCompare(markerKey(b)));
}

export function isDeletionLedger(value: unknown): value is DeletionMarker[] {
  return Array.isArray(value) && value.every(marker => marker !== null && typeof marker === 'object'
    && (marker.kind === 'goal' || marker.kind === 'task')
    && typeof marker.id === 'string' && marker.id.length > 0
    && typeof marker.contentFingerprint === 'string' && /^\d+:[0-9a-f]{16}$/.test(marker.contentFingerprint)
    && Number.isFinite(marker.deletedAt) && marker.deletedAt >= 0);
}

export function markerMatches(marker: DeletionMarker, item: GoalNode | Task): boolean {
  return marker.contentFingerprint === contentFingerprint(item);
}

/** Store only compact fingerprints, not a second copy of deleted user content. */
export function advanceDeletionLedger(
  previous: DeletionMarker[], before: Items, after: Items, deletedAt: number,
): DeletionMarker[] {
  const markers = new Map(previous.map(marker => [markerKey(marker), marker]));
  const beforeGoals = goalMap(before.goals);
  const afterGoals = goalMap(after.goals);
  const afterTasks = new Set(after.tasks.map(task => task.id));

  for (const [id, node] of beforeGoals) {
    if (!afterGoals.has(id)) markers.set(`goal:${id}`, { kind: 'goal', id, contentFingerprint: contentFingerprint(node), deletedAt });
  }
  for (const id of afterGoals.keys()) markers.delete(`goal:${id}`);
  for (const task of before.tasks) {
    if (!afterTasks.has(task.id)) markers.set(`task:${task.id}`, { kind: 'task', id: task.id, contentFingerprint: contentFingerprint(task), deletedAt });
  }
  for (const id of afterTasks) markers.delete(`task:${id}`);
  return sortDeletionLedger([...markers.values()]);
}

export function mergeDeletionLedgers(local: DeletionMarker[], remote: DeletionMarker[]): DeletionMarker[] {
  const merged = new Map<string, DeletionMarker>();
  for (const marker of [...local, ...remote]) {
    const key = markerKey(marker);
    const prior = merged.get(key);
    if (prior && prior.contentFingerprint !== marker.contentFingerprint) {
      throw new Error(`Cannot safely combine deletion records for ${marker.kind} ${marker.id}. Neither copy was replaced.`);
    }
    if (!prior || marker.deletedAt > prior.deletedAt) merged.set(key, marker);
  }
  return sortDeletionLedger([...merged.values()]);
}
