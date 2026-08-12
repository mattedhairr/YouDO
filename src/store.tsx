import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ActiveSession, GoalNode, Task, TaskSession } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { useAuth } from './contexts/AuthContext';

function uid(prefix = 'n') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36)}`;
}

function isToday(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDDMMYYYY(isoStr: string | null | undefined): string {
  if (!isoStr) return '';
  const parts = isoStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}-${m}-${y}`;
  }
  return isoStr;
}

/* ---------- Tree helpers ---------- */

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

let rollupCache = new Map<string, number>();

export function clearRollupCache() {
  rollupCache.clear();
}

export function rollupPct(node: GoalNode): number {
  if (rollupCache.has(node.id)) {
    return rollupCache.get(node.id)!;
  }
  let pct = 0;
  if (node.children.length === 0) {
    if (node.steps && node.steps.length > 0) {
      pct = Math.round(((node.stepDone ?? []).filter(Boolean).length / node.steps.length) * 100);
    } else {
      pct = node.completed ? 100 : 0;
    }
  } else {
    const total = node.children.length;
    if (total === 0) {
      pct = 0;
    } else {
      const doneCount = node.children.filter((c) => c.completed || rollupPct(c) === 100).length;
      pct = Math.round((doneCount / total) * 100);
    }
  }
  rollupCache.set(node.id, pct);
  return pct;
}

// Retain legacy aliases for compatibility
export const countLeaves = countDirectChildren;
export const countCompletedLeaves = countCompletedDirectChildren;

export function findNode(
  root: GoalNode,
  id: string,
): [GoalNode | null, GoalNode | null] {
  if (root.id === id) return [root, null];
  for (const child of root.children) {
    const [found, parent] = findNode(child, id);
    if (found) return [found, parent ?? root];
  }
  return [null, null];
}

export function updateNode(
  root: GoalNode,
  id: string,
  patch: (n: GoalNode) => GoalNode,
): GoalNode {
  if (root.id === id) return patch(root);
  return { ...root, children: root.children.map((c) => updateNode(c, id, patch)) };
}

export function removeNode(root: GoalNode, id: string): GoalNode {
  return {
    ...root,
    children: root.children
      .filter((c) => c.id !== id)
      .map((c) => removeNode(c, id)),
  };
}

export function removeNodes(root: GoalNode, ids: Set<string>): GoalNode {
  return {
    ...root,
    children: root.children
      .filter((c) => !ids.has(c.id))
      .map((c) => removeNodes(c, ids)),
  };
}

export function collectLeaves(node: GoalNode): GoalNode[] {
  if (node.children.length === 0) return [node];
  return node.children.flatMap(collectLeaves);
}

/** Recursively collect every todayTaskId in a node's subtree (including itself). */
export function collectDescendantTaskIds(node: GoalNode): string[] {
  const ids: string[] = [];
  if (node.todayTaskId) ids.push(node.todayTaskId);
  for (const child of node.children) {
    ids.push(...collectDescendantTaskIds(child));
  }
  return ids;
}

/**
 * Tree sanitizer pass:
 * 1. Ensures all GoalNodes have unique IDs (resolves duplicates if any imported or legacy state has them)
 * 2. Cleans stale todayTaskId pointers (pointers referencing task IDs that don't exist in tasks)
 */
