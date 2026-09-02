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
import { parseBackupPayload, summarizeBackupPayload, type BackupSummary } from './lib/backup';
import { guardWallClock, hasClockIncident } from './lib/deviceClock';
import { formatWallClock } from './lib/format';
import {
  finalizeSession,
  tickActiveSession,
  continueAfterInterruption,
  createManualStepSession,
  resolvePersistEndAt,
  isManualSession,
  sanitizeSessionHistory,
  pruneSessionHistoryBefore,
  SESSION_HISTORY_KEEP_MS,
} from './lib/sessionStats';
import { attachSessionNotificationActions, pullNativeSession, syncSessionNotification } from './lib/sessionNotification';
import {
  clearRollupCache,
  cloneNode,
  collectDescendantTaskIds,
  countSlicedDone,
  duplicateTaskAsFresh,
  findGoal,
  findNode,
  goalBranchContainsTask,
  isMutableGoalPlan,
  isTaskComplete,
  clearBacklogIfComplete,
  rescheduleOpenBacklogTask,
  restoreBacklogIfIncomplete,
  moveNodeInArray,
  removeNode,
  removeNodes,
  reorderNodesArray,
  sameTasks,
  sameTree,
  recomputeCompleted,
  sanitizeTreeAndTasks,
  setSubtreeCompleted,
  syncLinkedTasksFromGoal,
  syncStepDone,
  updateNode,
} from './lib/goalTree';
import { uid } from './lib/ids';
import { APP_VERSION } from './lib/version';
import {
  STORAGE_KEYS,
  readWorkspaceCloudFingerprint,
  readWorkspaceUpdatedAt,
  writeWorkspaceCloudFingerprint,
  writeWorkspaceUpdatedAt,
} from './lib/storageKeys';
import { mergeWorkspace, workspaceFingerprint, type TrashRecord, type WorkspaceSlice } from './lib/syncMerge';
import { decideSyncAction, type SyncConflictStrategy } from './lib/syncDecision';
import { canonicalWorkspaceFingerprint } from './lib/syncPayload';
import { hapticGoalComplete, hapticSuccess, hapticTick, hapticWarn } from './lib/haptics';
import {
  applyStreakBarHours,
  defaultStreakMeta,
  sanitizeStreakMeta,
  type StreakMeta,
} from './lib/focusTrends';
import { todayISO } from './lib/dates';
import { defaultPacePrefs, sanitizePacePrefs, type PacePrefs } from './lib/paceBoard';
import { syncPublicPaceRow, withdrawPublicPace } from './lib/pacePublish';
import { reconcileBlueprintTasks } from './lib/blueprintStudio';

export {
  todayISO,
  tomorrowISO,
  formatDDMMYYYY,
  isToday,
  localISODate,
} from './lib/dates';
export { uid } from './lib/ids';
export {
  clearRollupCache,
  cloneNode,
  collectDescendantIds,
  collectDescendantTaskIds,
  countCompletedDirectChildren,
  countDirectChildren,
  findGoal,
  findNode,
  isBacklogTask,
  isOpenBacklogTask,
  isTaskComplete,
  moveNodeInArray,
  pathNodes,
  pathTitles,
  removeNode,
  removeNodes,
  reorderNodesArray,
  rollupPct,
  recomputeCompleted,
  sanitizeTreeAndTasks,
  setSubtreeCompleted,
  updateNode,
} from './lib/goalTree';

export interface DeletedGoalRecord {
  id: string;
  node: GoalNode;
  deletedAt: number;
  parentRootId: string | null;
  /** Direct parent node id. Null when deleted from root level. Used for accurate deep restore. */
  parentNodeId?: string | null;
  tasks: Task[];
}

export interface GoalTreeChangeResult {
  ok: boolean;
  token?: string;
  error?: 'stale' | 'unchanged' | 'active-session';
}

type CloudSyncOptions = {
  allowEmpty?: boolean;
  conflictStrategy?: SyncConflictStrategy;
};

type CloudSyncResult = { ok: boolean; error?: string; conflict?: boolean };

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
  /** Atomically apply a previewed Blueprint Studio tree, refusing stale drafts. */
  applyGoalTreeChange: (baseGoals: GoalNode[], nextGoals: GoalNode[]) => GoalTreeChangeResult;
  /** Undo a Blueprint Studio transaction only while it is still the latest tree state. */
  undoGoalTreeChange: (token: string) => boolean;
  /** Delete multiple goal nodes at once */
  deleteGoalNodes: (nodeIds: string[]) => void;
  /** Recently deleted goals safety bin */
  recentlyDeletedGoals: DeletedGoalRecord[];
  lastDeletedNotification: { id: string; title: string } | null;
  clearDeletedNotification: () => void;
  restoreDeletedGoal: (recordId: string) => boolean;
  clearTrash: () => void;
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
  /** Import full state from JSON string backup */
  importBackup: (jsonStr: string) => boolean;
  /** Sync current state to Supabase cloud metadata */
  syncToCloud: (opts?: CloudSyncOptions) => Promise<CloudSyncResult>;
  cloudSyncConflict: boolean;
  /** Restore state from Supabase cloud metadata */
  restoreFromCloud: () => Promise<boolean>;
  restoreFromVisitSnapshot: (snapshotId: string) => Promise<boolean>;
  listCloudRestorePoints: () => Promise<{
    live: { updatedAt: string; summary: BackupSummary | null } | null;
    visits: { id: string; createdAt: string; summary: BackupSummary | null }[];
  }>;
  /** Drop sittings older than 90 days from this device. */
  pruneOldSessions: () => number;
  /** Daily streak bar + revive snapshot (synced to cloud). */
  streakMeta: StreakMeta;
  setStreakMeta: (next: StreakMeta | ((prev: StreakMeta) => StreakMeta)) => void;
  setStreakBarHours: (hours: number) => void;
  /** Opt-in public Board prefs (synced in workspace backup). */
  pacePrefs: PacePrefs;
  updatePacePrefs: (patch: Partial<PacePrefs>) => void;
  publishPublicPace: (historyOverride?: Record<string, TaskSession[]>) => Promise<void>;

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
  stopSession: (
    outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] },
    options?: { endTime?: number; ignoreOpenPause?: boolean },
  ) => void;
  /** Discard the active session without saving to history */
  discardSession: () => void;
  /** After an interrupted session, keep counting including phone-off time */
  continueInterruptedSession: () => void;
  /** Heartbeat — update lastHeartbeat timestamp (call every 30s) */
  heartbeatSession: () => void;
  /** Mark specified step indices done and sync back to GoalBlueprint */
  completeSessionSteps: (taskId: string, stepIndices: number[]) => void;
}

type DataStore = Omit<
  Store,
  | 'activeSession'
  | 'startSession'
  | 'pauseSession'
  | 'resumeSession'
  | 'stopSession'
  | 'discardSession'
  | 'continueInterruptedSession'
  | 'heartbeatSession'
>;

