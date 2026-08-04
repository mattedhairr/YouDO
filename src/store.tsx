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
import type { GoalNode, Task } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';

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

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
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

export function rollupPct(node: GoalNode): number {
  if (node.children.length === 0) {
    if (node.steps && node.steps.length > 0) {
      return Math.round(((node.stepDone ?? []).filter(Boolean).length / node.steps.length) * 100);
    }
    return node.completed ? 100 : 0;
  }
  const total = node.children.length;
  if (total === 0) return 0;
  const doneCount = node.children.filter((c) => c.completed || rollupPct(c) === 100).length;
  return Math.round((doneCount / total) * 100);
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

export function pathTitles(root: GoalNode, id: string): string[] {
  if (root.id === id) return [root.title];
  for (const child of root.children) {
    const sub = pathTitles(child, id);
    if (sub.length) return [root.title, ...sub];
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
  /** Export full state as dated JSON backup */
  exportBackup: () => void;
  /** Import full state from JSON file with validation */
  importBackup: (jsonData: string) => boolean;
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

  // Automatic One-Time Startup Sample Data Purge
  useEffect(() => {
    setTasks((prev) => {
      const cleaned = prev.filter((t) => {
        const isSeedId = t.id.startsWith('seed-');
        const titleLower = t.title.toLowerCase();
        const isSampleTitle =
          titleLower.includes('finish react tutorial') ||
          titleLower.includes('plan weekend trip') ||
          titleLower.includes('water the plants');
        return !isSeedId && !isSampleTitle;
      });
      return cleaned.length !== prev.length ? cleaned : prev;
    });

    setGoals((prev) => {
      const cleaned = prev.filter((g) => {
        const isSeedId = g.id.startsWith('goal-gate') || g.id.startsWith('gate-2027') || g.id.startsWith('seed-');
        const titleLower = g.title.toLowerCase();
        const isSampleTitle =
          titleLower.includes('gate 2027') ||
          titleLower.includes('phase 1: syllabus') ||
          titleLower.includes('section 1: maths') ||
          titleLower.includes('chapter 1: linear algebra');
        return !isSeedId && !isSampleTitle;
      });
      return cleaned.length !== prev.length ? cleaned : prev;
    });
  }, [setTasks, setGoals]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;

  /* ---------- Daily task ops ---------- */

  const advance = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t || t.steps.length === 0) return;
      const nextProgress = Math.min(t.progress + 1, t.steps.length);
      setTasks((prev) => prev.map((x) => (x.id === id ? { ...x, progress: nextProgress } : x)));
      if (t.goalNodeId) {
        setGoals((prev) =>
          prev.map((root) =>
            updateNode(root, t.goalNodeId!, (n) => {
              if (!n.steps) return n;
              const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
              return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
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
              if (!n.steps) return n;
              const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
              return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
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
      const node = findGoal(goalsRef.current, nodeId);
      if (node?.todayTaskId) {
        setTasks((prev) => prev.filter((t) => t.id !== node.todayTaskId));
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
        const taskId = uid('task');
        newTasks.push({
          id: taskId,
          title: target.title,
          description: target.description ?? '',
          priority: 'medium',
          targetDate,
          deadline: null,
          steps: target.steps ?? [],
          progress: countSlicedDone(target, undefined),
          createdAt: Date.now(),
          order: orderBase++,
          goalNodeId: target.id,
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
      const taskIdsToRemove: string[] = [];
      for (const id of nodeIds) {
        const node = findGoal(goalsRef.current, id);
        if (node?.todayTaskId) taskIdsToRemove.push(node.todayTaskId);
      }
      if (taskIdsToRemove.length) {
        const removeTaskSet = new Set(taskIdsToRemove);
        setTasks((prev) => prev.filter((t) => !removeTaskSet.has(t.id)));
      }
      setGoals((prev) => prev.map((root) => removeNodes(root, idSet)).filter((r) => !idSet.has(r.id)));
    },
    [setGoals, setTasks],
  );

  const exportBackup = useCallback(() => {
    const data = {
      app: 'YouDO',
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      tasks: tasksRef.current,
      goals: goalsRef.current,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const dateStr = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `youdo-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const importBackup = useCallback(
    (jsonData: string): boolean => {
      try {
        const parsed = JSON.parse(jsonData);
        if (!parsed || typeof parsed !== 'object') return false;
        const importedTasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
        const importedGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
        setTasks(importedTasks);
        setGoals(importedGoals);
        return true;
      } catch {
        return false;
      }
    },
    [setTasks, setGoals],
  );

  const value = useMemo<Store>(
    () => ({
      tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard, deleteGoalNodes,
      exportBackup, importBackup,
    }),
    [tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode, deleteGoalNodes,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard,
      exportBackup, importBackup],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export { isToday, todayISO, uid };