export function sanitizeTreeAndTasks(goals: GoalNode[], tasks: Task[]): { cleanedGoals: GoalNode[]; cleanedTasks: Task[] } {
  const existingTaskIds = new Set(tasks.map((t) => t.id));
  const seenNodeIds = new Set<string>();

  function sanitizeNode(node: GoalNode): GoalNode {
    // 1. Resolve duplicate or missing IDs
    let id = node.id;
    if (!id || seenNodeIds.has(id)) {
      id = uid('goal');
    }
    seenNodeIds.add(id);

    // 2. Clean stale todayTaskId pointer
    let todayTaskId = node.todayTaskId;
    if (todayTaskId && !existingTaskIds.has(todayTaskId)) {
      todayTaskId = null;
    }

    const children = (node.children ?? []).map(sanitizeNode);
    return {
      ...node,
      id,
      todayTaskId,
      children,
    };
  }

  const cleanedGoals = (goals ?? []).map(sanitizeNode);
  return { cleanedGoals, cleanedTasks: tasks ?? [] };
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

function syncStepDone(
  node: GoalNode,
  taskProgress: number,
  slice: number[] | undefined,
): boolean[] {
  const steps = node.steps ?? [];
  const s = slice ?? steps.map((_, i) => i);
  const existing = node.stepDone ?? steps.map(() => false);
  const result = [...existing];
  s.forEach((masterIdx, slicePos) => {
    if (masterIdx < result.length) result[masterIdx] = slicePos < taskProgress;
  });
  return result;
}

function countSlicedDone(node: GoalNode, slice: number[] | undefined): number {
  const stepDone = node.stepDone ?? [];
  const s = slice ?? (node.steps ?? []).map((_, i) => i);
  return s.filter((idx) => stepDone[idx]).length;
}

/* ---------- Store ---------- */

/**
 * Canonical completion check used across Today, Calendar, and progress calculations.
 * A task with no steps is never automatically complete — it must be explicitly handled by the UI.
 */
export function isTaskComplete(task: { steps: string[]; progress: number }): boolean {
  const total = task.steps.length > 0 ? task.steps.length : 1;
  return task.progress >= total;
}

export function isBacklogTask(task: Task): boolean {
  if (!task.targetDate) return false;
  if (isTaskComplete(task)) return false;
  return task.targetDate < todayISO();
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

interface Store {
  tasks: Task[];
  goals: GoalNode[];
  addTask: (t: Task) => void;
  duplicateTask: (id: string) => void;
  advance: (id: string) => void;
  undo: (id: string) => void;
  removeTask: (id: string) => void;
  reorder: (fromId: string, toId: string) => void;

  addGoalRoot: (g: GoalNode) => void;
  addChildNode: (parentId: string, node: GoalNode) => void;
  updateGoalNode: (id: string, patch: (n: GoalNode) => GoalNode) => void;
  deleteGoalNode: (rootId: string, nodeId: string) => void;
  /** Delete multiple goal nodes at once */
  deleteGoalNodes: (nodeIds: string[]) => void;
  /** Reorder goal nodes at any level */
  reorderGoalNodes: (parentId: string | null, fromId: string, toId: string) => void;
  /** Move a goal node up or down */
  moveGoalNode: (parentId: string | null, nodeId: string, direction: 'up' | 'down') => void;
  /** Toggle completed status of any goal node (goal, phase, section, task, sub, leaf) */
  toggleNodeCompletion: (nodeId: string) => void;

  /** Plan a goal leaf to a specific date, optionally with a step slice */
  planTask: (nodeId: string, targetDate: string, stepSlice?: number[]) => void;
  /** Batch plan multiple leaves to the same date */
  planBatch: (nodeIds: string[], targetDate: string) => void;
  /** Remove a planned/daily task that is linked to a goal */
  unlinkTask: (taskId: string) => void;
  /** Toggle a step's done state directly in the goal view */
  toggleGoalStep: (nodeId: string, stepIdx: number) => void;
  /** Toggle pinned/favorite state of a goal node */
  togglePin: (nodeId: string) => void;
  /** Copy a goal node (and its subtree) into the clipboard */
  copyGoalNode: (nodeId: string) => void;
  /** Copy multiple goal nodes at once into the clipboard */
  copyGoalNodes: (nodeIds: string[]) => void;
  /** Paste the clipboard node(s) as new children of the given parent (null = root level) */
  pasteGoalNode: (parentId: string | null) => void;
  /** Clear the clipboard (cancel copy/paste) */
  clearClipboard: () => void;
  /** Clipboard nodes available to paste */
  clipboard: GoalNode[];
  /** Export full state as dated JSON backup (Android-compatible via Web Share API) */
  exportBackup: () => Promise<string>;
  /** Sync current state to Supabase cloud metadata */
  syncToCloud: () => Promise<boolean>;
  /** Restore state from Supabase cloud metadata */
  restoreFromCloud: () => Promise<boolean>;

  /* ── Session Timer ─────────────────────────────────────────────────────── */
  /** The currently live session (null if none active) */
  activeSession: ActiveSession | null;
  /** Full session history keyed by taskId */
  sessionHistory: Record<string, TaskSession[]>;
  /** Start a new session for a task (auto-pauses any existing session) */
  startSession: (taskId: string) => void;
  /** Pause the active session */
  pauseSession: () => void;
  /** Resume a paused session */
  resumeSession: () => void;
  /** Stop the active session and record to history */
  stopSession: (outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] }) => void;
  /** Discard the active session without saving to history */
  discardSession: () => void;
  /** Heartbeat — update lastHeartbeat timestamp (call every 30s) */
  heartbeatSession: () => void;
  /** Mark specified step indices done and sync back to GoalBlueprint */
  completeSessionSteps: (taskId: string, stepIndices: number[]) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}

const SEED_TASKS: Task[] = [];
const SEED_GOALS: GoalNode[] = [];

