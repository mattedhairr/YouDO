import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { ActiveSession, GoalNode, SessionStopOutcome, Task, TaskSession } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSessionJournal } from './hooks/useSessionJournal';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useAuth } from './contexts/AuthContext';
import { parseBackupPayload, summarizeBackupPayload, type BackupSummary } from './lib/backup';
import { clockIncidentBoundary, guardWallClock, hasClockIncident } from './lib/deviceClock';
import { formatWallClock } from './lib/format';
import {
  finalizeSession,
  tickActiveSession,
  pauseActiveSession,
  resumeActiveSession,
  continueAfterInterruption,
  createManualStepSession,
  resolvePersistEndAt,
  isManualSession,
  sanitizeSessionHistory,
  pruneSessionHistoryBefore,
  SESSION_HISTORY_KEEP_MS,
} from './lib/sessionStats';
import { attachSessionNotificationActions, pullNativeSession, syncSessionNotification } from './lib/sessionNotification';
import { nativeSessionIsFinished, persistSessionRecord, selectNativeSession } from './lib/sessionPersistence';
import {
  clearRollupCache,
  cloneNode,
  duplicateTaskAsFresh,
  findGoal,
  findNode,
  goalBranchContainsTask,
  isGoalEndpoint,
  isMutableGoalPlan,
  isTaskComplete,
  clearBacklogIfComplete,
  restoreBacklogIfIncomplete,
  moveNodeInArray,
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
  isStoredTaskList,
  isStoredGoalTree,
  isStoredSessionHistory,
  WORKSPACE_ALIAS_KEYS,
} from './lib/storageKeys';
import { commitWorkspaceMutation, prepareSettingsImport } from './lib/workspaceReplacement';
import { mergeWorkspace, workspaceFingerprint, workspaceSignature, type TrashRecord, type WorkspaceSlice } from './lib/syncMerge';
import { decideSyncAction, isWorkspaceEffectivelyEmpty, type SyncConflictStrategy } from './lib/syncDecision';
import { canonicalWorkspaceFingerprint } from './lib/syncPayload';
import { advanceDeletionLedger, isDeletionLedger, type DeletionMarker } from './lib/deletionLedger';
import { parseSyncConflictRecord, type SyncConflictKind, type SyncConflictRecord } from './lib/syncConflictRecord';
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
import { topStudioSelection } from './lib/studioWorkspace';
import {
  activePlansForDeletedBranch,
  appendGoalChild,
  buildGoalPlanTask,
  goalDeletionLocation,
  isValidGoalPlanSlice,
  removeGoalBranch,
  rescheduleExistingGoalPlan,
  restoreDeletedBranch,
  type DeletedBranchSnapshot,
} from './lib/planningIntegrity';

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
  goalNodeRole,
  hasGoalExecutionState,
  isGoalEndpoint,
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

export interface DeletedGoalRecord extends DeletedBranchSnapshot {
  id: string;
  deletedAt: number;
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
  /** Toggle completed status of any goal-tree item. */
  toggleNodeCompletion: (nodeId: string) => void;

  /** Plan a goal-tree endpoint task to a specific date, optionally with a checklist slice. */
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
  workspaceStorageError: string;
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
  sessionStorageError: string;
  nativeSessionReady: boolean;
  /** Full session history keyed by taskId */
  sessionHistory: Record<string, TaskSession[]>;
  /** Start a new session only if no session is already active. */
  startSession: (taskId: string) => void;
  /** Pause the active session */
  pauseSession: () => void;
  /** Resume a paused session */
  resumeSession: () => void;
  /** Stop the active session and record to history */
  stopSession: (
    outcome: SessionStopOutcome,
    options?: { endTime?: number; ignoreOpenPause?: boolean; taskId?: string },
  ) => { ok: boolean; error?: string };
  /** Discard the active session without saving to history */
  discardSession: () => boolean;
  /** Resume an interrupted sitting, keeping at most four hours before return */
  continueInterruptedSession: () => boolean;
  /** Heartbeat — update lastHeartbeat timestamp (call every 30s) */
  heartbeatSession: () => void;
  /** Mark specified step indices done and sync back to GoalBlueprint */
  completeSessionSteps: (taskId: string, stepIndices: number[]) => void;
}