type SessionStore = Pick<
  Store,
  | 'activeSession'
  | 'startSession'
  | 'pauseSession'
  | 'resumeSession'
  | 'stopSession'
  | 'discardSession'
  | 'continueInterruptedSession'
  | 'heartbeatSession'
>;

const DataCtx = createContext<DataStore | null>(null);
const SessionCtx = createContext<SessionStore | null>(null);

export function useStore() {
  const c = useContext(DataCtx);
  if (!c) throw new Error('useStore must be used within StoreProvider');
  return c;
}

export function useSessionStore() {
  const c = useContext(SessionCtx);
  if (!c) throw new Error('useSessionStore must be used within StoreProvider');
  return c;
}

const SEED_TASKS: Task[] = [];
const SEED_GOALS: GoalNode[] = [];

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, updateCloudBackup, fetchCloudBackup, fetchLiveBackupInfo, listVisitSnapshots, fetchVisitSnapshot } = useAuth();
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEYS.tasks, SEED_TASKS);
  const [goals, setGoals] = useLocalStorage<GoalNode[]>(STORAGE_KEYS.goals, SEED_GOALS);
  const [recentlyDeletedGoals, setRecentlyDeletedGoals] = useLocalStorage<DeletedGoalRecord[]>(STORAGE_KEYS.deletedGoals, []);
  const [lastDeletedNotification, setLastDeletedNotification] = useState<{ id: string; title: string } | null>(null);
  const [activeSession, setActiveSession] = useLocalStorage<ActiveSession | null>(STORAGE_KEYS.activeSession, null);
  const [sessionHistory, setSessionHistory] = useLocalStorage<Record<string, TaskSession[]>>(STORAGE_KEYS.sessionHistory, {});
  const [streakMeta, setStreakMeta] = useLocalStorage<StreakMeta>(
    STORAGE_KEYS.streakMeta,
    defaultStreakMeta(todayISO()),
  );
  const [pacePrefs, setPacePrefs] = useLocalStorage<PacePrefs>(STORAGE_KEYS.pacePrefs, defaultPacePrefs());
  const [cloudSyncConflict, setCloudSyncConflict] = useState(false);

  // Invalidate rollup cache whenever goals tree changes
  useEffect(() => {
    clearRollupCache();
  }, [goals]);

  // Automatic Startup Tree Repair & Seed Data Purge Pass
  useEffect(() => {
    const rawTasks = tasksRef.current;
    const rawGoals = goalsRef.current;

    // Only purge tasks/goals whose IDs were generated by seed/demo data.
    // Title-based purge is intentionally omitted — it risked silently deleting real user data
    // if their tasks happened to contain the same substring as a demo task title.
    const purgeTasks = rawTasks.filter((t) => !t.id.startsWith('seed-'));
    const purgeGoals = rawGoals.filter(
      (g) =>
        !g.id.startsWith('goal-gate') &&
        !g.id.startsWith('gate-2027') &&
        !g.id.startsWith('seed-'),
    );

    const { cleanedGoals, cleanedTasks } = sanitizeTreeAndTasks(purgeGoals, purgeTasks);
    if (!sameTasks(rawTasks, cleanedTasks)) setTasks(cleanedTasks);
    if (!sameTree(rawGoals, cleanedGoals)) setGoals(cleanedGoals);
  }, [setGoals, setTasks]);

  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const goalsRef = useRef(goals);
  goalsRef.current = goals;
  const sessionHistoryRef = useRef(sessionHistory);
  sessionHistoryRef.current = sessionHistory;
  const streakMetaRef = useRef(streakMeta);
  streakMetaRef.current = streakMeta;
  const pacePrefsRef = useRef(sanitizePacePrefs(pacePrefs));
  pacePrefsRef.current = sanitizePacePrefs(pacePrefs);
  const userIdRef = useRef(user?.id ?? null);
  userIdRef.current = user?.id ?? null;
  const paceCloudTimerRef = useRef<number>(0);
  const recentlyDeletedRef = useRef(recentlyDeletedGoals);
  recentlyDeletedRef.current = recentlyDeletedGoals;
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;
  const goalTreeTransactionsRef = useRef(new Map<string, {
    beforeGoals: GoalNode[];
    beforeTasks: Task[];
    afterGoals: GoalNode[];
    afterTasks: Task[];
  }>());
  const workspaceUpdatedAtRef = useRef(readWorkspaceUpdatedAt());
  const workspaceHydratedRef = useRef(false);

  useEffect(() => {
    if (workspaceUpdatedAtRef.current > 0) return;
    const n = Date.now();
    workspaceUpdatedAtRef.current = n;
    writeWorkspaceUpdatedAt(n);
  }, []);

  useEffect(() => {
    if (!workspaceHydratedRef.current) {
      workspaceHydratedRef.current = true;
      return;
    }
    const n = Date.now();
    workspaceUpdatedAtRef.current = n;
    writeWorkspaceUpdatedAt(n);
  }, [tasks, goals, recentlyDeletedGoals]);

  /* ---------- Daily task ops ---------- */

  const updateSessionHistory = useCallback(
    (updater: (current: Record<string, TaskSession[]>) => Record<string, TaskSession[]>) => {
      const next = updater(sessionHistoryRef.current);
      if (next === sessionHistoryRef.current) return;
      sessionHistoryRef.current = next;
      setSessionHistory(next);
    },
    [setSessionHistory],
  );

  const recordManualSteps = useCallback(
    (task: Task, stepIndices: number[], completed: boolean) => {
      const indices = [...new Set(stepIndices)].filter((index) => index >= 0);
      if (indices.length === 0) return;
      const row = createManualStepSession(task.id, indices, {
        goalNodeId: task.goalNodeId,
        completed: completed ? true : 'partial',
      });
      updateSessionHistory((current) => ({
        ...current,
        [task.id]: [...(current[task.id] ?? []), row],
      }));
    },
    [updateSessionHistory],
  );

  const removeManualStepEvidence = useCallback(
    (taskId: string, stepIndices?: number[]) => {
      const remove = stepIndices ? new Set(stepIndices) : null;
      updateSessionHistory((current) => {
        const rows = current[taskId] ?? [];
        let changed = false;
        const nextRows = rows.flatMap((row) => {
          if (!isManualSession(row)) return [row];
          if (!remove) {
            changed = true;
            return [];
          }
          const kept = row.completedStepIndices.filter((index) => !remove.has(index));
          if (kept.length === row.completedStepIndices.length) return [row];
          changed = true;
          return kept.length > 0
            ? [{ ...row, completedStepIndices: kept, completed: 'partial' as const }]
            : [];
        });
        if (!changed) return current;
        const next = { ...current };
        if (nextRows.length > 0) next[taskId] = nextRows;
        else delete next[taskId];
        return next;
      });
    },
    [updateSessionHistory],
  );

  const advance = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) return;
      const totalSteps = t.steps.length > 0 ? t.steps.length : 1;
      if (t.progress >= totalSteps) return;
      const nextProgress = t.progress + 1;
      setTasks((prev) =>
        prev.map((x) => {
          if (x.id !== id) return x;
          const updated = { ...x, progress: nextProgress };
          return clearBacklogIfComplete(updated);
        }),
      );
      if (t.goalNodeId) {
        setGoals((prev) =>
          prev.map((root) =>
            recomputeCompleted(
              updateNode(root, t.goalNodeId!, (n) => {
                const hasMicroSteps = !!n.steps && n.steps.length > 0;
                if (hasMicroSteps) {
                  const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
                  return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
                }
                return { ...n, completed: true };
              }),
            ),
          ),
        );
      }
      const completed = nextProgress >= totalSteps;
      recordManualSteps(t, [nextProgress - 1], completed);

      let finishingGoal = false;
      if (t.goalNodeId) {
        const node = findGoal(goalsRef.current, t.goalNodeId);
        if (node) {
          if (!node.steps?.length) finishingGoal = completed;
          else finishingGoal = syncStepDone(node, nextProgress, t.stepSlice).every(Boolean);
        }
      }
      if (finishingGoal) hapticGoalComplete();
      else if (completed) hapticSuccess();
      else hapticTick();
    },
    [setTasks, setGoals, recordManualSteps],
  );

  const undo = useCallback(
    (id: string) => {
      const t = tasksRef.current.find((x) => x.id === id);
      if (!t) return;
      const nextProgress = Math.max(0, t.progress - 1);
      setTasks((prev) =>
        prev.map((x) => {
          if (x.id !== id) return x;
          return restoreBacklogIfIncomplete({ ...x, progress: nextProgress });
        }),
      );
      if (t.goalNodeId) {
        setGoals((prev) =>
          prev.map((root) =>
            recomputeCompleted(
              updateNode(root, t.goalNodeId!, (n) => {
                const hasMicroSteps = !!n.steps && n.steps.length > 0;
                if (hasMicroSteps) {
                  const newStepDone = syncStepDone(n, nextProgress, t.stepSlice);
                  return { ...n, stepDone: newStepDone, completed: newStepDone.every(Boolean) };
                }
                return { ...n, completed: nextProgress > 0 };
              }),
            ),
          ),
        );
      }
      removeManualStepEvidence(t.id, [Math.max(0, t.progress - 1)]);
    },
    [setTasks, setGoals, removeManualStepEvidence],
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
        duplicateTaskAsFresh(src, uid('task'), Date.now(), prev.length),
      ];
    });
  }, [setTasks]);

  const removeTask = useCallback((id: string) => {
    if (activeSessionRef.current?.taskId === id) return;
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

  const applyGoalTreeChange = useCallback(
    (baseGoals: GoalNode[], proposedGoals: GoalNode[]): GoalTreeChangeResult => {
      const currentGoals = goalsRef.current;
      const currentTasks = tasksRef.current;
      if (!sameTree(currentGoals, baseGoals)) return { ok: false, error: 'stale' };

      const nextGoals = proposedGoals.map(recomputeCompleted);
      if (sameTree(currentGoals, nextGoals)) return { ok: false, error: 'unchanged' };

      const nextTasks = reconcileBlueprintTasks(currentTasks, nextGoals, currentGoals);

      if (activeSessionRef.current && !nextTasks.some((task) => task.id === activeSessionRef.current?.taskId)) {
        return { ok: false, error: 'active-session' };
      }

      const token = uid('blueprint');
      goalTreeTransactionsRef.current.set(token, {
        beforeGoals: currentGoals,
        beforeTasks: currentTasks,
        afterGoals: nextGoals,
        afterTasks: nextTasks,
      });
      while (goalTreeTransactionsRef.current.size > 8) {
        const oldest = goalTreeTransactionsRef.current.keys().next().value as string | undefined;
        if (!oldest) break;
        goalTreeTransactionsRef.current.delete(oldest);
      }

      goalsRef.current = nextGoals;
      tasksRef.current = nextTasks;
      clearRollupCache();
      setGoals(nextGoals);
      setTasks(nextTasks);
      hapticSuccess();
      return { ok: true, token };
    },
    [setGoals, setTasks],
  );

  const undoGoalTreeChange = useCallback(
    (token: string): boolean => {
      const transaction = goalTreeTransactionsRef.current.get(token);
      if (!transaction) return false;
      if (
        !sameTree(goalsRef.current, transaction.afterGoals) ||
        !sameTasks(tasksRef.current, transaction.afterTasks)
      ) {
        goalTreeTransactionsRef.current.delete(token);
        return false;
      }
      goalsRef.current = transaction.beforeGoals;
      tasksRef.current = transaction.beforeTasks;
      clearRollupCache();
      setGoals(transaction.beforeGoals);
      setTasks(transaction.beforeTasks);
      goalTreeTransactionsRef.current.delete(token);
      hapticTick();
      return true;
    },
    [setGoals, setTasks],
  );

  const updateGoalNode = useCallback(
    (id: string, patch: (n: GoalNode) => GoalNode) => {
      // Read the node synchronously BEFORE scheduling the goals update.
      // Reading it inside or after setGoals risks a stale value because
      // goalsRef.current is only updated on re-render, not immediately after setGoals.
      const oldNode = findGoal(goalsRef.current, id);
      const patched = oldNode ? patch(oldNode) : null;
      setGoals((prev) => prev.map((root) => recomputeCompleted(updateNode(root, id, patch))));
      if (patched) setTasks((prev) => syncLinkedTasksFromGoal(prev, patched));
    },
    [setGoals, setTasks],
  );

  const deleteGoalNode = useCallback(
    (rootId: string, nodeId: string) => {
      const node = findGoal(goalsRef.current, nodeId);
      if (!node) return;

      // Find the direct parent node so restore can put the node back in its exact location.
      let parentNodeId: string | null = null;
      if (rootId !== nodeId) {
        const rootGoal = goalsRef.current.find((r) => r.id === rootId);
        if (rootGoal) {
          const [, directParent] = findNode(rootGoal, nodeId);
          parentNodeId = directParent?.id ?? null;
        }
      }

      const descendantTaskIds = collectDescendantTaskIds(node);
      const activeTask = activeSessionRef.current
        ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
        : undefined;
      if (activeTask && goalBranchContainsTask(node, activeTask)) return;
      const associatedTasks = tasksRef.current.filter((t) => descendantTaskIds.includes(t.id));

      const record: DeletedGoalRecord = {
        id: uid('del'),
        node: cloneNode(node),
        deletedAt: Date.now(),
        parentRootId: rootId === nodeId ? null : rootId,
        parentNodeId,
        tasks: associatedTasks,
      };

      setRecentlyDeletedGoals((prev) => [record, ...prev].slice(0, 20));
      setLastDeletedNotification({ id: record.id, title: node.title });
      hapticWarn();

      if (descendantTaskIds.length > 0) {
        const removeSet = new Set(descendantTaskIds);
        setTasks((prev) => prev.filter((t) => !removeSet.has(t.id)));
      }
      if (rootId === nodeId) {
        setGoals((prev) => prev.filter((root) => root.id !== rootId));
      } else {
        setGoals((prev) => prev.map((root) => (root.id === rootId ? removeNode(root, nodeId) : root)));
      }
    },
    [setGoals, setTasks, setRecentlyDeletedGoals],
  );

  /* ---------- Plan task (push to a date) ---------- */

  const planTask = useCallback(
    (nodeId: string, targetDate: string, stepSlice?: number[]) => {
      const target = findGoal(goalsRef.current, nodeId);
      if (!target) return;
      const activeTask = activeSessionRef.current
        ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
        : undefined;
      if (activeTask && (target.todayTaskId === activeTask.id || activeTask.goalNodeId === target.id)) return;

      const masterSteps = target.steps ?? [];
      const slice = stepSlice ?? masterSteps.map((_, i) => i);
      const slicedStepLabels = slice.map((idx) => masterSteps[idx] ?? `Step ${idx + 1}`);
      const slicedDoneCount = countSlicedDone(target, slice.length === masterSteps.length ? undefined : slice);
      const existing = target.todayTaskId
        ? tasksRef.current.find((task) => task.id === target.todayTaskId)
        : undefined;
      const rescheduled = existing
        ? rescheduleOpenBacklogTask(existing, targetDate)
        : null;
      const taskId = rescheduled?.id ?? uid('task');
      const taskBase = {
        ...(rescheduled ?? {}),
        id: taskId,
        title: target.title,
        description: target.description ?? '',
        priority: 'medium' as const,
        targetDate,
        deadline: null,
        steps: slicedStepLabels,
        progress: slicedDoneCount,
        createdAt: rescheduled?.createdAt ?? Date.now(),
        goalNodeId: target.id,
        stepSlice: slice.length === masterSteps.length ? undefined : slice,
      };

      setTasks((prev) => {
        if (rescheduled) {
          const next = prev.map((task) => (task.id === rescheduled.id ? { ...taskBase, order: task.order } : task));
          return next.some((task) => task.id === rescheduled.id)
            ? next
            : [...prev, { ...taskBase, order: prev.length }];
        }
        // Replace an incomplete open plan; keep completed day cards for Plan/history.
        let filtered = prev;
        if (target.todayTaskId) {
          const old = prev.find((t) => t.id === target.todayTaskId);
          if (old && !isTaskComplete(old)) {
            filtered = prev.filter((t) => t.id !== target.todayTaskId);
          }
        }
        return [...filtered, { ...taskBase, order: filtered.length }];
      });
      setGoals((prev) =>
        prev.map((root) => updateNode(root, target.id, (n) => ({ ...n, todayTaskId: taskId }))),
      );
    },
    [setTasks, setGoals],
  );

  const planBatch = useCallback(
    (nodeIds: string[], targetDate: string) => {
      const newTasks: Task[] = [];
      const rescheduledTasks = new Map<string, Task>();
      const patches: { id: string; taskId: string }[] = [];
      let orderBase = tasksRef.current.length;
      const replaceIds = new Set<string>();
      for (const id of nodeIds) {
        const target = findGoal(goalsRef.current, id);
        if (!target) continue;
        const activeTask = activeSessionRef.current
          ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
          : undefined;
        if (activeTask && (target.todayTaskId === activeTask.id || activeTask.goalNodeId === target.id)) continue;

        const masterSteps = target.steps ?? [];
        const slice = masterSteps.map((_, i) => i);
        const slicedStepLabels = slice.map((idx) => masterSteps[idx] ?? `Step ${idx + 1}`);
        const slicedDoneCount = countSlicedDone(target, undefined);

        const existing = target.todayTaskId
          ? tasksRef.current.find((task) => task.id === target.todayTaskId)
          : undefined;
        const rescheduled = existing
          ? rescheduleOpenBacklogTask(existing, targetDate)
          : null;
        const taskId = rescheduled?.id ?? uid('task');
        if (target.todayTaskId) {
          const old = existing;
          if (old && !isTaskComplete(old)) replaceIds.add(target.todayTaskId);
        }
        const plannedTask: Task = {
          ...(rescheduled ?? {}),
          id: taskId,
          title: target.title,
          description: target.description ?? '',
          priority: 'medium',
          targetDate,
          deadline: null,
          steps: slicedStepLabels,
          progress: slicedDoneCount,
          createdAt: rescheduled?.createdAt ?? Date.now(),
          order: rescheduled?.order ?? orderBase++,
          goalNodeId: target.id,
        };
        if (rescheduled) rescheduledTasks.set(rescheduled.id, plannedTask);
        else newTasks.push(plannedTask);
        patches.push({ id: target.id, taskId });
      }
      if (newTasks.length === 0 && rescheduledTasks.size === 0) return;
      setTasks((prev) => [
        ...prev
          .filter((task) => !replaceIds.has(task.id) || rescheduledTasks.has(task.id))
          .map((task) => rescheduledTasks.get(task.id) ?? task),
        ...newTasks,
      ]);
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
      if (activeSessionRef.current?.taskId === taskId) return;
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
      const linkedTask = node.todayTaskId
        ? tasksRef.current.find((task) => task.id === node.todayTaskId)
        : undefined;
      const existing = node.stepDone ?? node.steps.map(() => false);
      const newStepDone = [...existing];
      const markingDone = !newStepDone[stepIdx];
      newStepDone[stepIdx] = markingDone;
      const allDone = newStepDone.every(Boolean);
      clearRollupCache();
      setGoals((prev) =>
        prev.map((root) =>
          recomputeCompleted(updateNode(root, nodeId, (n) => ({ ...n, stepDone: newStepDone, completed: allDone }))),
        ),
      );
      const patched: GoalNode = { ...node, stepDone: newStepDone, completed: allDone };
      setTasks((prev) => syncLinkedTasksFromGoal(prev, patched));

      if (linkedTask && isMutableGoalPlan(linkedTask, patched)) {
        const localStepIndex = linkedTask.stepSlice
          ? linkedTask.stepSlice.indexOf(stepIdx)
          : stepIdx;
        if (localStepIndex >= 0) {
          const projectedProgress = linkedTask.stepSlice
            ? linkedTask.stepSlice.filter((index) => newStepDone[index]).length
            : newStepDone.filter(Boolean).length;
          if (markingDone) {
            recordManualSteps(
              linkedTask,
              [localStepIndex],
              projectedProgress >= (linkedTask.steps.length || 1),
            );
          } else {
            removeManualStepEvidence(linkedTask.id, [localStepIndex]);
          }
        }
      }

      if (markingDone) {
        if (allDone) hapticGoalComplete();
        else hapticTick();
      }
    },
    [setGoals, setTasks, recordManualSteps, removeManualStepEvidence],
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
      clearRollupCache();
      setGoals((prev) =>
        prev.map((root) =>
          recomputeCompleted(updateNode(root, nodeId, (target) => setSubtreeCompleted(target, nextCompleted))),
        ),
      );

      const walk = (n: GoalNode, acc: GoalNode[]) => {
        acc.push(n);
        n.children.forEach((c) => walk(c, acc));
      };
      const patchedNodes: GoalNode[] = [];
      walk(setSubtreeCompleted(node, nextCompleted), patchedNodes);
      setTasks((prev) => {
        let next = prev;
        for (const n of patchedNodes) next = syncLinkedTasksFromGoal(next, n);
        return next;
      });

      for (const patchedNode of patchedNodes) {
        if (!patchedNode.todayTaskId) continue;
        const linkedTask = tasksRef.current.find((task) => task.id === patchedNode.todayTaskId);
        if (!linkedTask || !isMutableGoalPlan(linkedTask, patchedNode)) continue;
        if (!nextCompleted) {
          removeManualStepEvidence(linkedTask.id);
          continue;
        }
        const remainingIndices = linkedTask.steps.length > 0
          ? linkedTask.steps.map((_, index) => index).filter((index) => index >= linkedTask.progress)
          : [0];
        recordManualSteps(linkedTask, remainingIndices, true);
      }
    },
    [setGoals, setTasks, recordManualSteps, removeManualStepEvidence],
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
      const selectedBranches: GoalNode[] = [];
      const recordsToStore: DeletedGoalRecord[] = [];

      for (const id of nodeIds) {
        const node = findGoal(goalsRef.current, id);
        if (!node) continue;
        selectedBranches.push(node);
        const subTaskIds = collectDescendantTaskIds(node);
        taskIdsToRemove.push(...subTaskIds);
        const associated = tasksRef.current.filter((t) => subTaskIds.includes(t.id));

        let parentRootId: string | null = null;
        let parentNodeId: string | null = null;
        for (const root of goalsRef.current) {
          const [found, parent] = findNode(root, id);
          if (!found) continue;
          parentRootId = root.id === id ? null : root.id;
          parentNodeId = parent?.id ?? null;
          break;
        }

        recordsToStore.push({
          id: uid('del'),
          node: cloneNode(node),
          deletedAt: Date.now(),
          parentRootId,
          parentNodeId,
          tasks: associated,
        });
      }

      const activeTask = activeSessionRef.current
        ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
        : undefined;
      if (activeTask && selectedBranches.some((branch) => goalBranchContainsTask(branch, activeTask))) return;

      if (recordsToStore.length > 0) {
        setRecentlyDeletedGoals((prev) => [...recordsToStore, ...prev].slice(0, 20));
        setLastDeletedNotification({ id: recordsToStore[0].id, title: `${recordsToStore.length} Goal Items` });
        hapticWarn();
      }

      if (taskIdsToRemove.length) {
        const removeTaskSet = new Set(taskIdsToRemove);
        setTasks((prev) => prev.filter((t) => !removeTaskSet.has(t.id)));
      }
      setGoals((prev) => prev.map((root) => removeNodes(root, idSet)).filter((r) => !idSet.has(r.id)));
    },
    [setGoals, setTasks, setRecentlyDeletedGoals],
  );

  const clearDeletedNotification = useCallback(() => {
    setLastDeletedNotification(null);
  }, []);

  const restoreDeletedGoal = useCallback(
    (recordId: string): boolean => {
      const record = recentlyDeletedGoals.find((r) => r.id === recordId);
      if (!record) return false;

      const restoredNode = cloneNode(record.node);

      if (record.parentRootId === null) {
        // Was a root-level goal — restore at root level
        setGoals((prev) => [...prev, restoredNode]);
      } else if (record.parentNodeId) {
        setGoals((prev) => {
          const parentExists = !!findGoal(prev, record.parentNodeId!);
          if (parentExists) {
            return prev.map((root) =>
              updateNode(root, record.parentNodeId!, (n) => ({ ...n, children: [...n.children, restoredNode] })),
            );
          }
          const rootExists = prev.some((root) => root.id === record.parentRootId);
          if (rootExists) {
            return prev.map((root) =>
              root.id === record.parentRootId
                ? { ...root, children: [...root.children, restoredNode] }
                : root,
            );
          }
          return [...prev, restoredNode];
        });
      } else {
        // Legacy records without parentNodeId — fall back to appending to root's direct children
        setGoals((prev) =>
          prev.map((root) =>
            root.id === record.parentRootId
              ? { ...root, children: [...root.children, restoredNode] }
              : root,
          ),
        );
      }

      if (record.tasks && record.tasks.length > 0) {
        setTasks((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const toAdd = record.tasks.filter((t) => !existingIds.has(t.id));
          return [...prev, ...toAdd];
        });
      }

      setRecentlyDeletedGoals((prev) => prev.filter((r) => r.id !== recordId));
      setLastDeletedNotification(null);
      clearRollupCache();
      return true;
    },
    [recentlyDeletedGoals, setGoals, setTasks, setRecentlyDeletedGoals],
  );

  const clearTrash = useCallback(() => {
    setRecentlyDeletedGoals([]);
  }, [setRecentlyDeletedGoals]);

  /* ── Session Timer callbacks ──────────────────────────────────────────── */

  const publishPublicPace = useCallback(async (historyOverride?: Record<string, TaskSession[]>) => {
    const userId = userIdRef.current;
    if (!userId) return;
    const sessions = Object.values(historyOverride ?? sessionHistoryRef.current).flat();
    await syncPublicPaceRow({
      userId,
      prefs: pacePrefsRef.current,
      sessions,
      streakMeta: streakMetaRef.current,
    });
  }, []);

  const updatePacePrefs = useCallback(
    (patch: Partial<PacePrefs>) => {
      setPacePrefs((prev) => {
        const next = sanitizePacePrefs({ ...prev, ...patch, updatedAt: Date.now() });
        pacePrefsRef.current = next;
        const userId = userIdRef.current;
        if (userId) {
          window.clearTimeout(paceCloudTimerRef.current);
          if (!next.optedIn) {
            void withdrawPublicPace(userId);
          } else {
            paceCloudTimerRef.current = window.setTimeout(() => {
              void syncPublicPaceRow({
                userId,
                prefs: pacePrefsRef.current,
                sessions: Object.values(sessionHistoryRef.current).flat(),
                streakMeta: streakMetaRef.current,
              });
            }, 450);
          }
        }
        return next;
      });
    },
    [setPacePrefs],
  );

  const persistActiveSession = useCallback(
    (
      outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] },
      options?: { endTime?: number; ignoreOpenPause?: boolean },
    ) => {
      const prev = activeSessionRef.current;
      if (!prev) return;
      const endAt = resolvePersistEndAt(prev, Date.now(), {
        userEnd: options?.endTime,
        clockIncident: hasClockIncident(),
      });
      const task = tasksRef.current.find((t) => t.id === prev.taskId);
      const record = finalizeSession(prev, endAt, outcome, task?.goalNodeId, {
        ignoreOpenPause: options?.ignoreOpenPause,
      });
      if (record) {
        const nextHist = {
          ...sessionHistoryRef.current,
          [record.taskId]: [...(sessionHistoryRef.current[record.taskId] ?? []), record],
        };
        sessionHistoryRef.current = nextHist;
        setSessionHistory(nextHist);
        void publishPublicPace(nextHist);
      }
      setActiveSession(null);
    },
    [setActiveSession, setSessionHistory, publishPublicPace],
  );

  const startSession = useCallback((taskId: string) => {
    const existing = activeSessionRef.current;
    if (existing?.taskId === taskId) return;
    if (existing) return;

    const task = tasksRef.current.find((t) => t.id === taskId);
    if (!task || isTaskComplete(task)) return;

    const now = Date.now();
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
  }, [setActiveSession]);

  const pauseSession = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev || prev.isPaused) return prev;
      if (!guardWallClock('guard')) return prev;
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
      if (!guardWallClock('guard')) return prev;
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
    (
      outcome: { completed: boolean | 'partial'; completedStepIndices?: number[] },
      options?: { endTime?: number; ignoreOpenPause?: boolean },
    ) => {
      const prev = activeSessionRef.current;
      if (!prev) return;
      persistActiveSession(outcome, options);

      setTasks((prevTasks) =>
        prevTasks.map((t) => {
          if (t.id !== prev.taskId) return t;
          if (outcome.completed === true) return clearBacklogIfComplete(t);
          if (t.originalTargetDate && (outcome.completed === false || outcome.completed === 'partial')) {
            if (!isTaskComplete({ ...t, progress: t.progress })) {
              return {
                ...t,
                targetDate: t.originalTargetDate,
                originalTargetDate: undefined,
              };
            }
          }
          return t;
        }),
      );
    },
    [persistActiveSession, setTasks],
  );

  const discardSession = useCallback(() => setActiveSession(null), [setActiveSession]);

  const continueInterruptedSession = useCallback(() => {
    if (!guardWallClock('resume')) return;
    const now = Date.now();
    setActiveSession((prev) => {
      if (!prev) return null;
      return continueAfterInterruption(prev, now);
    });
  }, [setActiveSession]);

  const heartbeatSession = useCallback(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    setActiveSession((prev) => {
      if (!prev) return prev;
      if (!guardWallClock('guard')) return prev;
      return tickActiveSession(prev, Date.now());
    });
  }, [setActiveSession]);

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;
    void pullNativeSession().then((session) => {
      if (cancelled || !session) return;
      setActiveSession(session);
    });
    void attachSessionNotificationActions((session) => {
      if (cancelled) return;
      setActiveSession(session);
    }).then((h) => {
      if (cancelled) {
        void h?.remove();
        return;
      }
      handle = h;
    });
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [setActiveSession]);

  const sessionTaskTitle = activeSession
    ? tasks.find((t) => t.id === activeSession.taskId)?.title
    : undefined;
  useEffect(() => {
    void syncSessionNotification(activeSession, sessionTaskTitle);
  }, [activeSession, sessionTaskTitle, activeSession?.isPaused, activeSession?.taskId]);

  const completeSessionSteps = useCallback(
    (taskId: string, stepIndices: number[]) => {
      const task = tasksRef.current.find((t) => t.id === taskId);
      if (!task) return;

      if (!task.goalNodeId) {
        if (task.steps.length === 0) {
          setTasks((prev) => prev.map((x) => (x.id === taskId ? clearBacklogIfComplete({ ...x, progress: 1 }) : x)));
          hapticSuccess();
          return;
        }
        if (stepIndices.length === 0) return;
        const next = Math.min(task.steps.length, Math.max(task.progress, Math.max(...stepIndices) + 1));
        setTasks((prev) => prev.map((x) => (x.id === taskId ? clearBacklogIfComplete({ ...x, progress: next }) : x)));
        if (next >= task.steps.length) hapticSuccess();
        else hapticTick();
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
            recomputeCompleted(
              updateNode(root, task.goalNodeId!, (n) => ({
                ...n,
                stepDone: newStepDone,
                completed: newStepDone.every(Boolean),
              })),
            ),
          ),
        );
      } else {
        // No steps — mark node completed
        setGoals((prev) =>
          prev.map((root) =>
            recomputeCompleted(updateNode(root, task.goalNodeId!, (n) => ({ ...n, completed: true }))),
          ),
        );
        newProgress = 1;
      }

      setTasks((prev) =>
        prev.map((x) => (x.id === taskId ? clearBacklogIfComplete({ ...x, progress: newProgress }) : x))
      );

      const nodeDone = hasSteps
        ? ((node.stepDone ?? node.steps!.map(() => false)).map((done, idx) => done || masterIndices.includes(idx)).every(Boolean))
        : true;
      const cardDone = task.steps.length === 0 || newProgress >= task.steps.length;
      if (nodeDone) hapticGoalComplete();
      else if (cardDone || stepIndices.length > 0) hapticSuccess();
    },
    [setGoals, setTasks],
  );

  /* ── Backup ───────────────────────────────────────────────────────────── */

  const exportBackup = useCallback(async (): Promise<string> => {
    const data = {
      app: 'YouDO',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      tasks: tasksRef.current,
      goals: goalsRef.current,
      sessionHistory: sessionHistoryRef.current,
      streakMeta: streakMetaRef.current,
      pacePrefs: pacePrefsRef.current,
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
  }, []);

  const importBackup = useCallback(
    (jsonData: string): boolean => {
      const parsed = parseBackupPayload(jsonData);
      if (!parsed) return false;
      if (activeSessionRef.current) return false;

      if (parsed.sessionHistory && typeof parsed.sessionHistory === 'object') {
        setSessionHistory(sanitizeSessionHistory(parsed.sessionHistory));
      }
      if (Array.isArray(parsed.recentlyDeletedGoals)) {
        setRecentlyDeletedGoals(parsed.recentlyDeletedGoals as DeletedGoalRecord[]);
      }
      const importedStreak = sanitizeStreakMeta(parsed.streakMeta, todayISO());
      if (importedStreak) setStreakMeta(importedStreak);
      if (parsed.pacePrefs) setPacePrefs(sanitizePacePrefs(parsed.pacePrefs));

      const { cleanedGoals, cleanedTasks } = sanitizeTreeAndTasks(parsed.goals, parsed.tasks);
      setTasks(cleanedTasks);
      setGoals(cleanedGoals);
      const stamp = parsed.updatedAt && parsed.updatedAt > 0 ? parsed.updatedAt : Date.now();
      workspaceUpdatedAtRef.current = stamp;
      writeWorkspaceUpdatedAt(stamp);
      clearRollupCache();
      return true;
    },
    [setTasks, setGoals, setSessionHistory, setRecentlyDeletedGoals, setStreakMeta, setPacePrefs],
  );

  const setStreakBarHours = useCallback(
    (hours: number) => {
      setStreakMeta((prev) => applyStreakBarHours(prev, hours, todayISO()));
    },
    [setStreakMeta],
  );

  const performCloudSync = useCallback(async (opts?: CloudSyncOptions): Promise<CloudSyncResult> => {
    const currentSlice = (): WorkspaceSlice => ({
      tasks: tasksRef.current,
      goals: goalsRef.current,
      sessionHistory: sessionHistoryRef.current,
      recentlyDeletedGoals: recentlyDeletedRef.current as TrashRecord[],
      streakMeta: streakMetaRef.current,
      pacePrefs: pacePrefsRef.current,
      updatedAt: workspaceUpdatedAtRef.current,
    });
    const remoteInfo = await fetchLiveBackupInfo();
    const remoteParsed = remoteInfo ? parseBackupPayload(remoteInfo.backupData) : null;
    const remoteSlice: WorkspaceSlice | null = remoteParsed
      ? {
          tasks: remoteParsed.tasks,
          goals: remoteParsed.goals,
          sessionHistory: sanitizeSessionHistory(remoteParsed.sessionHistory),
          recentlyDeletedGoals: Array.isArray(remoteParsed.recentlyDeletedGoals)
            ? (remoteParsed.recentlyDeletedGoals as TrashRecord[])
            : [],
          streakMeta: sanitizeStreakMeta(remoteParsed.streakMeta, todayISO()),
          pacePrefs: sanitizePacePrefs(remoteParsed.pacePrefs),
          updatedAt: remoteParsed.updatedAt ?? 0,
        }
      : null;
    let localSlice = currentSlice();
    let localFingerprint = canonicalWorkspaceFingerprint(localSlice, todayISO());
    const remoteFingerprint = remoteSlice
      ? canonicalWorkspaceFingerprint(remoteSlice, todayISO())
      : null;
    const baseFingerprint = readWorkspaceCloudFingerprint();
    const localEmpty = localSlice.tasks.length === 0 && localSlice.goals.length === 0;

    const applySlice = (next: WorkspaceSlice) => {
      tasksRef.current = next.tasks;
      goalsRef.current = next.goals;
      sessionHistoryRef.current = next.sessionHistory;
      recentlyDeletedRef.current = next.recentlyDeletedGoals as typeof recentlyDeletedRef.current;
      if (next.streakMeta) {
        streakMetaRef.current = next.streakMeta;
        setStreakMeta(next.streakMeta);
      }
      if (next.pacePrefs) {
        pacePrefsRef.current = next.pacePrefs;
        setPacePrefs(next.pacePrefs);
      }
      if (next.updatedAt) {
        workspaceUpdatedAtRef.current = next.updatedAt;
        writeWorkspaceUpdatedAt(next.updatedAt);
      }
      setTasks(next.tasks);
      setGoals(next.goals);
      setSessionHistory(next.sessionHistory);
      setRecentlyDeletedGoals(next.recentlyDeletedGoals as typeof recentlyDeletedGoals);
    };

    const pullRemote = (): { ok: boolean; error?: string } => {
      if (!remoteInfo || !remoteSlice || !remoteFingerprint) return { ok: false, error: 'No valid cloud copy was found.' };
      if (activeSessionRef.current) return { ok: false, error: 'End the current sitting before replacing this device workspace.' };
      applySlice(remoteSlice);
      writeWorkspaceCloudFingerprint(remoteFingerprint);
      setCloudSyncConflict(false);
      return { ok: true };
    };

    const pushCurrent = async () => {
      const payload = {
        app: 'YouDO',
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        updatedAt: workspaceUpdatedAtRef.current || Date.now(),
        tasks: tasksRef.current,
        goals: goalsRef.current,
        sessionHistory: sessionHistoryRef.current,
        recentlyDeletedGoals: recentlyDeletedRef.current,
        streakMeta: streakMetaRef.current,
        pacePrefs: pacePrefsRef.current,
      };
      const fingerprint = canonicalWorkspaceFingerprint(payload, todayISO());
      const result = await updateCloudBackup(payload, { expectedUpdatedAt: remoteInfo?.updatedAt ?? null });
      if (result.ok) {
        writeWorkspaceCloudFingerprint(fingerprint);
        setCloudSyncConflict(false);
        return result;
      }
      const raced = /changed on another device|created on another device/i.test(result.error ?? '');
      if (raced) setCloudSyncConflict(true);
      return { ...result, conflict: raced || undefined };
    };

    let decision = decideSyncAction({
      localFingerprint,
      remoteFingerprint,
      baseFingerprint,
      localEmpty,
      allowEmpty: opts?.allowEmpty,
      conflictStrategy: opts?.conflictStrategy,
    });

    // v6.1.1 stored fingerprints before canonical cloud normalization. During
    // the one-time migration, honor a conclusive legacy comparison and then
    // replace it with the canonical fingerprint after this sync succeeds.
    if (decision === 'conflict' && baseFingerprint) {
      const legacyLocalFingerprint = workspaceFingerprint(localSlice);
      const legacyRemoteFingerprint = remoteSlice ? workspaceFingerprint(remoteSlice) : null;
      const legacyDecision = decideSyncAction({
        localFingerprint: legacyLocalFingerprint,
        remoteFingerprint: legacyRemoteFingerprint,
        baseFingerprint,
        localEmpty,
        allowEmpty: opts?.allowEmpty,
        conflictStrategy: opts?.conflictStrategy,
      });
      if (legacyDecision !== 'conflict') decision = legacyDecision;
    }

    if (decision === 'noop') {
      writeWorkspaceCloudFingerprint(remoteFingerprint!);
      setCloudSyncConflict(false);
      return { ok: true };
    }
    if (decision === 'pull') return pullRemote();
    if (decision === 'push') return pushCurrent();
    if (decision === 'empty-error') {
      return { ok: false, error: 'This device is empty. Restore from cloud, or tap Clear cloud backup if you meant to wipe it.' };
    }
    if (decision === 'merge') {
      if (!remoteSlice) return { ok: false, error: 'No valid cloud copy was found to combine.' };
      const merged = mergeWorkspace(localSlice, remoteSlice);
      const runningTaskId = activeSessionRef.current?.taskId;
      if (runningTaskId) {
        const localRunningTask = localSlice.tasks.find((task) => task.id === runningTaskId);
        const mergedRunningTask = merged.tasks.find((task) => task.id === runningTaskId);
        if (!localRunningTask || !mergedRunningTask || !sameTasks([localRunningTask], [mergedRunningTask])) {
          return { ok: false, error: 'End the current sitting before combining workspace changes.' };
        }
      }
      applySlice(merged);
      localSlice = currentSlice();
      localFingerprint = canonicalWorkspaceFingerprint(localSlice, todayISO());
      if (localFingerprint === remoteFingerprint) {
        writeWorkspaceCloudFingerprint(remoteFingerprint);
        setCloudSyncConflict(false);
        return { ok: true };
      }
      return pushCurrent();
    }
    setCloudSyncConflict(true);
    return {
      ok: false,
      conflict: true,
      error: !remoteSlice
        ? 'The cloud copy disappeared. This device was preserved; review before recreating cloud data.'
        : baseFingerprint
          ? 'Sync paused: this device and another device both changed. Nothing was overwritten.'
          : 'Sync paused for a one-time safety check because this device and cloud contain different work.',
    };
  }, [updateCloudBackup, fetchLiveBackupInfo, setTasks, setGoals, setSessionHistory, setRecentlyDeletedGoals, setStreakMeta, setPacePrefs]);

  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncToCloud = useCallback((opts?: CloudSyncOptions): Promise<CloudSyncResult> => {
    const run = syncQueueRef.current.then(
      () => performCloudSync(opts),
      () => performCloudSync(opts),
    );
    syncQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, [performCloudSync]);

  const restoreFromCloud = useCallback(async (): Promise<boolean> => {
    const jsonStr = await fetchCloudBackup();
    if (!jsonStr) return false;
    try {
      const parsed = parseBackupPayload(jsonStr);
      if (!parsed) return false;
      const ok = importBackup(jsonStr);
      if (ok) {
        writeWorkspaceCloudFingerprint(workspaceFingerprint({
          tasks: parsed.tasks,
          goals: parsed.goals,
          sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
          recentlyDeletedGoals: Array.isArray(parsed.recentlyDeletedGoals)
            ? (parsed.recentlyDeletedGoals as TrashRecord[])
            : [],
          streakMeta: sanitizeStreakMeta(parsed.streakMeta, todayISO()),
          pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
        }));
        setCloudSyncConflict(false);
      }
      return ok;
    } catch {
      return false;
    }
  }, [fetchCloudBackup, importBackup]);

  const restoreFromVisitSnapshot = useCallback(async (snapshotId: string): Promise<boolean> => {
    const jsonStr = await fetchVisitSnapshot(snapshotId);
    if (!jsonStr) return false;
    try {
      const parsed = parseBackupPayload(jsonStr);
      if (!parsed) return false;
      const ok = importBackup(jsonStr);
      if (ok) {
        // This restored copy intentionally differs from live cloud; the next sync must review it.
        setCloudSyncConflict(true);
      }
      return ok;
    } catch {
      return false;
    }
  }, [fetchVisitSnapshot, importBackup]);

  const listCloudRestorePoints = useCallback(async () => {
    const [live, visits] = await Promise.all([fetchLiveBackupInfo(), listVisitSnapshots()]);
    const visitsWithSummary = await Promise.all(
      visits.map(async (visit) => {
        const backupData = await fetchVisitSnapshot(visit.id);
        return { ...visit, summary: backupData ? summarizeBackupPayload(backupData) : null };
      }),
    );
    return {
      live: live
        ? { updatedAt: live.updatedAt, summary: summarizeBackupPayload(live.backupData) }
        : null,
      visits: visitsWithSummary,
    };
  }, [fetchLiveBackupInfo, listVisitSnapshots, fetchVisitSnapshot]);

  const pruneOldSessions = useCallback((): number => {
    const cutoff = Date.now() - SESSION_HISTORY_KEEP_MS;
    const prev = sessionHistoryRef.current;
    const next = pruneSessionHistoryBefore(prev, cutoff);
    const before = Object.values(prev).reduce((n, rows) => n + rows.length, 0);
    const after = Object.values(next).reduce((n, rows) => n + rows.length, 0);
    if (before === after) return 0;
    setSessionHistory(next);
    return before - after;
  }, [setSessionHistory]);

  // Reconcile against the cloud on auth change. syncToCloud only pushes when
  // this device is the sole editor; concurrent edits pause instead of overwriting.
  useEffect(() => {
    if (!user) return;
    void syncToCloud();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Automatic reconciliation: debounced 2s after any data change.
  // syncToCloud is intentionally excluded from deps — it is a stable useCallback ref
  // and including it would cause the effect to re-trigger after each cloud merge,
  // creating a loop. Persisted fingerprints prevent redundant writes and detect two-device edits.
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => { syncToCloud(); }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, tasks, goals, sessionHistory, recentlyDeletedGoals, streakMeta, pacePrefs]);

  // Retry the local-first workspace as soon as connectivity returns. A failed
  // attempt never clears local data; normal merge safeguards still apply.
  useEffect(() => {
    if (!user) return;
    const handleOnline = () => { void syncToCloud(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [user, syncToCloud]);

  // Reconcile when the app returns to the foreground, before a stale device
  // becomes the next editor. A light periodic check also keeps an open desktop
  // copy aware of work completed on the phone.
  useEffect(() => {
    if (!user) return;
    let lastAttemptAt = 0;
    const reconcileVisible = () => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastAttemptAt < 1_500) return;
      lastAttemptAt = now;
      void syncToCloud();
    };
    const handleVisibility = () => reconcileVisible();
    window.addEventListener('focus', reconcileVisible);
    window.addEventListener('pageshow', reconcileVisible);
    document.addEventListener('visibilitychange', handleVisibility);
    const interval = window.setInterval(reconcileVisible, 30_000);
    return () => {
      window.removeEventListener('focus', reconcileVisible);
      window.removeEventListener('pageshow', reconcileVisible);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.clearInterval(interval);
    };
  }, [user, syncToCloud]);

  const dataValue = useMemo<DataStore>(
    () => ({
      tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode, applyGoalTreeChange, undoGoalTreeChange,
      recentlyDeletedGoals, lastDeletedNotification, clearDeletedNotification, restoreDeletedGoal, clearTrash,
      reorderGoalNodes, moveGoalNode, toggleNodeCompletion,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard, deleteGoalNodes,
      exportBackup, importBackup, syncToCloud, cloudSyncConflict, restoreFromCloud, restoreFromVisitSnapshot, listCloudRestorePoints,
      pruneOldSessions,
      sessionHistory,
      completeSessionSteps,
      streakMeta,
      setStreakMeta,
      setStreakBarHours,
      pacePrefs,
      updatePacePrefs,
      publishPublicPace,
    }),
    [tasks, goals, addTask, duplicateTask, advance, undo, removeTask, reorder,
      addGoalRoot, addChildNode, updateGoalNode, deleteGoalNode, applyGoalTreeChange, undoGoalTreeChange, deleteGoalNodes,
      recentlyDeletedGoals, lastDeletedNotification, clearDeletedNotification, restoreDeletedGoal, clearTrash,
      reorderGoalNodes, moveGoalNode, toggleNodeCompletion,
      planTask, planBatch, unlinkTask, toggleGoalStep, togglePin,
      copyGoalNode, copyGoalNodes, pasteGoalNode, clipboard, clearClipboard,
      exportBackup, importBackup, syncToCloud, cloudSyncConflict, restoreFromCloud, restoreFromVisitSnapshot, listCloudRestorePoints,
      pruneOldSessions,
      sessionHistory, completeSessionSteps, streakMeta, setStreakMeta, setStreakBarHours,
      pacePrefs, updatePacePrefs, publishPublicPace],
  );

  const sessionValue = useMemo<SessionStore>(
    () => ({
      activeSession,
      startSession, pauseSession, resumeSession, stopSession,
      discardSession, continueInterruptedSession, heartbeatSession,
    }),
    [activeSession, startSession, pauseSession, resumeSession, stopSession,
      discardSession, continueInterruptedSession, heartbeatSession],
  );

  return (
    <DataCtx.Provider value={dataValue}>
      <SessionCtx.Provider value={sessionValue}>{children}</SessionCtx.Provider>
    </DataCtx.Provider>
  );
}