export function StoreProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useLocalStorage<Task[]>('tudo-tasks-v3', SEED_TASKS);
  const [goals, setGoals] = useLocalStorage<GoalNode[]>('tudo-goals-v3', SEED_GOALS);
  const [activeSession, setActiveSession] = useLocalStorage<ActiveSession | null>('youdo-active-session-v1', null);
  const [sessionHistory, setSessionHistory] = useLocalStorage<Record<string, TaskSession[]>>('youdo-session-history-v1', {});

  // Invalidate rollup cache whenever goals tree changes
  useEffect(() => {
    clearRollupCache();
  }, [goals]);

  // Automatic Startup Tree Repair & Sample Data Purge Pass
  useEffect(() => {
    const rawTasks = tasksRef.current;
    const rawGoals = goalsRef.current;

    const purgeTasks = rawTasks.filter((t) => {
      const isSeedId = t.id.startsWith('seed-');
      const titleLower = t.title.toLowerCase();
      const isSampleTitle =
        titleLower.includes('finish react tutorial') ||
        titleLower.includes('plan weekend trip') ||
        titleLower.includes('water the plants');
      return !isSeedId && !isSampleTitle;
    });

    const purgeGoals = rawGoals.filter((g) => {
      const isSeedId = g.id.startsWith('goal-gate') || g.id.startsWith('gate-2027') || g.id.startsWith('seed-');
      const titleLower = g.title.toLowerCase();
      const isSampleTitle =
        titleLower.includes('gate 2027') ||
        titleLower.includes('phase 1: syllabus') ||
        titleLower.includes('section 1: maths') ||
        titleLower.includes('chapter 1: linear algebra');
      return !isSeedId && !isSampleTitle;
    });

    const { cleanedGoals, cleanedTasks } = sanitizeTreeAndTasks(purgeGoals, purgeTasks);
    setTasks(cleanedTasks);
    setGoals(cleanedGoals);
  }, []);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  /* ---------- Daily task ops ---------- */

  const advance = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) return;
      const totalSteps = t.steps.length > 0 ? t.steps.length : 1;
      if (t.progress >= totalSteps) return;
      const nextProgress = t.progress + 1;
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, progress: nextProgress } : x)));
      if (t.goalNodeId) {
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, t.goalNodeId!, (n) => {
              const hasMicroSteps = !!n.steps && n.steps.length > 0;
              if (hasMicroSteps) {
                const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
                return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
              }
              return { ...n, completed: true };
            }),
          ),
        );
      }
    },
    [setTasks, setGoals],
  );

  const undo = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) return;
      const nextProgress = Math.max(0, t.progress - 1);
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, progress: nextProgress } : x)));
      if (t.goalNodeId) {
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, t.goalNodeId!, (n) => {
              const hasMicroSteps = !!n.steps && n.steps.length > 0;
              if (hasMicroSteps) {
                const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
                return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
              }
              return { ...n, completed: nextProgress > 0 };
            }),
          ),
        );
      }
    },
    [setTasks, setGoals],
  );

  const addTask = useCallback((t: Task) => {
    setTasks((prev) => [...prev, { ...t, order: prev.length }]);
  }, [setTasks]);

  const duplicateTask = useCallback((id: string) => {
    setTasks((prev) => {
      const src = prev.find((t) => t.id === id);
      if (!src) return prev;
      return [
        ...prev,
        { ...src, id: uid('task'), title: `${src.title} (copy)`, progress: 0, createdAt: Date.now(), order: prev.length, goalNodeId: undefined, stepSlice: undefined },
      ];
    });
  }, [setTasks]);

  const removeTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, [setTasks]);

  const reorder = useCallback(
    (fromId: string, toId: string) => {
      setTasks((prev) => {
        const sorted = [...prev].sort((a, b) => a.order - b.order);
        const from = sorted.findIndex((t) => t.id === fromId);
        const to = sorted.findIndex((t) => t.id === toId);
        if (from < 0 || to < 0) return prev;
        const moved = sorted[from] as Task;
        const next = sorted.filter((t) => t.id !== fromId);
        next.splice(to, 0, moved);
        return next.map((t, i) => ({ ...t, order: i }));
      });
    },
    [setTasks],
  );

  /* ---------- Goal tree ops ---------- */

  const addGoalRoot = useCallback((g: GoalNode) => {
    setGoals((prev) => [...prev, g]);
  }, [setGoals]);

  const addChildNode = useCallback(
    (parentId: string, node: GoalNode) => {
      setGoals((prev) =>
        prev.map((root) => updateNode(root, parentId, (n) => ({ ...n, children: [...n.children, node] }))),
      );
    },
    [setGoals],
  );

  const updateGoalNode = useCallback(
    (id: string, patch: (n: GoalNode) => GoalNode) => {
      setGoals((prev) => prev.map((root) => updateNode(root, id, patch)));
      const oldNode = findGoal(goalsRef.current, id);
      if (oldNode?.todayTaskId) {
        const patched = patch(oldNode);
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id !== oldNode.todayTaskId) return t;
            const slice = t.stepSlice ?? patched.steps?.map((_, i) => i) ?? [];
            const newSteps = slice.map((idx) => patched.steps?.[idx] ?? `Step ${idx + 1}`);
            const newProgress = countSlicedDone(patched, t.stepSlice);
            return { ...t, steps: newSteps, progress: newProgress };
          }),
        );
      }
    },
    [setGoals, setTasks],
  );

  const deleteGoalNode = useCallback(
    (rootId: string, nodeId: string) => {
      // Recursively collect ALL todayTaskIds in the subtree being deleted
      const node = findGoal(goalsRef.current, nodeId);
      if (node) {
        const descendantTaskIds = collectDescendantTaskIds(node);
        if (descendantTaskIds.length > 0) {
          const removeSet = new Set(descendantTaskIds);
          setTasks((prev) => prev.filter((t) => !removeSet.has(t.id)));
        }
      }
      if (rootId === nodeId) {
        setGoals((prev) => prev.filter((root) => root.id !== rootId));
      } else {
        setGoals((prev) => prev.map((root) => (root.id === rootId ? removeNode(root, nodeId) : root)));
      }
    },
    [setGoals, setTasks],
  );

  /* ---------- Plan task (push to a date) ---------- */

  const planTask = useCallback(
    (nodeId: string, targetDate: string, stepSlice?: number[]) => {
      const target = findGoal(goalsRef.current, nodeId);
      if (!target) return;

      // If already planned, remove the old task first (replan)
      if (target.todayTaskId) {
        setTasks((prev) => prev.filter((t) => t.id !== target.todayTaskId));
      }

      const masterSteps = target.steps ?? [];
      const slice = stepSlice ?? masterSteps.map((_, i) => i);
      const slicedStepLabels = slice.map((idx) => masterSteps[idx] ?? `Step ${idx + 1}`);
      const slicedDoneCount = countSlicedDone(target, slice.length === masterSteps.length ? undefined : slice);

      const taskId = uid('task');
      const newTask: Task = {
        id: taskId,
        title: target.title,
        description: target.description ?? '',
        priority: 'medium',
        targetDate,
        deadline: null,
        steps: slicedStepLabels,
        progress: slicedDoneCount,
        createdAt: Date.now(),
        order: tasksRef.current.length,
        goalNodeId: target.id,
        stepSlice: slice.length === masterSteps.length ? undefined : slice,
      };
      setTasks((prev) => [...prev, newTask]);
      setGoals((prev) =>
        prev.map((root) => updateNode(root, target.id, (n) => ({ ...n, todayTaskId: taskId }))),
      );
    },
    [setTasks, setGoals],
  );

  const planBatch = useCallback(
    (nodeIds: string[], targetDate: string) => {
      const newTasks: Task[] = [];
      const patches: { id: string; taskId: string }[] = [];
      let orderBase = tasksRef.current.length;
      for (const id of nodeIds) {
        const target = findGoal(goalsRef.current, id);
        if (!target || target.todayTaskId) continue;

        // Mirror planTask: use full step array as the slice (no partial selection in batch)
        const masterSteps = target.steps ?? [];
        const slice = masterSteps.map((_, i) => i); // full slice — all steps
        const slicedStepLabels = slice.map((idx) => masterSteps[idx] ?? `Step ${idx + 1}`);
        // Seed progress from current stepDone state so already-done steps carry over
        const slicedDoneCount = countSlicedDone(target, undefined);

        const taskId = uid('task');
        newTasks.push({
          id: taskId,
          title: target.title,
          description: target.description ?? '',
          priority: 'medium',
          targetDate,
          deadline: null,
          steps: slicedStepLabels,
          progress: slicedDoneCount,
          createdAt: Date.now(),
          order: orderBase++,
          goalNodeId: target.id,
          // stepSlice omitted (undefined) when all steps selected — matches planTask behaviour
        });
        patches.push({ id: target.id, taskId });
      }
      if (newTasks.length === 0) return;
      setTasks((prev) => [...prev, ...newTasks]);
      setGoals((prev) =>
        prev.map((root) => {
          let working = root;
          for (const p of patches) {
            working = updateNode(working, p.id, (n) => ({ ...n, todayTaskId: p.taskId }));
          }
          return working;
        }),
      );
    },
    [setTasks, setGoals],
  );

  const unlinkTask = useCallback(
    (taskId: string) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      const goalNodeId = task?.goalNodeId;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setGoals((prev) =>
        prev.map((root) =>
          goalNodeId
            ? updateNode(root, goalNodeId, (n) => (n.todayTaskId === taskId ? { ...n, todayTaskId: null } : n))
            : root,
        ),
      );
    },
    [setTasks, setGoals],
  );

  const toggleGoalStep = useCallback(
    (nodeId: string, stepIdx: number) => {
      const node = findGoal(goalsRef.current, nodeId);
      if (!node || !node.steps) return;
      const existing = node.stepDone ?? node.steps.map(() => false);
      const newStepDone = [...existing];
      newStepDone[stepIdx] = !newStepDone[stepIdx];
      const allDone = newStepDone.every(Boolean);
      setGoals((prev) =>
        prev.map((root) =>
          updateNode(root, nodeId, (n) => ({ ...n, stepDone: newStepDone, completed: allDone })),
        ),
      );
      if (node.todayTaskId) {
        const doneCount = newStepDone.filter(Boolean).length;
        setTasks((prev) =>
          prev.map((t) => (t.id === node.todayTaskId ? { ...t, progress: doneCount } : t)),
        );
      }
    },
    [setGoals, setTasks],
  );

  const togglePin = useCallback(
    (nodeId: string) => {
      setGoals((prev) =>
        prev.map((root) => updateNode(root, nodeId, (n) => ({ ...n, pinned: !n.pinned }))),
      );
    },
    [setGoals],
  );

  const reorderGoalNodes = useCallback(
    (parentId: string | null, fromId: string, toId: string) => {
      if (parentId === null) {
        setGoals((prev) => reorderNodesArray(prev, fromId, toId));
      } else {
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, parentId, (n) => ({
              ...n,
              children: reorderNodesArray(n.children, fromId, toId),
            })),
          ),
        );
      }
    },
    [setGoals],
  );

  const moveGoalNode = useCallback(
    (parentId: string | null, nodeId: string, direction: 'up' | 'down') => {
      if (parentId === null) {
        setGoals((prev) => moveNodeInArray(prev, nodeId, direction));
      } else {
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, parentId, (n) => ({
              ...n,
              children: moveNodeInArray(n.children, nodeId, direction),
            })),
          ),
        );
      }
    },
    [setGoals],
  );

  const toggleNodeCompletion = useCallback(
    (nodeId: string) => {
      const node = findGoal(goalsRef.current, nodeId);
      if (!node) return;

      const nextCompleted = !node.completed;

      const setCompletedTree = (n: GoalNode, isDone: boolean): GoalNode => {
        const steps = n.steps ?? [];
        const stepDone = steps.map(() => isDone);
        return {
          ...n,
          completed: isDone,
          stepDone: steps.length > 0 ? stepDone : n.stepDone,
          children: n.children.map((child) => setCompletedTree(child, isDone)),
        };
      };

      setGoals((prev) =>
        prev.map((root) =>
          updateNode(root, nodeId, (target) => setCompletedTree(target, nextCompleted)),
        ),
      );

      if (node.todayTaskId) {
        setTasks((prev) =>
          prev.map((t) => {
            if (t.id === node.todayTaskId) {
              const maxProgress = t.steps.length > 0 ? t.steps.length : 1;
              return { ...t, progress: nextCompleted ? maxProgress : 0 };
            }
            return t;
          }),
        );
      }
    },
    [setGoals, setTasks],
  );

  const [clipboard, setClipboard] = useState<GoalNode[]>([]);

  const copyGoalNode = useCallback(
    (nodeId: string) => {
      const node = findGoal(goalsRef.current, nodeId);
      if (!node) return;
      setClipboard([cloneNode(node)]);
    },
    [],
  );

  const copyGoalNodes = useCallback(
    (nodeIds: string[]) => {
      const clones: GoalNode[] = [];
      for (const id of nodeIds) {
        const node = findGoal(goalsRef.current, id);
        if (node) clones.push(cloneNode(node));
      }
      if (clones.length) setClipboard(clones);
    },
    [],
  );

  const pasteGoalNode = useCallback(
    (parentId: string | null) => {
      if (clipboard.length === 0) return;
      const clones = clipboard.map(cloneNode);
      if (parentId === null) {
        setGoals((prev) => [...prev, ...clones]);
      } else {
        setGoals((prev) =>
          prev.map((root) => updateNode(root, parentId, (n) => ({ ...n, children: [...n.children, ...clones] }))),
        );
      }
    },
    [clipboard, setGoals],
  );

  const clearClipboard = useCallback(() => setClipboard([]), []);

  const deleteGoalNodes = useCallback(
    (nodeIds: string[]) => {
      const idSet = new Set(nodeIds);
      // Recursively collect ALL todayTaskIds across all selected nodes and their descendants
      const taskIdsToRemove: string[] = [];
      for (const id of nodeIds) {
        const node = findGoal(goalsRef.current, id);
        if (node) taskIdsToRemove.push(...collectDescendantTaskIds(node));
      }
      if (taskIdsToRemove.length) {
        const removeTaskSet = new Set(taskIdsToRemove);
        setTasks((prev) => prev.filter((t) => !removeTaskSet.has(t.id)));
      }
      setGoals((prev) => prev.map((root) => removeNodes(root, idSet)).filter((r) => !idSet.has(r.id)));
    },
    [setGoals, setTasks],
  );

  /* ── Session Timer callbacks ──────────────────────────────────────────── */

  const formatWallClock = (ts: number): string => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const startSession = useCallback((taskId: string) => {
    const now = Date.now();
    // Auto-pause any existing session first
    if (activeSessionRef.current && !activeSessionRef.current.isPaused) {
      setActiveSession((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          isPaused: true,
          pauseStart: now,
          lastHeartbeat: now,
          pauses: [...prev.pauses, { start: now, wallClockStart: formatWallClock(now) }],
        };
      });
    }
    const session: ActiveSession = {
      taskId,
      startTime: now,
      pausedDuration: 0,
      isPaused: false,
      lastHeartbeat: now,
      pauses: [],
      wallClockStart: formatWallClock(now),
    };
    setActiveSession(session);

    // Move backlog task to today while keeping the tag
    setTasks((prev) =>
      prev.map((t) => {
        if (t.id === taskId && isBacklogTask(t)) {
          return { ...t, originalTargetDate: t.targetDate, targetDate: todayISO() };
        }
        return t;
      }),
    );
  }, [setActiveSession, setTasks]);

  const pauseSession = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev || prev.isPaused) return prev;
      const now = Date.now();
      return {
        ...prev,
        isPaused: true,
        pauseStart: now,
        lastHeartbeat: now,
        pauses: [...prev.pauses, { start: now, wallClockStart: formatWallClock(now) }],
      };
    });
  }, [setActiveSession]);

  const resumeSession = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev || !prev.isPaused) return prev;
      const now = Date.now();
      const pauseDuration = prev.pauseStart ? now - prev.pauseStart : 0;
      return {
        ...prev,
        isPaused: false,
        pauseStart: undefined,
        pausedDuration: prev.pausedDuration + pauseDuration,
        lastHeartbeat: now,
        pauses: prev.pauses.map((p, i) =>
          i === prev.pauses.length - 1
            ? {
                ...p,
                end: now,
                wallClockEnd: formatWallClock(now),
                durationMs: p.start ? now - p.start : pauseDuration,
              }
            : p,
        ),
      };
    });
  }, [setActiveSession]);

  const stopSession = useCallback(
    (outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] }) => {
      const prev = activeSessionRef.current;
      if (!prev) return;
      const now = Date.now();
      let finalPausedDuration = prev.pausedDuration;
      let finalPauses = prev.pauses;
      if (prev.isPaused && prev.pauseStart) {
        const pauseDur = now - prev.pauseStart;
        finalPausedDuration += pauseDur;
        finalPauses = prev.pauses.map((p, i) =>
          i === prev.pauses.length - 1
            ? {
                ...p,
                end: now,
                wallClockEnd: formatWallClock(now),
                durationMs: p.start ? now - p.start : pauseDur,
              }
            : p,
        );
      }
      const netFocusMs = Math.max(0, (now - prev.startTime) - finalPausedDuration);
      const task = tasksRef.current.find((t) => t.id === prev.taskId);

      const session: TaskSession = {
        id: uid('sess'),
        taskId: prev.taskId,
        goalNodeId: task?.goalNodeId,
        startTime: prev.startTime,
        endTime: now,
        pausedDuration: finalPausedDuration,
        pauses: finalPauses,
        netFocusMs,
        wallClockStart: prev.wallClockStart,
        wallClockEnd: formatWallClock(now),
        completed: outcome.completed,
        completedStepIndices: outcome.completedStepIndices ?? [],
      };
      setSessionHistory((hist) => ({
        ...hist,
        [prev.taskId]: [...(hist[prev.taskId] ?? []), session],
      }));
      setActiveSession(null);

      // Handle backlog reverting if not completed
      setTasks((prevTasks) =>
        prevTasks.map((t) => {
          if (t.id === prev.taskId && t.originalTargetDate) {
            // "if marked not completed then move back to backlog"
            if (outcome.completed === false || outcome.completed === 'partial') {
              const newT = { ...t, targetDate: t.originalTargetDate };
              delete newT.originalTargetDate;
              return newT;
            }
            // If completed, it stays in today and retains `originalTargetDate` as the backlog tag
          }
          return t;
        }),
      );
    },
    [setActiveSession, setSessionHistory, setTasks],
  );

  const discardSession = useCallback(() => setActiveSession(null), [setActiveSession]);

  const heartbeatSession = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev) return null;
      const now = Date.now();

      // Auto-pause safeguard if continuous focus exceeds 4 hours (14,400,000 ms)
      if (!prev.isPaused) {
        const currentRunMs = now - prev.startTime - prev.pausedDuration;
        if (currentRunMs >= 14_400_000) {
          return {
            ...prev,
            isPaused: true,
            pauseStart: now,
            lastHeartbeat: now,
            pauses: [...prev.pauses, { start: now, wallClockStart: formatWallClock(now) }],
          };
        }
      }

      return { ...prev, lastHeartbeat: now };
    });
  }, [setActiveSession]);

  const completeSessionSteps = useCallback(
    (taskId: string, stepIndices: number[]) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;

      if (!task.goalNodeId) {
        // Standalone task — just bump progress to full
        if (stepIndices.length > 0 || task.steps.length === 0) {
          setTasks((prev) =>
            prev.map((x) => x.id === taskId ? { ...x, progress: x.steps.length || 1 } : x)
          );
        }
        return;
      }

      const masterIndices = stepIndices.map((i) =>
        task.stepSlice ? task.stepSlice[i] : i
      );

      const node = findGoal(goalsRef.current, task.goalNodeId);
      if (!node) return;

      const hasSteps = !!node.steps && node.steps.length > 0;
      let newProgress = task.progress;

      if (hasSteps) {
        const currentDone = node.stepDone ?? node.steps!.map(() => false);
        const newStepDone = currentDone.map(
          (done, idx) => done || masterIndices.includes(idx)
        );
        newProgress = task.stepSlice
          ? task.stepSlice.filter((idx) => newStepDone[idx]).length
          : newStepDone.filter(Boolean).length;
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, task.goalNodeId!, (n) => ({
              ...n,
              stepDone: newStepDone,
              completed: newStepDone.every(Boolean),
            }))
          )
        );
      } else {
        // No steps — mark node completed
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, task.goalNodeId!, (n) => ({ ...n, completed: true }))
          )
        );
        newProgress = 1;
      }

      setTasks((prev) =>
        prev.map((x) => x.id === taskId ? { ...x, progress: newProgress } : x)
      );
    },
    [setGoals, setTasks],
  );

  /* ── Backup ───────────────────────────────────────────────────────────── */

  const exportBackup = useCallback(async (): Promise<string> => {
    const data = {
      app: 'YouDO',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      tasks: tasksRef.current,
      goals: goalsRef.current,
      sessionHistory: sessionHistory,
    };
    const jsonStr = JSON.stringify(data, null, 2);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `youdo-backup-${dateStr}.json`;

    // 1. Attempt Capacitor native Share via native Cache File URI (Android file save prompt)
    try {
      await Filesystem.writeFile({
        path: fileName,
        data: jsonStr,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      const fileUri = await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });
      await Share.share({
        title: 'YouDO Backup',
        text: 'YouDO Study Blueprint Backup File',
        url: fileUri.uri,
        dialogTitle: 'Save YouDO Backup File',
      });
      return '✓ Saved via native Android Share dialog';
    } catch {
      /* Fallthrough to Web Share or anchor download */
    }

    // 2. Web Share API fallback
    try {
      const file = new File([jsonStr], fileName, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: 'YouDO Backup',
          text: 'YouDO Study Blueprint Backup',
        });
        return '✓ Saved via Share prompt';
      }
    } catch {
      /* Fallthrough to anchor download */
    }

    // 3. Desktop/Browser anchor download fallback
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }

    return '✓ Backup exported to Downloads';
  }, [sessionHistory]);

  const importBackup = useCallback(
    (jsonData: string): boolean => {
      try {
        const parsed = JSON.parse(jsonData);
        if (!parsed || typeof parsed !== 'object') return false;

        // Validate tasks: require id (string), title (string), steps (array)
        const rawTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        const importedTasks: Task[] = rawTasks.filter(
          (t: unknown): t is Task =>
            typeof t === 'object' && t !== null &&
            typeof (t as Task).id === 'string' && (t as Task).id.length > 0 &&
            typeof (t as Task).title === 'string' && (t as Task).title.length > 0 &&
            Array.isArray((t as Task).steps) &&
            typeof (t as Task).progress === 'number' &&
            typeof (t as Task).createdAt === 'number',
        );

        // Validate goal nodes: require id (string), title (string), kind (string), children (array)
        const rawGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
        const validKinds = new Set(['goal', 'phase', 'section', 'task', 'sub', 'leaf']);
        const importedGoals: GoalNode[] = rawGoals.filter(
          (g: unknown): g is GoalNode =>
            typeof g === 'object' && g !== null &&
            typeof (g as GoalNode).id === 'string' && (g as GoalNode).id.length > 0 &&
            typeof (g as GoalNode).title === 'string' && (g as GoalNode).title.length > 0 &&
            validKinds.has((g as GoalNode).kind) &&
            Array.isArray((g as GoalNode).children) &&
            typeof (g as GoalNode).createdAt === 'number',
        );

        // Require at least one valid tasks or goals entry to treat as a real backup
        if (rawTasks.length > 0 && importedTasks.length === 0) return false;
        if (rawGoals.length > 0 && importedGoals.length === 0) return false;

        // Run sanitize & repair pass on imported data (duplicate IDs, stale pointers)
        const { cleanedGoals, cleanedTasks } = sanitizeTreeAndTasks(importedGoals, importedTasks);

        setTasks(cleanedTasks);
        setGoals(cleanedGoals);
        clearRollupCache();
        return true;
      } catch {
        return false;
      }
    },
    [setTasks, setGoals],
  );

  const { user, updateCloudBackup, fetchCloudBackup } = useAuth();
  const sessionHistoryRef = useRef(sessionHistory);
  sessionHistoryRef.current = sessionHistory;

  const syncToCloud = useCallback(async (): Promise<{ ok: boolean; error?: string }> => {
    if (!user) return { ok: false, error: 'Not logged in to an active account' };
    const payload = {
      app: 'YouDO',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      updatedAt: Date.now(),
      tasks: tasksRef.current,
      goals: goalsRef.current,
      sessionHistory: sessionHistoryRef.current,
    };
    return await updateCloudBackup(payload);
  }, [user, updateCloudBackup]);

  const restoreFromCloud = useCallback(async (): Promise<boolean> => {
    if (!user) return false;
    const jsonStr = await fetchCloudBackup();
    if (!jsonStr) return false;
    try {
      return importBackup(jsonStr);
    } catch {
      return false;
    }
  }, [user, fetchCloudBackup, importBackup]);

  // Auto-restore / Auto-push on user auth change
  useEffect(() => {
    if (!user) return;
    // When user logs in: check if local state is empty, if so auto-restore from cloud
    const autoRestoreOrPush = async () => {
      if (tasksRef.current.length === 0 && goalsRef.current.length === 0) {
        // Local is empty — try to restore from cloud
        const jsonStr = await fetchCloudBackup();
        if (jsonStr) {
          importBackup(jsonStr);
        }
      } else {
        // Local has data — push it to cloud
        syncToCloud();
      }
    };
    autoRestoreOrPush();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Automatic Background Push: whenever goals, tasks, or sessionHistory change and user is logged in
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      syncToCloud();
    }, 2000);
    return () => clearTimeout(timer);
  }, [user, tasks, goals, sessionHistory, syncToCloud]);

  const value = useMemo<Store>(
    () => ({
      tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode,
      reorderGoalNodes, moveGoalNode, toggleNodeCompletion,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard, deleteGoalNodes,
      exportBackup, importBackup, syncToCloud, restoreFromCloud,
      activeSession, sessionHistory,
      startSession, pauseSession, resumeSession, stopSession,
      discardSession, heartbeatSession, completeSessionSteps,
    }),
    [tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode, deleteGoalNodes,
      reorderGoalNodes, moveGoalNode, toggleNodeCompletion,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard,
      exportBackup, importBackup, syncToCloud, restoreFromCloud,
      activeSession, sessionHistory,
      startSession, pauseSession, resumeSession, stopSession,
      discardSession, heartbeatSession, completeSessionSteps],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { isToday, uid };