type DataStore = Omit<
  Store,
  | 'activeSession'
  | 'sessionStorageError'
  | 'nativeSessionReady'
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
  | 'sessionStorageError'
  | 'nativeSessionReady'
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
const atomicStorage = { persist: false, listen: false, strict: true } as const;
const isArray = (value: unknown) => Array.isArray(value);
const isRecord = (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value);

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user, updateCloudBackup, fetchCloudBackup, fetchLiveBackupInfo, listVisitSnapshots, fetchVisitSnapshot } = useAuth();
  const [tasks, setTasks] = useLocalStorage<Task[]>(STORAGE_KEYS.tasks, SEED_TASKS, { ...atomicStorage, validate: isStoredTaskList });
  const [goals, setGoals] = useLocalStorage<GoalNode[]>(STORAGE_KEYS.goals, SEED_GOALS, { ...atomicStorage, validate: isStoredGoalTree });
  const [recentlyDeletedGoals, setRecentlyDeletedGoals] = useLocalStorage<DeletedGoalRecord[]>(STORAGE_KEYS.deletedGoals, [], { ...atomicStorage, validate: isArray });
  const [deletionLedger, setDeletionLedger] = useLocalStorage<DeletionMarker[]>(STORAGE_KEYS.deletionLedger, [], { ...atomicStorage, validate: isDeletionLedger });
  const [lastDeletedNotification, setLastDeletedNotification] = useState<{ id: string; title: string } | null>(null);
  const { activeSession, activeSessionRef, setActiveSession, clearRecordedSession, sessionStorageError } = useSessionJournal();
  const [nativeSessionReady, setNativeSessionReady] = useState(!Capacitor.isNativePlatform());
  const [nativeSessionError, setNativeSessionError] = useState('');
  const [sessionHistory, setSessionHistory] = useLocalStorage<Record<string, TaskSession[]>>(STORAGE_KEYS.sessionHistory, {}, { ...atomicStorage, validate: isStoredSessionHistory });
  const [streakMeta, setStreakMeta] = useLocalStorage<StreakMeta>(
    STORAGE_KEYS.streakMeta,
    defaultStreakMeta(todayISO()), { ...atomicStorage, validate: isRecord },
  );
  const [pacePrefs, setPacePrefs] = useLocalStorage<PacePrefs>(STORAGE_KEYS.pacePrefs, defaultPacePrefs(), { ...atomicStorage, validate: isRecord });
  const [cloudSyncConflict, setCloudSyncConflict] = useState(false);
  const [workspaceStorageError, setWorkspaceStorageError] = useState('');
  const [workspaceRecoveryBlocked, setWorkspaceRecoveryBlocked] = useState(false);

  useEffect(() => {
    if (!user?.id) { setCloudSyncConflict(false); return; }
    try {
      setCloudSyncConflict(Boolean(parseSyncConflictRecord(localStorage.getItem(STORAGE_KEYS.workspaceSyncConflict), user.id)));
    } catch {
      setWorkspaceStorageError('The saved cloud conflict could not be read. Keep app data intact and retry.');
    }
  }, [user?.id]);

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
  const workspaceScopeRef = useRef(0);
  useEffect(() => () => { workspaceScopeRef.current++; }, []);
  const paceCloudTimerRef = useRef<number>(0);
  const recentlyDeletedRef = useRef(recentlyDeletedGoals);
  recentlyDeletedRef.current = recentlyDeletedGoals;
  const deletionLedgerRef = useRef(deletionLedger);
  deletionLedgerRef.current = deletionLedger;
  // A crash between saving history and clearing the timer must not restart
  // an already recorded sitting on the next launch.
  useEffect(() => {
    if (activeSession && nativeSessionIsFinished(activeSession, sessionHistory)) {
      clearRecordedSession();
    }
  }, [activeSession, sessionHistory, clearRecordedSession]);
  const goalTreeTransactionsRef = useRef(new Map<string, {
    beforeGoals: GoalNode[];
    beforeTasks: Task[];
    afterGoals: GoalNode[];
    afterTasks: Task[];
  }>());
  const workspaceUpdatedAtRef = useRef(readWorkspaceUpdatedAt());
  const persistedWorkspaceRef = useRef({ tasks, goals, recentlyDeletedGoals, deletionLedger, sessionHistory, streakMeta, pacePrefs });
  useLayoutEffect(() => {
    const saved = persistedWorkspaceRef.current;
    if (saved.tasks === tasks && saved.goals === goals && saved.recentlyDeletedGoals === recentlyDeletedGoals
      && saved.deletionLedger === deletionLedger && saved.sessionHistory === sessionHistory && saved.streakMeta === streakMeta && saved.pacePrefs === pacePrefs) return;
    const stamp = Date.now();
    const candidateLedger = saved.tasks === tasks && saved.goals === goals
      ? saved.deletionLedger
      : advanceDeletionLedger(saved.deletionLedger, { tasks: saved.tasks, goals: saved.goals }, { tasks, goals }, stamp);
    const nextLedger = JSON.stringify(candidateLedger) === JSON.stringify(saved.deletionLedger) ? saved.deletionLedger : candidateLedger;
    try {
      commitWorkspaceMutation({
        ...(saved.tasks !== tasks ? { [STORAGE_KEYS.tasks]: JSON.stringify(tasks) } : {}),
        ...(saved.goals !== goals ? { [STORAGE_KEYS.goals]: JSON.stringify(goals) } : {}),
        ...(saved.recentlyDeletedGoals !== recentlyDeletedGoals ? { [STORAGE_KEYS.deletedGoals]: JSON.stringify(recentlyDeletedGoals) } : {}),
        ...(saved.deletionLedger !== nextLedger ? { [STORAGE_KEYS.deletionLedger]: JSON.stringify(nextLedger) } : {}),
        ...(saved.sessionHistory !== sessionHistory ? { [STORAGE_KEYS.sessionHistory]: JSON.stringify(sessionHistory) } : {}),
        ...(saved.streakMeta !== streakMeta ? { [STORAGE_KEYS.streakMeta]: JSON.stringify(streakMeta) } : {}),
        ...(saved.pacePrefs !== pacePrefs ? { [STORAGE_KEYS.pacePrefs]: JSON.stringify(pacePrefs) } : {}),
        // Retire old aliases only in the same recoverable operation that writes
        // their canonical collections; a failed save must keep the old copy.
        ...(saved.tasks !== tasks ? { [WORKSPACE_ALIAS_KEYS[0]]: null } : {}),
        ...(saved.goals !== goals ? { [WORKSPACE_ALIAS_KEYS[1]]: null } : {}),
        [STORAGE_KEYS.workspaceUpdatedAt]: String(stamp),
      });
      persistedWorkspaceRef.current = { tasks, goals, recentlyDeletedGoals, deletionLedger: nextLedger, sessionHistory, streakMeta, pacePrefs };
      if (nextLedger !== deletionLedger) {
        deletionLedgerRef.current = nextLedger;
        setDeletionLedger(nextLedger);
      }
      workspaceUpdatedAtRef.current = stamp;
      setWorkspaceStorageError('');
    } catch (cause) {
      setWorkspaceStorageError(cause instanceof Error ? cause.message : 'This change could not be saved on this device.');
      try { setWorkspaceRecoveryBlocked(localStorage.getItem(STORAGE_KEYS.workspaceReplacement) !== null); }
      catch { setWorkspaceRecoveryBlocked(true); }
      tasksRef.current = saved.tasks;
      goalsRef.current = saved.goals;
      sessionHistoryRef.current = saved.sessionHistory;
      recentlyDeletedRef.current = saved.recentlyDeletedGoals;
      deletionLedgerRef.current = saved.deletionLedger;
      streakMetaRef.current = saved.streakMeta;
      pacePrefsRef.current = saved.pacePrefs;
      setTasks(saved.tasks);
      setGoals(saved.goals);
      setRecentlyDeletedGoals(saved.recentlyDeletedGoals);
      setDeletionLedger(saved.deletionLedger);
      setSessionHistory(saved.sessionHistory);
      setStreakMeta(saved.streakMeta);
      setPacePrefs(saved.pacePrefs);
      setLastDeletedNotification(null);
    }
  }, [tasks, goals, recentlyDeletedGoals, deletionLedger, sessionHistory, streakMeta, pacePrefs, setTasks, setGoals, setRecentlyDeletedGoals, setDeletionLedger, setSessionHistory, setStreakMeta, setPacePrefs]);

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
      if (activeSessionRef.current?.taskId === id) return;
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
    [activeSessionRef, setTasks, setGoals, recordManualSteps],
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
  }, [activeSessionRef, setTasks]);

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
      setGoals((prev) => appendGoalChild(prev, parentId, node));
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

      if (activeSessionRef.current) {
        const activeTaskId = activeSessionRef.current.taskId;
        const currentActiveTask = currentTasks.find((task) => task.id === activeTaskId);
        const nextActiveTask = nextTasks.find((task) => task.id === activeTaskId);
        if (!currentActiveTask || !nextActiveTask || !sameTasks([currentActiveTask], [nextActiveTask])) {
          return { ok: false, error: 'active-session' };
        }
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
    [activeSessionRef, setGoals, setTasks],
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
      const location = goalDeletionLocation(goalsRef.current, rootId, nodeId);
      if (!location) return;
      const { node, parentRootId, parentNodeId } = location;
      const activeTask = activeSessionRef.current
        ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
        : undefined;
      if (activeTask && goalBranchContainsTask(node, activeTask)) return;
      const associatedTasks = activePlansForDeletedBranch(node, tasksRef.current);

      const record: DeletedGoalRecord = {
        id: uid('del'),
        node,
        deletedAt: Date.now(),
        parentRootId,
        parentNodeId,
        tasks: associatedTasks,
        linkageVersion: 1,
      };

      setRecentlyDeletedGoals((prev) => [record, ...prev].slice(0, 20));
      setLastDeletedNotification({ id: record.id, title: node.title });
      hapticWarn();

      if (associatedTasks.length > 0) {
        const removeSet = new Set(associatedTasks.map((task) => task.id));
        setTasks((prev) => prev.filter((t) => !removeSet.has(t.id)));
      }
      setGoals((prev) => removeGoalBranch(prev, rootId, nodeId));
    },
    [activeSessionRef, setGoals, setTasks, setRecentlyDeletedGoals],
  );

  /* ---------- Plan task (push to a date) ---------- */

  const planTask = useCallback(
    (nodeId: string, targetDate: string, stepSlice?: number[]) => {
      const target = findGoal(goalsRef.current, nodeId);
      if (!target || target.kind === 'goal' || !isGoalEndpoint(target)) return;
      const activeTask = activeSessionRef.current
        ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
        : undefined;
      if (activeTask && (target.todayTaskId === activeTask.id || activeTask.goalNodeId === target.id)) return;

      const masterSteps = target.steps ?? [];
      const slice = stepSlice ?? masterSteps.map((_, i) => i);
      if (!isValidGoalPlanSlice(target, slice)) return;
      const existing = target.todayTaskId
        ? tasksRef.current.find((task) => task.id === target.todayTaskId && task.goalNodeId === target.id)
        : undefined;
      const rescheduled = existing
        ? rescheduleExistingGoalPlan(existing, targetDate, todayISO())
        : null;
      const taskId = rescheduled?.id ?? uid('task');
      const taskBase = buildGoalPlanTask(
        target, targetDate, slice, rescheduled, taskId,
        rescheduled?.order ?? tasksRef.current.length,
        rescheduled?.createdAt ?? Date.now(),
      );

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
          if (old && old.goalNodeId === target.id && !isTaskComplete(old)) {
            filtered = prev.filter((t) => t.id !== target.todayTaskId);
          }
        }
        return [...filtered, { ...taskBase, order: filtered.length }];
      });
      setGoals((prev) =>
        prev.map((root) => updateNode(root, target.id, (n) => ({ ...n, todayTaskId: taskId }))),
      );
    },
    [activeSessionRef, setTasks, setGoals],
  );

  const planBatch = useCallback(
    (nodeIds: string[], targetDate: string) => {
      const newTasks: Task[] = [];
      const rescheduledTasks = new Map<string, Task>();
      const patches: { id: string; taskId: string }[] = [];
      let orderBase = tasksRef.current.length;
      const replaceIds = new Set<string>();
      for (const id of new Set(nodeIds)) {
        const target = findGoal(goalsRef.current, id);
        if (!target || target.kind === 'goal' || !isGoalEndpoint(target)) continue;
        const activeTask = activeSessionRef.current
          ? tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId)
          : undefined;
        if (activeTask && (target.todayTaskId === activeTask.id || activeTask.goalNodeId === target.id)) continue;

        const masterSteps = target.steps ?? [];
        const slice = masterSteps.map((_, i) => i);

        const existing = target.todayTaskId
          ? tasksRef.current.find((task) => task.id === target.todayTaskId && task.goalNodeId === target.id)
          : undefined;
        const rescheduled = existing
          ? rescheduleExistingGoalPlan(existing, targetDate, todayISO())
          : null;
        const taskId = rescheduled?.id ?? uid('task');
        if (target.todayTaskId) {
          const old = existing;
          if (old && !isTaskComplete(old)) replaceIds.add(target.todayTaskId);
        }
        const plannedTask = buildGoalPlanTask(
          target, targetDate, slice, rescheduled, taskId,
          rescheduled?.order ?? orderBase++,
          rescheduled?.createdAt ?? Date.now(),
        );
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
    [activeSessionRef, setTasks, setGoals],
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
    [activeSessionRef, setTasks, setGoals],
  );

  const toggleGoalStep = useCallback(
    (nodeId: string, stepIdx: number) => {
      const node = findGoal(goalsRef.current, nodeId);
      if (!node || !node.steps) return;
      const running = tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId);
      if (running && goalBranchContainsTask(node, running)) return;
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
    [activeSessionRef, setGoals, setTasks, recordManualSteps, removeManualStepEvidence],
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

      const running = tasksRef.current.find((task) => task.id === activeSessionRef.current?.taskId);
      if (running && goalBranchContainsTask(node, running)) return;

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
    [activeSessionRef, setGoals, setTasks, recordManualSteps, removeManualStepEvidence],
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
        setGoals((prev) => clones.reduce((next, clone) => appendGoalChild(next, parentId, clone), prev));
      }
    },
    [clipboard, setGoals],
  );

  const clearClipboard = useCallback(() => setClipboard([]), []);

  const deleteGoalNodes = useCallback(
    (nodeIds: string[]) => {
      const selectedIds = topStudioSelection(goalsRef.current, nodeIds);
      const idSet = new Set(selectedIds);
      const taskIdsToRemove: string[] = [];
      const selectedBranches: GoalNode[] = [];
      const recordsToStore: DeletedGoalRecord[] = [];

      for (const id of selectedIds) {
        const node = findGoal(goalsRef.current, id);
        if (!node) continue;
        selectedBranches.push(node);
        const associated = activePlansForDeletedBranch(node, tasksRef.current);
        taskIdsToRemove.push(...associated.map((task) => task.id));

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
          node,
          deletedAt: Date.now(),
          parentRootId,
          parentNodeId,
          tasks: associated,
          linkageVersion: 1,
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
      setGoals((prev) => prev.map((root) => recomputeCompleted(removeNodes(root, idSet))).filter((r) => !idSet.has(r.id)));
    },
    [activeSessionRef, setGoals, setTasks, setRecentlyDeletedGoals],
  );

  const clearDeletedNotification = useCallback(() => {
    setLastDeletedNotification(null);
  }, []);

  const restoreDeletedGoal = useCallback(
    (recordId: string): boolean => {
      const record = recentlyDeletedGoals.find((r) => r.id === recordId);
      if (!record) return false;
      const restored = restoreDeletedBranch(goalsRef.current, tasksRef.current, record);
      if (!restored) return false;
      setGoals(restored.goals);
      setTasks(restored.tasks);

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
      outcome: SessionStopOutcome,
      options?: { endTime?: number; ignoreOpenPause?: boolean; taskId?: string },
    ) => {
      const prev = activeSessionRef.current;
      if (!prev || (options?.taskId && prev.taskId !== options.taskId)) {
        return { ok: false, error: 'This sitting is no longer active. No completion was applied.' };
      }
      const endAt = resolvePersistEndAt(prev, Date.now(), {
        userEnd: options?.endTime,
        clockIncident: hasClockIncident(),
        recordedBoundary: clockIncidentBoundary(prev.lastHeartbeat || prev.startTime),
      });
      const task = tasksRef.current.find((t) => t.id === prev.taskId);
      const record = finalizeSession(prev, endAt, outcome, task?.goalNodeId, {
        ignoreOpenPause: options?.ignoreOpenPause,
      });
      if (!record) return { ok: false, error: 'There is not enough recorded time to save this sitting yet. Keep it open, or discard it explicitly. If device time changed, review the interrupted sitting first.' };
      if (record) {
        let nextHist: Record<string, TaskSession[]>;
        try {
          nextHist = persistSessionRecord(sessionHistoryRef.current, record);
        } catch {
          return { ok: false, error: 'Could not save focus time on this device. The sitting is still open. Free some device storage and retry; do not clear YouDO data.' };
        }
        sessionHistoryRef.current = nextHist;
        // The session ledger was already written synchronously. Do not roll it
        // back in memory if a later Goals/Today save cannot fit on the device.
        persistedWorkspaceRef.current = { ...persistedWorkspaceRef.current, sessionHistory: nextHist };
        setSessionHistory(nextHist);
        void publishPublicPace(nextHist);
      }
      clearRecordedSession();
      return { ok: true };
    },
    [activeSessionRef, clearRecordedSession, setSessionHistory, publishPublicPace],
  );

  const startSession = useCallback((taskId: string) => {
    if (!nativeSessionReady) return;
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
  }, [activeSessionRef, nativeSessionReady, setActiveSession]);

  const pauseSession = useCallback(() => {
    if (!nativeSessionReady) return;
    setActiveSession((prev) => {
      if (!prev || prev.isPaused) return prev;
      if (!guardWallClock('guard')) return prev;
      return pauseActiveSession(prev, Date.now());
    });
  }, [nativeSessionReady, setActiveSession]);

  const resumeSession = useCallback(() => {
    if (!nativeSessionReady) return;
    setActiveSession((prev) => {
      if (!prev || !prev.isPaused) return prev;
      if (!guardWallClock('guard')) return prev;
      return resumeActiveSession(prev, Date.now());
    });
  }, [nativeSessionReady, setActiveSession]);

  const stopSession = useCallback(
    (
      outcome: SessionStopOutcome,
      options?: { endTime?: number; ignoreOpenPause?: boolean; taskId?: string },
    ) => {
      if (!nativeSessionReady) return { ok: false, error: 'Android timer recovery is still in progress. Keep YouDO open and try again.' };
      const prev = activeSessionRef.current;
      if (!prev) return { ok: false, error: 'This sitting is no longer active. No completion was applied.' };
      const result = persistActiveSession(outcome, options);
      if (!result.ok) return result;

      setTasks((prevTasks) =>
        prevTasks.map((t) => {
          if (t.id !== prev.taskId) return t;
          if (outcome.completed === true) return clearBacklogIfComplete({ ...t, resumeNote: undefined });
          const withResumeNote = { ...t, resumeNote: outcome.resumeNote?.trim() || undefined };
          if (t.originalTargetDate && (outcome.completed === false || outcome.completed === 'partial')) {
            if (!isTaskComplete({ ...withResumeNote, progress: withResumeNote.progress })) {
              return {
                ...withResumeNote,
                targetDate: t.originalTargetDate,
                originalTargetDate: undefined,
              };
            }
          }
          return withResumeNote;
        }),
      );
      return result;
    },
    [activeSessionRef, nativeSessionReady, persistActiveSession, setTasks],
  );

  const discardSession = useCallback(() => {
    return nativeSessionReady && setActiveSession(null);
  }, [nativeSessionReady, setActiveSession]);

  const continueInterruptedSession = useCallback(() => {
    if (!nativeSessionReady || !activeSessionRef.current || !guardWallClock('resume')) return false;
    const now = Date.now();
    return setActiveSession((prev) => {
      if (!prev) return null;
      return continueAfterInterruption(prev, now);
    });
  }, [activeSessionRef, nativeSessionReady, setActiveSession]);

  const heartbeatSession = useCallback(() => {
    if (!nativeSessionReady) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    setActiveSession((prev) => {
      if (!prev) return prev;
      if (!guardWallClock('guard')) return prev;
      return tickActiveSession(prev, Date.now());
    });
  }, [nativeSessionReady, setActiveSession]);

  useEffect(() => {
    let handle: { remove: () => Promise<void> } | undefined;
    let cancelled = false;
    void (async () => {
      try {
        handle = await attachSessionNotificationActions((session) => {
          if (cancelled || nativeSessionIsFinished(session, sessionHistoryRef.current)) return;
          const current = activeSessionRef.current;
          if (!current || current.taskId !== session.taskId || current.startTime !== session.startTime) return;
          setActiveSession(selectNativeSession(current, session, sessionHistoryRef.current));
        });
      } catch { /* Native pull still needs to run if the listener is unavailable. */ }
      if (cancelled) { void handle?.remove(); return; }
      const native = await pullNativeSession();
      if (cancelled) return;
      if (!native.ok) {
        setNativeSessionError('Could not read the Android timer snapshot. Its saved copy was preserved. Reopen YouDO before changing this sitting; do not clear app data.');
        return;
      }
      const session = native.session;
      if (session && !nativeSessionIsFinished(session, sessionHistoryRef.current)
        && tasksRef.current.some((task) => task.id === session.taskId)) {
        if (!setActiveSession(selectNativeSession(activeSessionRef.current, session, sessionHistoryRef.current))) return;
      }
      setNativeSessionError('');
      setNativeSessionReady(true);
    })();
    return () => {
      cancelled = true;
      void handle?.remove();
    };
  }, [activeSessionRef, setActiveSession]);

  const sessionTaskTitle = activeSession
    ? tasks.find((t) => t.id === activeSession.taskId)?.title
    : undefined;
  useEffect(() => {
    if (!nativeSessionReady || sessionStorageError) return;
    void syncSessionNotification(activeSession, sessionTaskTitle).then((ok) => {
      if (ok) return;
      setNativeSessionError('Could not save the Android timer snapshot. Keep app data intact and reopen YouDO before changing this sitting.');
      setNativeSessionReady(false);
    });
  }, [activeSession, sessionTaskTitle, nativeSessionReady, sessionStorageError]);

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
      recentlyDeletedGoals: recentlyDeletedRef.current,
      deletionLedger: deletionLedgerRef.current,
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

  const commitAndApplyWorkspace = useCallback((next: WorkspaceSlice, cloudFingerprint: string | null): boolean => {
    const nextState = {
      tasks: next.tasks,
      goals: next.goals,
      recentlyDeletedGoals: next.recentlyDeletedGoals as DeletedGoalRecord[],
      deletionLedger: next.deletionLedger ?? [],
      sessionHistory: next.sessionHistory,
      streakMeta: next.streakMeta ?? defaultStreakMeta(todayISO()),
      pacePrefs: next.pacePrefs ?? defaultPacePrefs(),
    };
    const stamp = next.updatedAt && next.updatedAt > 0 ? next.updatedAt : Date.now();
    try {
      commitWorkspaceMutation({
        [STORAGE_KEYS.tasks]: JSON.stringify(nextState.tasks),
        [STORAGE_KEYS.goals]: JSON.stringify(nextState.goals),
        [STORAGE_KEYS.deletedGoals]: JSON.stringify(nextState.recentlyDeletedGoals),
        [STORAGE_KEYS.deletionLedger]: JSON.stringify(nextState.deletionLedger),
        [STORAGE_KEYS.sessionHistory]: JSON.stringify(nextState.sessionHistory),
        [STORAGE_KEYS.streakMeta]: JSON.stringify(nextState.streakMeta),
        [STORAGE_KEYS.pacePrefs]: JSON.stringify(nextState.pacePrefs),
        [STORAGE_KEYS.workspaceUpdatedAt]: String(stamp),
        [STORAGE_KEYS.workspaceCloudFingerprint]: cloudFingerprint,
        [STORAGE_KEYS.workspaceSyncConflict]: null,
        [WORKSPACE_ALIAS_KEYS[0]]: null,
        [WORKSPACE_ALIAS_KEYS[1]]: null,
      });
    } catch (cause) {
      setWorkspaceStorageError(cause instanceof Error ? cause.message : 'The workspace could not be saved on this device.');
      try { setWorkspaceRecoveryBlocked(localStorage.getItem(STORAGE_KEYS.workspaceReplacement) !== null); }
      catch { setWorkspaceRecoveryBlocked(true); }
      return false;
    }
    persistedWorkspaceRef.current = nextState;
    tasksRef.current = nextState.tasks;
    goalsRef.current = nextState.goals;
    recentlyDeletedRef.current = nextState.recentlyDeletedGoals;
    deletionLedgerRef.current = nextState.deletionLedger;
    sessionHistoryRef.current = nextState.sessionHistory;
    streakMetaRef.current = nextState.streakMeta;
    pacePrefsRef.current = nextState.pacePrefs;
    workspaceUpdatedAtRef.current = stamp;
    setTasks(nextState.tasks);
    setGoals(nextState.goals);
    setRecentlyDeletedGoals(nextState.recentlyDeletedGoals);
    setDeletionLedger(nextState.deletionLedger);
    setSessionHistory(nextState.sessionHistory);
    setStreakMeta(nextState.streakMeta);
    setPacePrefs(nextState.pacePrefs);
    setWorkspaceStorageError('');
    clearRollupCache();
    return true;
  }, [setTasks, setGoals, setRecentlyDeletedGoals, setDeletionLedger, setSessionHistory, setStreakMeta, setPacePrefs]);

  const importBackup = useCallback(
    (jsonData: string, cloudFingerprint?: string | null, preserveBackupTime = false): boolean => {
      const prepared = prepareSettingsImport(jsonData);
      if (!prepared) return false;
      if (activeSessionRef.current) return false;
      let savedFingerprint: string | null;
      try {
        savedFingerprint = cloudFingerprint === undefined ? readWorkspaceCloudFingerprint() : cloudFingerprint;
      } catch {
        setWorkspaceStorageError('The device sync state cannot be read. Your previous workspace is unchanged; keep app data intact and retry.');
        return false;
      }
      return commitAndApplyWorkspace({
        ...prepared,
        updatedAt: preserveBackupTime && prepared.updatedAt && prepared.updatedAt > 0 ? prepared.updatedAt : Date.now(),
      }, savedFingerprint);
    },
    [activeSessionRef, commitAndApplyWorkspace],
  );

  const setStreakBarHours = useCallback(
    (hours: number) => {
      setStreakMeta((prev) => applyStreakBarHours(prev, hours, todayISO()));
    },
    [setStreakMeta],
  );

  const persistCloudFingerprint = useCallback((fingerprint: string): boolean => {
    try {
      commitWorkspaceMutation({ [STORAGE_KEYS.workspaceCloudFingerprint]: fingerprint, [STORAGE_KEYS.workspaceSyncConflict]: null });
      return true;
    } catch (cause) {
      setWorkspaceStorageError(cause instanceof Error ? cause.message : 'Cloud sync status could not be saved on this device.');
      try { setWorkspaceRecoveryBlocked(localStorage.getItem(STORAGE_KEYS.workspaceReplacement) !== null); }
      catch { setWorkspaceRecoveryBlocked(true); }
      return false;
    }
  }, []);

  const rememberCloudConflict = useCallback((record: SyncConflictRecord): void => {
    try {
      commitWorkspaceMutation({ [STORAGE_KEYS.workspaceSyncConflict]: JSON.stringify(record) });
    } catch (cause) {
      setWorkspaceStorageError(cause instanceof Error ? cause.message : 'Cloud conflict details could not be saved on this device.');
    }
    setCloudSyncConflict(true);
  }, []);

  const performCloudSync = useCallback(async (opts?: CloudSyncOptions): Promise<CloudSyncResult> => {
    if (localStorage.getItem(STORAGE_KEYS.workspaceReplacement) !== null) {
      return { ok: false, error: 'Device recovery is pending. Cloud sync is paused until this copy is safe.' };
    }
    const syncUserId = userIdRef.current;
    const scope = workspaceScopeRef.current;
    const stillCurrent = () => Boolean(syncUserId) && scope === workspaceScopeRef.current && userIdRef.current === syncUserId;
    const accountChanged = { ok: false, error: 'Account changed. Sync stopped without applying the previous workspace.' };
    if (!stillCurrent()) return accountChanged;
    const currentSlice = (): WorkspaceSlice => ({
      tasks: tasksRef.current,
      goals: goalsRef.current,
      sessionHistory: sessionHistoryRef.current,
      recentlyDeletedGoals: recentlyDeletedRef.current as TrashRecord[],
      deletionLedger: deletionLedgerRef.current,
      streakMeta: streakMetaRef.current,
      pacePrefs: pacePrefsRef.current,
      updatedAt: workspaceUpdatedAtRef.current,
    });
    const remoteInfo = await fetchLiveBackupInfo();
    if (!stillCurrent()) return accountChanged;
    const remoteParsed = remoteInfo ? parseBackupPayload(remoteInfo.backupData) : null;
    if (remoteInfo && !remoteParsed) return { ok: false, error: 'The cloud backup could not be read. Neither copy was replaced.' };
    const remoteSlice: WorkspaceSlice | null = remoteParsed
      ? {
          tasks: remoteParsed.tasks,
          goals: remoteParsed.goals,
          sessionHistory: sanitizeSessionHistory(remoteParsed.sessionHistory),
          recentlyDeletedGoals: Array.isArray(remoteParsed.recentlyDeletedGoals)
            ? (remoteParsed.recentlyDeletedGoals as TrashRecord[])
            : [],
          deletionLedger: isDeletionLedger(remoteParsed.deletionLedger) ? remoteParsed.deletionLedger : [],
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
    const localEmpty = isWorkspaceEffectivelyEmpty(localSlice);
    const conflictResult = (kind: SyncConflictKind, error: string): CloudSyncResult => {
      if (stillCurrent()) rememberCloudConflict({
        accountId: syncUserId!, kind, detectedAt: Date.now(),
        localFingerprint, remoteFingerprint, remoteRevision: remoteInfo?.revision ?? null,
        reason: error,
      });
      return { ok: false, conflict: true, error };
    };

    const pullRemote = (): { ok: boolean; error?: string } => {
      if (!remoteInfo || !remoteSlice || !remoteFingerprint) return { ok: false, error: 'No valid cloud copy was found.' };
      if (activeSessionRef.current) return { ok: false, error: 'End the current sitting before replacing this device workspace.' };
      if (!commitAndApplyWorkspace(remoteSlice, remoteFingerprint)) return { ok: false, error: 'The cloud copy could not be saved on this device. Your previous copy was preserved.' };
      setCloudSyncConflict(false);
      return { ok: true };
    };

    const pushCurrent = async () => {
      if (!stillCurrent()) return accountChanged;
      const payload = {
        app: 'YouDO',
        version: APP_VERSION,
        exportedAt: new Date().toISOString(),
        updatedAt: workspaceUpdatedAtRef.current || Date.now(),
        tasks: tasksRef.current,
        goals: goalsRef.current,
        sessionHistory: sessionHistoryRef.current,
        recentlyDeletedGoals: recentlyDeletedRef.current,
        deletionLedger: deletionLedgerRef.current,
        streakMeta: streakMetaRef.current,
        pacePrefs: pacePrefsRef.current,
      };
      const fingerprint = canonicalWorkspaceFingerprint(payload, todayISO());
      const result = await updateCloudBackup(payload, { expectedRevision: remoteInfo?.revision ?? 0, expectedUserId: syncUserId!, requireSafetyCopy: opts?.allowEmpty });
      if (!stillCurrent()) return accountChanged;
      if (result.ok) {
        if (!persistCloudFingerprint(fingerprint)) return { ok: false, error: 'Cloud saved, but this device could not save its sync status. Keep app data intact and retry.' };
        setCloudSyncConflict(false);
        return result;
      }
      const raced = /changed on another device|created on another device/i.test(result.error ?? '');
      if (raced) return conflictResult('stale_revision', result.error ?? 'Cloud changed on another device.');
      return result;
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
      if (!persistCloudFingerprint(remoteFingerprint!)) return { ok: false, error: 'This device could not save its cloud sync status.' };
      setCloudSyncConflict(false);
      return { ok: true };
    }
    if (decision === 'pull') return pullRemote();
    if (decision === 'push') return pushCurrent();
    if (decision === 'empty-error') {
      return conflictResult('cleared_device', 'This workspace was cleared after its last cloud sync. Nothing was restored or uploaded. Review both copies before choosing what to keep.');
    }
    if (decision === 'merge') {
      if (!remoteSlice) return { ok: false, error: 'No valid cloud copy was found to combine.' };
      let merged: WorkspaceSlice;
      try {
        merged = mergeWorkspace(localSlice, remoteSlice);
      } catch (failure) {
        return conflictResult('ambiguous_merge', failure instanceof Error ? failure.message : 'These copies cannot be combined safely.');
      }
      const runningTaskId = activeSessionRef.current?.taskId;
      if (runningTaskId) {
        const localRunningTask = localSlice.tasks.find((task) => task.id === runningTaskId);
        const mergedRunningTask = merged.tasks.find((task) => task.id === runningTaskId);
        if (!localRunningTask || !mergedRunningTask || !sameTasks([localRunningTask], [mergedRunningTask])) {
          return { ok: false, error: 'End the current sitting before combining workspace changes.' };
        }
      }
      if (!commitAndApplyWorkspace(merged, baseFingerprint)) {
        return { ok: false, error: 'The combined copy could not be saved on this device. Neither copy was replaced.' };
      }
      localSlice = currentSlice();
      localFingerprint = canonicalWorkspaceFingerprint(localSlice, todayISO());
      if (localFingerprint === remoteFingerprint) {
        if (!persistCloudFingerprint(remoteFingerprint)) return { ok: false, error: 'This device could not save its cloud sync status.' };
        setCloudSyncConflict(false);
        return { ok: true };
      }
      return pushCurrent();
    }
    return conflictResult(remoteSlice ? 'different_copies' : 'missing_cloud', !remoteSlice
        ? 'The cloud copy disappeared. This device was preserved; review before recreating cloud data.'
        : baseFingerprint
          ? 'Sync paused: this device and another device both changed. Nothing was overwritten.'
          : 'Sync paused for a one-time safety check because this device and cloud contain different work.');
  }, [activeSessionRef, updateCloudBackup, fetchLiveBackupInfo, commitAndApplyWorkspace, persistCloudFingerprint, rememberCloudConflict]);

  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());
  const syncToCloud = useCallback((opts?: CloudSyncOptions): Promise<CloudSyncResult> => {
    const run = syncQueueRef.current.then(
      () => performCloudSync(opts),
      () => performCloudSync(opts),
    ).catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'Sync could not finish. Your device copy was preserved.' }));
    syncQueueRef.current = run.then(() => undefined, () => undefined);
    return run;
  }, [performCloudSync]);

  const restoreFromCloud = useCallback(async (): Promise<boolean> => {
    const owner = userIdRef.current;
    const scope = workspaceScopeRef.current;
    const before = workspaceSignature({ tasks: tasksRef.current, goals: goalsRef.current, sessionHistory: sessionHistoryRef.current, recentlyDeletedGoals: recentlyDeletedRef.current, deletionLedger: deletionLedgerRef.current, streakMeta: streakMetaRef.current, pacePrefs: pacePrefsRef.current });
    const jsonStr = await fetchCloudBackup();
    if (!jsonStr || !owner || userIdRef.current !== owner || scope !== workspaceScopeRef.current) return false;
    if (before !== workspaceSignature({ tasks: tasksRef.current, goals: goalsRef.current, sessionHistory: sessionHistoryRef.current, recentlyDeletedGoals: recentlyDeletedRef.current, deletionLedger: deletionLedgerRef.current, streakMeta: streakMetaRef.current, pacePrefs: pacePrefsRef.current })) return false;
    try {
      const parsed = parseBackupPayload(jsonStr);
      if (!parsed) return false;
      const fingerprint = canonicalWorkspaceFingerprint({
          tasks: parsed.tasks,
          goals: parsed.goals,
          sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
          recentlyDeletedGoals: Array.isArray(parsed.recentlyDeletedGoals)
            ? (parsed.recentlyDeletedGoals as TrashRecord[])
            : [],
          deletionLedger: isDeletionLedger(parsed.deletionLedger) ? parsed.deletionLedger : [],
          streakMeta: sanitizeStreakMeta(parsed.streakMeta, todayISO()),
          pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
        }, todayISO());
      const ok = importBackup(jsonStr, fingerprint, true);
      if (ok) {
        setCloudSyncConflict(false);
      }
      return ok;
    } catch {
      return false;
    }
  }, [fetchCloudBackup, importBackup]);

  const restoreFromVisitSnapshot = useCallback(async (snapshotId: string): Promise<boolean> => {
    const owner = userIdRef.current;
    const scope = workspaceScopeRef.current;
    const before = workspaceSignature({ tasks: tasksRef.current, goals: goalsRef.current, sessionHistory: sessionHistoryRef.current, deletionLedger: deletionLedgerRef.current, recentlyDeletedGoals: recentlyDeletedRef.current, streakMeta: streakMetaRef.current, pacePrefs: pacePrefsRef.current });
    const jsonStr = await fetchVisitSnapshot(snapshotId);
    if (!jsonStr || !owner || userIdRef.current !== owner || scope !== workspaceScopeRef.current) return false;
    if (before !== workspaceSignature({ tasks: tasksRef.current, goals: goalsRef.current, sessionHistory: sessionHistoryRef.current, deletionLedger: deletionLedgerRef.current, recentlyDeletedGoals: recentlyDeletedRef.current, streakMeta: streakMetaRef.current, pacePrefs: pacePrefsRef.current })) return false;
    try {
      const parsed = parseBackupPayload(jsonStr);
      if (!parsed) return false;
      const ok = importBackup(jsonStr, null);
      if (ok) {
        // This restored copy intentionally differs from live cloud; the next sync must review it.
        rememberCloudConflict({
          accountId: owner, kind: 'restored_snapshot', detectedAt: Date.now(),
          localFingerprint: canonicalWorkspaceFingerprint({
            tasks: parsed.tasks, goals: parsed.goals,
            sessionHistory: sanitizeSessionHistory(parsed.sessionHistory),
            recentlyDeletedGoals: Array.isArray(parsed.recentlyDeletedGoals) ? parsed.recentlyDeletedGoals as TrashRecord[] : [],
            deletionLedger: isDeletionLedger(parsed.deletionLedger) ? parsed.deletionLedger : [],
            streakMeta: sanitizeStreakMeta(parsed.streakMeta, todayISO()),
            pacePrefs: sanitizePacePrefs(parsed.pacePrefs),
          }, todayISO()),
          remoteFingerprint: null, remoteRevision: null,
          reason: 'A safety copy was restored. Review the live cloud copy before uploading it.',
        });
      }
      return ok;
    } catch {
      return false;
    }
  }, [fetchVisitSnapshot, importBackup, rememberCloudConflict]);

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
  }, [user, tasks, goals, sessionHistory, recentlyDeletedGoals, deletionLedger, streakMeta, pacePrefs]);

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
      exportBackup, importBackup, syncToCloud, cloudSyncConflict, workspaceStorageError, restoreFromCloud, restoreFromVisitSnapshot, listCloudRestorePoints,
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
      exportBackup, importBackup, syncToCloud, cloudSyncConflict, workspaceStorageError, restoreFromCloud, restoreFromVisitSnapshot, listCloudRestorePoints,
      pruneOldSessions,
      sessionHistory, completeSessionSteps, streakMeta, setStreakMeta, setStreakBarHours,
      pacePrefs, updatePacePrefs, publishPublicPace],
  );

  const sessionValue = useMemo<SessionStore>(
    () => ({
      activeSession, sessionStorageError: sessionStorageError || nativeSessionError, nativeSessionReady,
      startSession, pauseSession, resumeSession, stopSession,
      discardSession, continueInterruptedSession, heartbeatSession,
    }),
    [activeSession, sessionStorageError, nativeSessionError, nativeSessionReady, startSession, pauseSession, resumeSession, stopSession,
      discardSession, continueInterruptedSession, heartbeatSession],
  );

  if (workspaceRecoveryBlocked) {
    return <div className="min-h-screen bg-base p-6 text-content-primary flex items-center justify-center"><main className="max-w-sm rounded-2xl border border-error/40 bg-elevated p-5"><h1 className="text-lg font-semibold">Device recovery needed</h1><p role="alert" className="my-4 text-sm">{workspaceStorageError}</p><p className="mb-4 text-sm text-content-secondary">Keep app data intact. Free some device storage, then retry recovery.</p><button className="rounded-xl bg-primary px-4 py-3 font-semibold text-on-primary" onClick={() => window.location.reload()}>Retry safely</button></main></div>;
  }
  return (
    <DataCtx.Provider value={dataValue}>
      <SessionCtx.Provider value={sessionValue}>{children}</SessionCtx.Provider>
    </DataCtx.Provider>
  );
}

