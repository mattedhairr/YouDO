import type { GoalKind, GoalNode, Task } from '../types';
import { uid } from './ids';

const VALID_KINDS = new Set(['goal', 'phase', 'section', 'task', 'sub', 'leaf']);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function parseCreatedAt(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return new Date(value).getTime() || Date.now();
  return Date.now();
}

export function normalizeImportedTask(raw: unknown): Task | null {
  const t = asRecord(raw);
  if (!t) return null;
  const title = asString(t.title || t.t).trim();
  if (!title) return null;

  const priority = t.priority === 'high' || t.priority === 'low' ? t.priority : 'medium';
  const steps = Array.isArray(t.steps) ? t.steps.map(String) : Array.isArray(t.s) ? t.s.map(String) : [];

  return {
    id: asString(t.id || t.i, uid('task')),
    title,
    description: asString(t.description),
    priority,
    targetDate: t.targetDate ? String(t.targetDate) : t.d ? String(t.d) : null,
    deadline: t.deadline ? String(t.deadline) : null,
    steps,
    progress: asNumber(t.progress, asNumber(t.p, 0)),
    createdAt: parseCreatedAt(t.createdAt),
    order: asNumber(t.order, Date.now()),
    goalNodeId: t.goalNodeId ? String(t.goalNodeId) : t.g ? String(t.g) : undefined,
    stepSlice: Array.isArray(t.stepSlice) ? t.stepSlice.map(Number) : undefined,
    originalTargetDate: t.originalTargetDate ? String(t.originalTargetDate) : undefined,
    // Validate date arrays so malformed backup data cannot corrupt backlog detection
    pastFailedNativeDates: Array.isArray(t.pastFailedNativeDates)
      ? t.pastFailedNativeDates.filter((d): d is string => typeof d === 'string')
      : undefined,
    pastFailedBacklogDates: Array.isArray(t.pastFailedBacklogDates)
      ? t.pastFailedBacklogDates.filter((d): d is string => typeof d === 'string')
      : undefined,
  };
}

export function normalizeImportedGoal(raw: unknown): GoalNode | null {
  const g = asRecord(raw);
  if (!g) return null;
  const title = asString(g.title || g.t).trim();
  if (!title) return null;

  const kindRaw = asString(g.kind || g.k, 'goal');
  const kind: GoalKind = VALID_KINDS.has(kindRaw) ? (kindRaw as GoalKind) : 'goal';
  const children: GoalNode[] = [];
  const rawChildren = Array.isArray(g.children) ? g.children : Array.isArray(g.c) ? g.c : [];
  for (const child of rawChildren) {
    const norm = normalizeImportedGoal(child);
    if (norm) children.push(norm);
  }

  return {
    id: asString(g.id || g.i, uid('n')),
    title,
    kind,
    description: g.description ? String(g.description) : undefined,
    startDate: g.startDate ? String(g.startDate) : undefined,
    endDate: g.endDate ? String(g.endDate) : undefined,
    children,
    steps: Array.isArray(g.steps) ? g.steps.map(String) : Array.isArray(g.s) ? g.s.map(String) : undefined,
    stepDone: Array.isArray(g.stepDone) ? g.stepDone.map(Boolean) : undefined,
    completed: Boolean(g.completed),
    todayTaskId: g.todayTaskId ? String(g.todayTaskId) : undefined,
    pinned: Boolean(g.pinned),
    createdAt: parseCreatedAt(g.createdAt),
  };
}

export function parseBackupPayload(jsonData: string): {
  tasks: Task[];
  goals: GoalNode[];
  sessionHistory?: unknown;
  recentlyDeletedGoals?: unknown;
  streakMeta?: unknown;
  pacePrefs?: unknown;
  updatedAt?: number;
} | null {
  try {
    const parsed = JSON.parse(jsonData) as unknown;
    const obj = asRecord(parsed);
    if (!obj) return null;

    const rawTasks = Array.isArray(obj.tasks) ? obj.tasks : Array.isArray(obj.t) ? obj.t : [];
    const importedTasks: Task[] = [];
    for (const t of rawTasks) {
      const norm = normalizeImportedTask(t);
      if (norm) importedTasks.push(norm);
    }

    const rawGoals = Array.isArray(obj.goals) ? obj.goals : Array.isArray(obj.g) ? obj.g : [];
    const importedGoals: GoalNode[] = [];
    for (const g of rawGoals) {
      const norm = normalizeImportedGoal(g);
      if (norm) importedGoals.push(norm);
    }

    const updatedAt = asNumber(obj.updatedAt, 0);

    return {
      tasks: importedTasks,
      goals: importedGoals,
      sessionHistory: obj.sessionHistory,
      recentlyDeletedGoals: obj.recentlyDeletedGoals,
      streakMeta: obj.streakMeta,
      pacePrefs: obj.pacePrefs,
      updatedAt: updatedAt > 0 ? updatedAt : undefined,
    };
  } catch {
    return null;
  }
}
