import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, startTransition } from 'react';
import { AlertTriangle, Calendar, FileText, Flame, ListChecks, Plus, X, Zap, Clock, Cloud } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { GoalKind, GoalNode, Task, View, TaskSession } from './types';
import { useNavigationSync } from './hooks/useNavigationSync';
import { findNode, formatDDMMYYYY, isBacklogTask, isOpenBacklogTask, isTaskComplete, isToday, pathNodes, pathTitles, todayISO, useStore, useSessionStore, findGoal } from './store';
import { shouldOfferSessionRecovery } from './lib/sessionStats';
import Overlay from './components/Overlay';
import { useAuth } from './contexts/AuthContext';
import TaskCard from './components/TaskCard';
import AddTaskSheet from './components/AddTaskSheet';
import CommandBar from './components/CommandBar';
import SettingsSheet from './components/SettingsSheet';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useReviveDeadlineLabel } from './hooks/useReviveCountdown';
import HelpCenterSheet from './components/HelpCenterSheet';
import TodayBriefingSheet from './components/TodayBriefingSheet';
import UndoToast from './components/UndoToast';
import { STORAGE_KEYS } from './lib/storageKeys';
import { hapticTap } from './lib/haptics';
import { daysBetweenLocalISO } from './lib/dates';
import {
  netFocusByLocalDateOverlapping,
  reconcileStreakMeta,
} from './lib/focusTrends';
import GoalView from './components/GoalView';
import AddGoalSheet from './components/AddGoalSheet';
import StepSliceSheet from './components/StepSliceSheet';
import BlueprintStudio from './components/BlueprintStudio';
import CalendarView from './components/CalendarView';
import BoardView from './components/BoardView';
import { AmbientScreen } from './components/AmbientScreen';
import { SessionStopDialog } from './components/SessionStopDialog';
import { SessionReconstructSheet } from './components/SessionReconstructSheet';
import { AuthModal } from './components/AuthModal';
import { useTheme } from './hooks/useTheme';
import { useClockIntegrity } from './hooks/useClockIntegrity';
import { assertDeviceClock, clearClockIncident } from './lib/deviceClock';

const MOTIVATIONAL_QUOTES = [
  { text: 'Giving up is not in the blood sir..... not in the blood', author: 'Nimsdai Purja' },
  { text: "It's not about being the best. It's about being better than you were yesterday.", author: 'Unknown' },
  { text: 'Discipline equals freedom.', author: 'Jocko Willink' },
  { text: 'You must do the thing you think you cannot do.', author: 'Eleanor Roosevelt' },
  { text: 'Hard work beats talent when talent does not work hard.', author: 'Tim Notke' },
  { text: "Don't wish it were easier. Wish you were better.", author: 'Jim Rohn' },
  { text: 'You do not have to be great to start. You have to start to be great.', author: 'Zig Ziglar' },
  { text: 'The pain of discipline is nothing compared to the pain of regret.', author: 'Unknown' },
  { text: 'While you rest, someone else is studying.', author: 'Unknown' },
  { text: 'Sit down. Open the book. Begin.', author: 'YouDO' },
  { text: 'Nobody is coming to save you. Do the work.', author: 'Unknown' },
  { text: 'Comfort is the enemy of growth.', author: 'Unknown' },
  { text: 'Suffer the hours now. Own the years later.', author: 'YouDO' },
  { text: 'Arise, awake, and stop not till the goal is reached.', author: 'Swami Vivekananda' },
  { text: 'Make the days count.', author: 'Muhammad Ali' },
  { text: 'The obstacle is the way.', author: 'Marcus Aurelius' },
];

function YouDoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="4 3.5 16 17.5"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className="block shrink-0"
    >
      <path
        d="M5 4.5L12 13.25V19.5"
        style={{ stroke: 'var(--primary)' }}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 4.5L12 13.25L9.25 10"
        style={{ stroke: 'var(--secondary)' }}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function YouDoWordmark() {
  return (
    <span className="youdo-wordmark" aria-label="YouDO">
      <YouDoIcon size={32} />
      <span className="youdo-wordmark-text">
        <span className="youdo-wordmark-ou">ou</span>
        <span className="youdo-wordmark-do">DO</span>
      </span>
    </span>
  );
}

function isInteractiveOrScrollable(el: HTMLElement | null): boolean {
  while (el && el !== document.body) {
    const tagName = el.tagName ? el.tagName.toLowerCase() : '';
    if (tagName === 'textarea') return true;
    if (tagName === 'input') {
      const type = (el as HTMLInputElement).type;
      if (!type || ['text', 'password', 'email', 'number', 'search', 'tel', 'url'].includes(type)) {
        return true;
      }
    }
    if (el.classList) {
      if (el.classList.contains('no-swipe') || el.classList.contains('glass-nav') || el.classList.contains('dragging-card')) {
        return true;
      }
    }
    el = el.parentElement;
  }
  return false;
}

export default function App() {
  return <AppInner />;
}

function AppInner() {
  const {
    tasks,
    goals,
    addTask,
    duplicateTask,
    advance,
    undo,
    removeTask,
    unlinkTask,
    reorder,
    addGoalRoot,
    addChildNode,
    updateGoalNode,
    deleteGoalNode,
    applyGoalTreeChange,
    undoGoalTreeChange,
    planTask,
    copyGoalNode,
    copyGoalNodes,
    pasteGoalNode,
    clearClipboard,
    clipboard,
    deleteGoalNodes,
    lastDeletedNotification,
    clearDeletedNotification,
    restoreDeletedGoal,
    restoreFromCloud,
    sessionHistory,
    completeSessionSteps,
    streakMeta,
    setStreakMeta,
    setStreakBarHours,
    publishPublicPace,
  } = useStore();

  const {
    activeSession,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    discardSession,
    continueInterruptedSession,
    heartbeatSession,
  } = useSessionStore();

  const { user } = useAuth();
  const [{ darkMode }] = useTheme();
  const { clockBlocked, clockReady, setClockBlocked } = useClockIntegrity();
  const [clockVerifyBusy, setClockVerifyBusy] = useState(false);
  const [clockVerifyError, setClockVerifyError] = useState<string | null>(null);


  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialDate, setSheetInitialDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [blueprintStudioOpen, setBlueprintStudioOpen] = useState(false);
  const [blueprintUndo, setBlueprintUndo] = useState<{ token: string; title: string } | null>(null);
  const [goalParentId, setGoalParentId] = useState<string | null>(null);
  const [goalParentKind, setGoalParentKind] = useState<GoalKind | undefined>(undefined);
  const [editingNode, setEditingNode] = useState<GoalNode | null>(null);
  const [sliceNodes, setSliceNodes] = useState<GoalNode[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [descModalData, setDescModalData] = useState<{ title: string; description: string } | null>(null);

  // Session UI states
  const [showAmbient, setShowAmbient] = useState(false);
  const [stopDialogTask, setStopDialogTask] = useState<Task | null>(null); 
  const [helpOpen, setHelpOpen] = useState(false);
  const [hasSeenHelp, setHasSeenHelp] = useLocalStorage(STORAGE_KEYS.helpSeen, false);
  const firstHelpRef = useRef(false);
  const [briefingOpen, setBriefingOpen] = useState(false);
  const briefingPromptedRef = useRef(false);
  /** Opaque hold while a stored session waits for the recovery check (avoids Today flash). */
  const [sessionBootHold, setSessionBootHold] = useState(() => Boolean(activeSession));
  const [cloudHint, setCloudHint] = useState<string | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [recoverySessionPrompt, setRecoverySessionPrompt] = useState<boolean>(false);
  const [reconstructOpen, setReconstructOpen] = useState(false);
  const activeSessionRef = useRef(activeSession);
  activeSessionRef.current = activeSession;

  const openHelp = useCallback((opts?: { silent?: boolean }) => {
    setHelpOpen((already) => {
      if (!already) {
        try {
          window.history.pushState({ modal: true }, '', window.location.href);
        } catch {
          /* ignore */
        }
      }
      return true;
    });
    if (!opts?.silent) hapticTap();
  }, []);

  // Heartbeat while visible (30s). Also tick on return so a long lock is handled immediately.
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(heartbeatSession, 30_000);
    const onVis = () => {
      if (document.visibilityState === 'visible') heartbeatSession();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [activeSession, heartbeatSession]);

  // Batch selection state
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchLeafIds, setBatchLeafIds] = useState<string[]>([]);
  const clearSelectionRef = useRef<() => void>(() => {});

  const handleSelectionChange = useCallback((ids: string[], leafIds: string[]) => {
    setBatchSelectedIds(ids);
    setBatchLeafIds(leafIds);
  }, []);

  const batchLeafGroups = useMemo(() => {
    const allNodes: GoalNode[] = [];
    const flatten = (node: GoalNode) => {
      allNodes.push(node);
      node.children.forEach(flatten);
    };
    goals.forEach(flatten);
    const selected = allNodes.filter((node) => batchLeafIds.includes(node.id) && node.children.length === 0 && !node.completed);
    const schedule: GoalNode[] = [];
    const replan: GoalNode[] = [];
    const unplan: GoalNode[] = [];
    for (const node of selected) {
      const linked = node.todayTaskId ? tasks.find((task) => task.id === node.todayTaskId) : null;
      const activelyPlanned = Boolean(linked && !isBacklogTask(linked) && !isTaskComplete(linked));
      const focusRunning = Boolean(linked && activeSession?.taskId === linked.id);
      if (activelyPlanned) {
        if (!focusRunning) {
          replan.push(node);
          unplan.push(node);
        }
      } else {
        schedule.push(node);
      }
    }
    return { schedule, replan, unplan };
  }, [activeSession?.taskId, batchLeafIds, goals, tasks]);

  const handleBatchCancel = useCallback(() => {
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, []);

  // Modal close interceptor ref for popstate (device back gesture)
  const modalCloseRef = useRef<() => boolean>(() => false);
  modalCloseRef.current = () => {
    if (showAmbient) {
      setShowAmbient(false);
      return true;
    }
    if (stopDialogTask) {
      setStopDialogTask(null);
      return true;
    }
    if (authOpen) {
      setAuthOpen(false);
      return true;
    }
    if (sheetOpen) {
      setSheetOpen(false);
      return true;
    }
    if (goalSheetOpen) {
      setGoalSheetOpen(false);
      return true;
    }
    if (blueprintStudioOpen) {
      setBlueprintStudioOpen(false);
      return true;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    if (sliceNodes.length > 0) {
      setSliceNodes([]);
      return true;
    }
    if (helpOpen) {
      setHasSeenHelp(true);
      setHelpOpen(false);
      return true;
    }
    return false;
  };

  const handleModalPopState = useCallback(() => {
    return modalCloseRef.current();
  }, []);

  const { view, goalPathIds, slideDirection, setGoalPathIds, handleNavigateTab, navigateToGoalPath } =
    useNavigationSync(handleModalPopState);
  const tabs: View[] = useMemo(() => ['tasks', 'goals', 'calendar', 'board'], []);

  const pushModalState = useCallback(() => {
    try {
      window.history.pushState({ modal: true }, '', window.location.href);
    } catch {
      /* ignore */
    }
  }, []);

  const openAddTask = (date?: string) => {
    pushModalState();
    setSheetInitialDate(date ?? null);
    setSheetOpen(true);
  };

  const openAddGoal = (parentId: string | null, parentKind?: GoalKind) => {
    pushModalState();
    setEditingNode(null);
    setGoalParentId(parentId);
    setGoalParentKind(parentKind);
    setGoalSheetOpen(true);
  };

  const openEditGoal = (node: GoalNode) => {
    pushModalState();
    setEditingNode(node);
    setGoalParentId(null);
    setGoalSheetOpen(true);
  };

  const openBlueprintStudio = () => {
    pushModalState();
    setBlueprintStudioOpen(true);
  };

  const closeBlueprintStudio = useCallback(() => {
    setBlueprintStudioOpen(false);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const openSettings = () => {
    pushModalState();
    setSettingsOpen(true);
  };

  const handlePushNode = (node: GoalNode) => {
    pushModalState();
    setSliceNodes([node]);
  };

  const handleBatchCopy = useCallback(() => {
    copyGoalNodes(batchSelectedIds);
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, [copyGoalNodes, batchSelectedIds]);

  const handleBatchDelete = useCallback(() => {
    deleteGoalNodes(batchSelectedIds);
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, [deleteGoalNodes, batchSelectedIds]);

  const openBatchPlanner = useCallback((selectedNodes: GoalNode[]) => {
    if (selectedNodes.length === 0) return;
    pushModalState();
    setSliceNodes(selectedNodes);
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, [pushModalState]);

  const handleBatchSchedule = useCallback(() => {
    openBatchPlanner(batchLeafGroups.schedule);
  }, [batchLeafGroups.schedule, openBatchPlanner]);

  const handleBatchReplan = useCallback(() => {
    openBatchPlanner(batchLeafGroups.replan);
  }, [batchLeafGroups.replan, openBatchPlanner]);

  const handleBatchUnplan = useCallback(() => {
    if (batchLeafGroups.unplan.length === 0) return;
    for (const node of batchLeafGroups.unplan) {
      if (node.todayTaskId) unlinkTask(node.todayTaskId);
    }
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, [batchLeafGroups.unplan, unlinkTask]);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const closeGoalSheet = useCallback(() => {
    setGoalSheetOpen(false);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const closeSliceNode = useCallback(() => {
    setSliceNodes([]);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const openDescriptionModal = useCallback(
    (title: string, description: string) => {
      pushModalState();
      setDescModalData({ title, description });
    },
    [pushModalState],
  );

  const closeDescriptionModal = useCallback(() => {
    setDescModalData(null);
    if (window.history.state?.modal) window.history.back();
  }, []);

  const [randomQuote] = useState(() => {
      const idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
      return MOTIVATIONAL_QUOTES[idx];
    });

  // Open Today's glance before paint when there is no stored session.
  // If a sitting is already paused, skip recovery — the user paused on purpose.
  // If a running sitting is stale, show recovery immediately (do not wait on the clock check).
  useLayoutEffect(() => {
    if (briefingPromptedRef.current) return;
    if (!hasSeenHelp || helpOpen) return;
    if (recoverySessionPrompt || reconstructOpen) return;

    if (!activeSession) {
      briefingPromptedRef.current = true;
      setBriefingOpen(true);
      setSessionBootHold(false);
      return;
    }

    if (activeSession.isPaused) {
      briefingPromptedRef.current = true;
      setSessionBootHold(false);
      return;
    }

    if (shouldOfferSessionRecovery(activeSession, Date.now())) {
      briefingPromptedRef.current = true;
      setBriefingOpen(false);
      setRecoverySessionPrompt(true);
      setSessionBootHold(false);
      return;
    }

    briefingPromptedRef.current = true;
    setSessionBootHold(false);
  }, [hasSeenHelp, helpOpen, activeSession, recoverySessionPrompt, reconstructOpen]);

  useEffect(() => {
    if (!activeSession) {
      setSessionBootHold(false);
      return;
    }
    if (!clockReady) return;

    const offerRecoveryIfStale = () => {
      const session = activeSessionRef.current;
      if (!session) {
        setSessionBootHold(false);
        return;
      }
      if (document.visibilityState !== 'visible') return;
      if (session.isPaused) {
        briefingPromptedRef.current = true;
        setSessionBootHold(false);
        return;
      }
      if (shouldOfferSessionRecovery(session, Date.now())) {
        briefingPromptedRef.current = true;
        setBriefingOpen(false);
        setRecoverySessionPrompt(true);
      } else if (!briefingPromptedRef.current && hasSeenHelp && !helpOpen) {
        briefingPromptedRef.current = true;
      }
      setSessionBootHold(false);
    };

    offerRecoveryIfStale();
    document.addEventListener('visibilitychange', offerRecoveryIfStale);
    return () => document.removeEventListener('visibilitychange', offerRecoveryIfStale);
    // Heartbeat mutates activeSession; taskId is the sitting identity we care about.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockReady, clockBlocked, activeSession?.taskId, activeSession?.isPaused, hasSeenHelp, helpOpen]);

  useEffect(() => {
    if (!clockBlocked) return;
    setShowAmbient(false);
    setRecoverySessionPrompt(false);
    setReconstructOpen(false);
    setStopDialogTask(null);
    setSessionBootHold(false);
  }, [clockBlocked]);

  useEffect(() => {
    if (!activeSession?.isPaused) return;
    setRecoverySessionPrompt(false);
    setSessionBootHold(false);
  }, [activeSession?.isPaused]);

  useEffect(() => {
    const initStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: darkMode ? Style.Dark : Style.Light });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        /* fallback */
      }
    };
    initStatusBar();
  }, [darkMode]);

  const [todaySubTab, setTodaySubTab] = useState<'today' | 'backlog'>('today');
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const todayTasks = useMemo(
    () => tasks.filter((t) => isToday(t.targetDate) && !isBacklogTask(t)),
    [tasks],
  );
  const backlogTasks = useMemo(() => tasks.filter((t) => isBacklogTask(t)), [tasks]);
  const openBacklogCount = useMemo(
    () => backlogTasks.filter((t) => isOpenBacklogTask(t)).length,
    [backlogTasks],
  );
  const openBacklogDateCount = useMemo(() => {
    const dates = new Set<string>();
    for (const t of backlogTasks) {
      if (isOpenBacklogTask(t) && t.targetDate) dates.add(t.targetDate);
    }
    return dates.size;
  }, [backlogTasks]);
  const oldestBacklogDays = useMemo(() => {
    let oldest: string | null = null;
    for (const t of backlogTasks) {
      if (!isOpenBacklogTask(t) || !t.targetDate) continue;
      if (!oldest || t.targetDate < oldest) oldest = t.targetDate;
    }
    if (!oldest) return null;
    return Math.max(0, daysBetweenLocalISO(oldest, todayISO()));
  }, [backlogTasks]);
  const openTodayCount = useMemo(
    () => todayTasks.filter((t) => !isTaskComplete(t)).length,
    [todayTasks],
  );
  const todayCount = todayTasks.length;
  const todayDone = todayTasks.filter(isTaskComplete).length;
  const todayProgress = todayCount > 0 ? Math.round((todayDone / todayCount) * 100) : 0;

  const openBacklogIds = useMemo(
    () => backlogTasks.filter((t) => isOpenBacklogTask(t)).map((t) => t.id),
    [backlogTasks],
  );
  const openTodayIds = useMemo(
    () => todayTasks.filter((t) => !isTaskComplete(t)).map((t) => t.id),
    [todayTasks],
  );
  const isSnapshotTaskOpen = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id);
      return !!t && !isTaskComplete(t);
    },
    [tasks],
  );
  const streakByDate = useMemo(
    () => netFocusByLocalDateOverlapping(Object.values(sessionHistory).flat()),
    [sessionHistory],
  );
  const streakReconcileInput = useMemo(
    () => ({
      todayISO: todayISO(),
      byDate: streakByDate,
      meta: streakMeta,
      openBacklogIds,
      openTodayIds,
      isTaskStillOpen: isSnapshotTaskOpen,
    }),
    [streakByDate, streakMeta, openBacklogIds, openTodayIds, isSnapshotTaskOpen],
  );
  const streakStatus = useMemo(
    () => reconcileStreakMeta(streakReconcileInput).status,
    [streakReconcileInput],
  );
  const reviveDeadlineLabel = useReviveDeadlineLabel(
    streakStatus.revive?.windowEnds,
    streakStatus.revive?.previousStreak ?? 0,
    !!streakStatus.revive?.active,
  );

  const reviveSaveIds = useMemo(
    () => new Set(streakStatus.revive?.active && streakStatus.revive.mode === 'backlog' ? streakStatus.revive.remainingIds : []),
    [streakStatus],
  );
  const reviveScheduledIds = useMemo(
    () =>
      new Set(
        streakStatus.revive?.active && streakStatus.revive.mode === 'backlog'
          ? streakStatus.revive.remainingScheduledIds
          : [],
      ),
    [streakStatus],
  );
  const reviveSaveTasks = useMemo(
    () =>
      (streakStatus.revive?.active && streakStatus.revive.mode === 'backlog'
        ? streakStatus.revive.remainingIds
        : []
      )
        .map((id) => tasks.find((t) => t.id === id))
        .filter((t): t is Task => !!t),
    [streakStatus, tasks],
  );

  useEffect(() => {
    const { meta } = reconcileStreakMeta(streakReconcileInput);
    if (JSON.stringify(meta) !== JSON.stringify(streakMeta)) setStreakMeta(meta);
  }, [streakReconcileInput, streakMeta]);

  useEffect(() => {
    if (!user) return;
    void publishPublicPace();
  }, [user, publishPublicPace]);

  const activeTask = useMemo(() => {
    if (!activeSession) return null;
    return tasks.find((t) => t.id === activeSession.taskId) ?? null;
  }, [activeSession, tasks]);

  useEffect(() => {
    if (!activeSession?.taskId || !activeTask) return;

    const openRunningTaskLocation = () => {
      if (document.visibilityState !== 'visible') return;
      setBriefingOpen(false);
      setActiveCategoryFilter('all');
      setTodaySubTab(isBacklogTask(activeTask) ? 'backlog' : 'today');
      handleNavigateTab('tasks');
    };

    openRunningTaskLocation();
    document.addEventListener('visibilitychange', openRunningTaskLocation);
    return () => document.removeEventListener('visibilitychange', openRunningTaskLocation);
  }, [activeSession?.taskId, activeTask, handleNavigateTab]);

  const handlePrimaryNavigate = useCallback((targetView: View) => {
    if (targetView === 'tasks') {
      setTodaySubTab('today');
      setActiveCategoryFilter('all');
    }
    handleNavigateTab(targetView);
  }, [handleNavigateTab]);

  const backlogByDate = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of backlogTasks) {
      if (activeSession?.taskId === t.id) continue;
      const d = t.targetDate || 'No Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    }
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
      date,
      formattedDate: formatDDMMYYYY(date),
      tasks: groups[date].sort((a, b) => a.order - b.order),
    })).filter((g) => g.tasks.length > 0);
  }, [backlogTasks, activeSession]);

  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);

  const jumpToGoalTask = useCallback(
    (goalNodeId: string | null | undefined) => {
      if (!goalNodeId) return;
      for (const root of goals) {
        const nodes = pathNodes(root, goalNodeId);
        if (nodes.length > 0) {
          const targetNode = nodes[nodes.length - 1];
          const targetIds =
            targetNode.children.length > 0
              ? nodes.map((n) => n.id)
              : nodes.slice(0, -1).map((n) => n.id);

          setHighlightNodeId(goalNodeId);
          navigateToGoalPath(targetIds);
          setTimeout(() => setHighlightNodeId(null), 3500);
          return;
        }
      }
    },
    [goals, navigateToGoalPath],
  );

  const handlePushBacklogTask = useCallback(
    (t: Task) => {
      if (t.goalNodeId) {
        for (const root of goals) {
          const [found] = findNode(root, t.goalNodeId);
          if (found) {
            pushModalState();
            setSliceNodes([found]);
            return;
          }
        }
      }
    },
    [goals, pushModalState],
  );

  // Precompute goal breadcrumb paths for every task into a Map so the lookup is O(1) per render
  // instead of O(tasks × depth) for an inline function called inside JSX.
  const originNodesMap = useMemo(() => {
    const map = new Map<string, { title: string; kind: GoalKind }[] | undefined>();
    for (const task of tasks) {
      if (!task.goalNodeId) { map.set(task.id, undefined); continue; }
      for (const root of goals) {
        const nodes = pathNodes(root, task.goalNodeId);
        if (nodes.length) {
          map.set(task.id, nodes.slice(0, -1).map((n) => ({ title: n.title, kind: n.kind })));
          break;
        }
      }
    }
    return map;
  }, [tasks, goals]);

  const originNodesFor = useCallback(
    (taskId: string): { title: string; kind: GoalKind }[] | undefined => originNodesMap.get(taskId),
    [originNodesMap],
  );

  const getTaskSessions = useCallback(
    (taskId: string): TaskSession[] => sessionHistory[taskId] || [],
    [sessionHistory],
  );

  const doReorder = () => {
    if (!dragId || !overId || dragId === overId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    reorder(dragId, overId);
    setDragId(null);
    setOverId(null);
  };

  const categoryChips = useMemo(() => {
    const activeTasksList = todaySubTab === 'today' ? todayTasks : backlogTasks;
    const map = new Map<string, { id: string; label: string; count: number }>();

    let quickCount = 0;
    for (const t of activeTasksList) {
      if (isTaskComplete(t)) continue;
      if (!t.goalNodeId) {
        quickCount++;
      } else {
        for (const root of goals) {
          const path = pathTitles(root, t.goalNodeId);
          if (path.length > 0) {
            const rootId = root.id;
            const rootTitle = root.title;
            const existing = map.get(rootId);
            if (existing) {
              existing.count++;
            } else {
              map.set(rootId, { id: rootId, label: rootTitle, count: 1 });
            }
            break;
          }
        }
      }
    }

    const list = Array.from(map.values());
    if (quickCount > 0) {
      list.push({ id: 'quick', label: '⚡ Quick Tasks', count: quickCount });
    }
    return list;
  }, [todaySubTab, todayTasks, backlogTasks, goals]);

  const filteredTodayTasks = useMemo(() => {
    if (activeCategoryFilter === 'all') return todayTasks;
    if (activeCategoryFilter === 'quick') return todayTasks.filter((t) => !t.goalNodeId);
    return todayTasks.filter((t) => {
      if (!t.goalNodeId) return false;
      for (const root of goals) {
        if (root.id === activeCategoryFilter) {
          const path = pathTitles(root, t.goalNodeId);
          if (path.length > 0) return true;
        }
      }
      return false;
    });
  }, [todayTasks, activeCategoryFilter, goals]);

  const sortedTasks = useMemo(() => {
    return [...filteredTodayTasks].sort((a, b) => {
      if (activeSession) {
        if (a.id === activeSession.taskId) return -1;
        if (b.id === activeSession.taskId) return 1;
      }
      return a.order - b.order;
    });
  }, [filteredTodayTasks, activeSession]);

  const touchState = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    startTime: number;
    isHorizontal: boolean | null;
    tracking: boolean;
  }>({
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    startTime: 0,
    isHorizontal: null,
    tracking: false,
  });

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (sheetOpen || goalSheetOpen || blueprintStudioOpen || settingsOpen || sliceNodes.length > 0 || showAmbient || stopDialogTask || recoverySessionPrompt || reconstructOpen || briefingOpen) return;
      const target = e.target as HTMLElement | null;
      if (isInteractiveOrScrollable(target)) return;

      const touch = e.touches[0];
      touchState.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        startTime: Date.now(),
        isHorizontal: null,
        tracking: true,
      };
    },
    [sheetOpen, goalSheetOpen, blueprintStudioOpen, settingsOpen, sliceNodes, showAmbient, stopDialogTask, recoverySessionPrompt, reconstructOpen, briefingOpen],
  );

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current.tracking) return;
    const touch = e.touches[0];
    touchState.current.currentX = touch.clientX;
    touchState.current.currentY = touch.clientY;

    const dx = touch.clientX - touchState.current.startX;
    const dy = touch.clientY - touchState.current.startY;

    if (touchState.current.isHorizontal === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        if (Math.abs(dy) >= Math.abs(dx)) {
          touchState.current.isHorizontal = false;
          touchState.current.tracking = false;
        } else {
          touchState.current.isHorizontal = true;
        }
      }
    }
  }, []);

  const onTouchEnd = useCallback(
    () => {
      if (!touchState.current.tracking || touchState.current.isHorizontal !== true) {
        touchState.current.tracking = false;
        return;
      }
      touchState.current.tracking = false;

      const dx = touchState.current.currentX - touchState.current.startX;
      const dy = touchState.current.currentY - touchState.current.startY;
      const dt = Date.now() - touchState.current.startTime;

      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.75 || dt > 750) return;

      const currentIdx = tabs.indexOf(view);

      if (dx <= -50) {
        const nextIdx = Math.min(tabs.length - 1, currentIdx + 1);
        if (nextIdx !== currentIdx) handleNavigateTab(tabs[nextIdx]);
      } else if (dx >= 50) {
        if (view === 'goals' && goalPathIds.length > 0) {
          setGoalPathIds(goalPathIds.slice(0, -1));
          return;
        }
        const prevIdx = Math.max(0, currentIdx - 1);
        if (prevIdx !== currentIdx) handleNavigateTab(tabs[prevIdx]);
      }
    },
    [view, goalPathIds, tabs, handleNavigateTab, setGoalPathIds],
  );

  useEffect(() => {
    if (hasSeenHelp || recoverySessionPrompt || reconstructOpen || helpOpen) return;
    if (firstHelpRef.current) return;
    firstHelpRef.current = true;
    openHelp({ silent: true });
  }, [hasSeenHelp, recoverySessionPrompt, reconstructOpen, helpOpen, openHelp]);

  useEffect(() => {
    if (!cloudHint) return;
    const id = window.setTimeout(() => setCloudHint(null), 4000);
    return () => window.clearTimeout(id);
  }, [cloudHint]);

  return (
    <div className="min-h-screen">
      {sessionBootHold && (
        <div
          className="fixed inset-0 z-[2000] bg-base"
          aria-hidden
        />
      )}
      <div
        className="app-frame relative min-h-screen w-full max-w-md mx-auto px-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 space-y-3 shrink-0">
          <div className="space-y-2 relative">
            <div className="app-masthead">
              <button
                type="button"
                onClick={() => openHelp()}
                className="app-masthead-brand"
                aria-label="Open YouDO guide"
                title="Guide"
              >
                <YouDoWordmark />
              </button>
              <span className="app-masthead-sep" aria-hidden="true" />
              <p className="app-masthead-meta">
                {view === 'goals'
                  ? 'Goals'
                  : view === 'calendar'
                    ? 'Calendar'
                    : view === 'board'
                      ? 'Board'
                      : new Date().toLocaleDateString(undefined, {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short',
                        })}
              </p>
            </div>
            <blockquote className="quote-ticker m-0">
              <div className="quote-ticker-track">
                {[0, 1].map((copy) => (
                  <p key={copy} className="quote-ticker-item" aria-hidden={copy === 1}>
                    “{randomQuote.text}”
                    {randomQuote.author !== 'Unknown' && (
                      <cite className="font-mono text-[10px] tracking-[0.1em] uppercase text-content-muted not-italic">
                        {' · '}
                        {randomQuote.author}
                      </cite>
                    )}
                  </p>
                ))}
              </div>
            </blockquote>

            {view === 'tasks' && (
              <div
                className="today-progress-strip mx-auto w-[86%] space-y-1.5"
                aria-label={`Today progress ${todayDone} of ${todayCount}, ${todayProgress} percent`}
              >
                <div className="flex items-center justify-between gap-2 px-0.5">
                  <span className="text-[11px] font-semibold text-content-secondary">Today</span>
                  <span className="text-[11px] font-semibold tabular-nums text-content-primary">
                    {todayDone}/{todayCount}
                    <span className="text-content-muted font-medium"> · {todayProgress}%</span>
                  </span>
                </div>
                <div className="progress-track h-1 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary progress-bar-fill"
                    style={{ width: `${todayProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </header>

        {/* Main View Area */}
        <main className="mt-3">
          <div
            key={`${view}-${goalPathIds.join('-')}`}
            className={
              slideDirection === 'right'
                ? 'slide-in-right'
                : slideDirection === 'left'
                  ? 'slide-in-left'
                  : 'view-fade'
            }
          >
            {view === 'tasks' ? (
              <div className="space-y-3">
                {user && tasks.length === 0 && goals.length === 0 && (
                  <div className="p-3.5 bg-primary-soft border border-subtle flex items-center justify-between gap-3 rounded-[16px]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Cloud className="w-4 h-4 text-primary shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-content-primary">Cloud backup ready</div>
                        <div className="text-[11px] text-content-muted truncate">Restore your goals and tasks</div>
                      </div>
                    </div>
                    <button
                      aria-label="Restore data from cloud backup"
                      onClick={async () => {
                        const ok = await restoreFromCloud();
                        setCloudHint(ok ? 'Restored from cloud.' : 'No cloud backup for this account.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-primary text-on-primary text-xs font-semibold shrink-0"
                    >
                      Restore
                    </button>
                  </div>
                )}
                {cloudHint && (
                  <p className="text-[12px] text-content-secondary px-1">{cloudHint}</p>
                )}

                <div className="flex items-center gap-1 p-1 rounded-[16px] bg-surface border border-subtle w-full">
                  <button
                    onClick={() => startTransition(() => setTodaySubTab('today'))}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'today'
                        ? 'bg-elevated text-content-primary border border-subtle'
                        : 'text-content-secondary'
                    }`}
                  >
                    <span>Scheduled</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${todaySubTab === 'today' ? 'bg-primary text-on-primary' : 'bg-base text-content-muted'}`}>
                      {openTodayCount}
                    </span>
                  </button>
                  <button
                    onClick={() => startTransition(() => setTodaySubTab('backlog'))}
                    className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'backlog'
                        ? 'bg-elevated text-error border border-error-soft'
                        : 'text-content-secondary'
                    }`}
                  >
                    <AlertTriangle size={13} className={openBacklogCount > 0 ? 'text-error' : 'text-content-muted'} />
                    <span>Backlog</span>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${openBacklogCount > 0 ? 'bg-error text-white' : 'bg-base text-content-muted'}`}>
                      {openBacklogCount}
                    </span>
                  </button>
                </div>

                {streakStatus.revive?.active && (
                  <button
                    type="button"
                    onClick={() => {
                      if (streakStatus.revive?.mode === 'backlog') {
                        startTransition(() => setTodaySubTab('backlog'));
                      }
                    }}
                    className="w-full text-left bg-surface border border-subtle rounded-[16px] px-3.5 py-2.5 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                        Restore streak
                      </p>
                      <p className="text-[12px] text-content-secondary mt-0.5">
                        {streakStatus.revive.mode === 'challenge' && streakStatus.revive.challengeBarHours != null
                          ? `${streakStatus.revive.challengeBarHours}h challenge`
                          : `${streakStatus.revive.remainingTasks} backlog · ${streakStatus.revive.remainingScheduled} scheduled`}
                        {reviveDeadlineLabel ? ` · ${reviveDeadlineLabel}` : ''}
                      </p>
                    </div>
                    <Flame size={16} className="text-primary shrink-0" />
                  </button>
                )}

                {/* Smart Goal & Category Filter Chips */}
                {categoryChips.length > 1 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 text-[11px] fade-in">
                    <button
                      onClick={() => setActiveCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded-xl font-bold whitespace-nowrap border transition ${
                        activeCategoryFilter === 'all'
                          ? 'bg-primary text-white border-primary'
                          : 'bg-surface border-subtle text-content-secondary hover:bg-elevated'
                      }`}
                    >
                      All ({todaySubTab === 'today' ? openTodayCount : openBacklogCount})
                    </button>
                    {categoryChips.map((chip) => (
                      <button
                        key={chip.id}
                        onClick={() => setActiveCategoryFilter(chip.id)}
                        className={`px-2.5 py-1 rounded-xl font-bold whitespace-nowrap border transition flex items-center gap-1 ${
                          activeCategoryFilter === chip.id
                            ? 'bg-primary text-white border-primary'
                            : 'bg-surface border-subtle text-content-secondary hover:bg-elevated'
                        }`}
                      >
                        <span className="truncate max-w-[130px]">{chip.label}</span>
                        <span className="text-[9.5px] font-semibold px-1.5 py-0.2 rounded-full bg-white/10 text-content-muted">
                          {chip.count}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Task List */}
                {todaySubTab === 'today' ? (
                  sortedTasks.length === 0 ? (
                    <EmptyState onAdd={() => openAddTask()} />
                  ) : (
                    <div className="space-y-2.5 fade-in">
                      {sortedTasks.map((t) => {
                        const isOtherTaskDimmed = activeSession !== null && activeSession.taskId !== t.id;
                        return (
                          <div key={t.id} className={isOtherTaskDimmed ? 'card-dimmed transition-all' : 'transition-all'}>
                            <TaskCard
                              task={t}
                              activeSession={activeSession}
                              onAdvance={advance}
                              onUndo={undo}
                              onDelete={t.goalNodeId ? unlinkTask : removeTask}
                              onDuplicate={duplicateTask}
                              onDragStart={(id) => setDragId(id)}
                              onDragEnter={(id) => setOverId(id)}
                              onDragEnd={doReorder}
                              isDragging={dragId === t.id}
                              dragOver={overId === t.id && dragId !== t.id}
                              originNodes={originNodesFor(t.id)}
                              softRemove={!!t.goalNodeId}
                              dark={darkMode}
                              onJumpToGoal={() => t.goalNodeId && jumpToGoalTask(t.goalNodeId)}
                              onOpenDescription={openDescriptionModal}
                              onStartSession={startSession}
                              onPauseSession={pauseSession}
                              onResumeSession={resumeSession}
                              onStopSession={() => setStopDialogTask(t)}
                              onOpenAmbient={() => setShowAmbient(true)}
                              taskSessions={getTaskSessions(t.id)}
                              streakSave={reviveScheduledIds.has(t.id)}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )
                ) : (
                  /* ─────────── BACKLOG TAB ─────────── */
                  <div className="space-y-4 fade-in">
                    {/* Summary header */}
                    {backlogTasks.length > 0 ? (
                      <div className="bg-surface p-4 space-y-2 border border-subtle rounded-[16px]">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-content-primary">
                              {openBacklogCount} overdue
                            </p>
                            <p className="text-[12px] text-content-muted">
                              Across {openBacklogDateCount} date{openBacklogDateCount > 1 ? 's' : ''}
                            </p>
                            {streakStatus.revive?.active && streakStatus.revive.mode === 'backlog' && (
                              <p className="text-[12px] text-primary mt-1.5">
                                {streakStatus.revive.remainingTasks} marked Save streak
                                {' · '}
                                {streakStatus.revive.daysLeft === 1
                                  ? '1 day left'
                                  : `${streakStatus.revive.daysLeft} days left`}
                              </p>
                            )}
                            {streakStatus.revive?.active && streakStatus.revive.mode === 'challenge' && (
                              <p className="text-[12px] text-primary mt-1.5">
                                Focus challenge: {streakStatus.revive.challengeBarHours}h to restore
                                {' · '}
                                {streakStatus.revive.daysLeft === 1
                                  ? '1 day left'
                                  : `${streakStatus.revive.daysLeft} days left`}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Oldest</p>
                            <p className="text-xs font-semibold text-error">
                              {backlogByDate.length > 0 ? backlogByDate[backlogByDate.length - 1].formattedDate : '—'}
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-surface p-8 border border-subtle rounded-[16px] text-center space-y-2">
                        <Flame size={20} className="mx-auto text-content-muted" />
                        <h3 className="text-sm font-semibold text-content-primary">Clear slate</h3>
                        <p className="text-[12px] text-content-muted max-w-xs mx-auto">
                          Nothing overdue. Keep the streak.
                        </p>
                      </div>
                    )}

                    {/* Date-grouped task lists */}
                    {(() => {
                      const activeBacklogTask = activeSession
                        ? backlogTasks.find((t) => t.id === activeSession.taskId)
                        : undefined;
                      return (
                        <>
                          {activeBacklogTask && (
                            <div className="space-y-2">
                              <TaskCard
                                task={activeBacklogTask}
                                activeSession={activeSession}
                                onAdvance={advance}
                                onUndo={undo}
                                onDelete={activeBacklogTask.goalNodeId ? unlinkTask : removeTask}
                                onDuplicate={duplicateTask}
                                onDragStart={() => {}}
                                onDragEnter={() => {}}
                                onDragEnd={() => {}}
                                isDragging={false}
                                dragOver={false}
                                originNodes={originNodesFor(activeBacklogTask.id)}
                                softRemove={!!activeBacklogTask.goalNodeId}
                                dark={darkMode}
                                onJumpToGoal={() => activeBacklogTask.goalNodeId && jumpToGoalTask(activeBacklogTask.goalNodeId)}
                                onOpenDescription={openDescriptionModal}
                                onStartSession={startSession}
                                onPauseSession={pauseSession}
                                onResumeSession={resumeSession}
                                onStopSession={() => setStopDialogTask(activeBacklogTask)}
                                onOpenAmbient={() => setShowAmbient(true)}
                                taskSessions={getTaskSessions(activeBacklogTask.id)}
                                streakSave={reviveSaveIds.has(activeBacklogTask.id)}
                              />
                            </div>
                          )}
                    {reviveSaveTasks.filter((t) => t.id !== activeSession?.taskId).length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 px-0.5">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-soft text-primary">
                            <Flame size={11} />
                            <span className="text-[11px] font-semibold">To restore streak</span>
                          </div>
                          <span className="text-[10px] font-semibold text-content-secondary">
                            {streakStatus.revive?.daysLeft === 1
                              ? '1 day left'
                              : `${streakStatus.revive?.daysLeft ?? 0} days left`}
                          </span>
                          <div className="flex-1 h-px bg-border/60" />
                        </div>
                        <div className="space-y-2">
                          {reviveSaveTasks
                            .filter((t) => t.id !== activeSession?.taskId)
                            .map((t) => (
                              <TaskCard
                                key={t.id}
                                task={t}
                                activeSession={activeSession}
                                onAdvance={advance}
                                onUndo={undo}
                                onDelete={t.goalNodeId ? unlinkTask : removeTask}
                                onDuplicate={duplicateTask}
                                onDragStart={() => {}}
                                onDragEnter={() => {}}
                                onDragEnd={() => {}}
                                isDragging={false}
                                dragOver={false}
                                originNodes={originNodesFor(t.id)}
                                softRemove={!!t.goalNodeId}
                                dark={darkMode}
                                onJumpToGoal={() => t.goalNodeId && jumpToGoalTask(t.goalNodeId)}
                                onOpenDescription={openDescriptionModal}
                                onStartSession={startSession}
                                onPauseSession={pauseSession}
                                onResumeSession={resumeSession}
                                onStopSession={() => setStopDialogTask(t)}
                                onOpenAmbient={() => setShowAmbient(true)}
                                taskSessions={getTaskSessions(t.id)}
                                streakSave
                                backlogAction={
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handlePushBacklogTask(t);
                                    }}
                                    className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-subtle text-error hover:bg-error-soft shrink-0"
                                    title="Reschedule task"
                                  >
                                    <Zap size={12} className="text-error" /> Reschedule
                                  </button>
                                }
                              />
                            ))}
                        </div>
                      </div>
                    )}
                    {backlogByDate.map((group) => {
                      const groupTasks = group.tasks.filter((t) => !reviveSaveIds.has(t.id));
                      if (groupTasks.length === 0) return null;
                      return (
                      <div key={group.date} className="space-y-2">
                        {/* Group header row */}
                        <div className="flex items-center gap-2 px-0.5">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error-soft text-error">
                            <Calendar size={11} />
                            <span className="text-[11px] font-semibold">{group.formattedDate}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-content-secondary">
                            {groupTasks.length} task{groupTasks.length > 1 ? 's' : ''}
                          </span>
                          <div className="flex-1 h-px bg-border/60" />
                        </div>

                        {/* Task cards */}
                        <div className="space-y-2">
                          {groupTasks.map((t) => {
                            const isOtherTaskDimmed = activeSession !== null && activeSession.taskId !== t.id;
                            return (
                              <div key={t.id} className={isOtherTaskDimmed ? 'card-dimmed transition-all' : 'transition-all'}>
                                <TaskCard
                                  task={t}
                                  activeSession={activeSession}
                                  onAdvance={advance}
                                  onUndo={undo}
                                  onDelete={t.goalNodeId ? unlinkTask : removeTask}
                                  onDuplicate={duplicateTask}
                                  onDragStart={() => {}}
                                  onDragEnter={() => {}}
                                  onDragEnd={() => {}}
                                  isDragging={false}
                                  dragOver={false}
                                  originNodes={originNodesFor(t.id)}
                                  softRemove={!!t.goalNodeId}
                                  dark={darkMode}
                                  onJumpToGoal={() => t.goalNodeId && jumpToGoalTask(t.goalNodeId)}
                                  onOpenDescription={openDescriptionModal}
                                  onStartSession={startSession}
                                  onPauseSession={pauseSession}
                                  onResumeSession={resumeSession}
                              onStopSession={() => setStopDialogTask(t)}
                              onOpenAmbient={() => setShowAmbient(true)}
                                  taskSessions={getTaskSessions(t.id)}
                                  streakSave={reviveSaveIds.has(t.id)}
                                  backlogAction={
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePushBacklogTask(t);
                                      }}
                                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl border border-subtle text-error hover:bg-error-soft shrink-0"
                                      title="Reschedule task"
                                    >
                                      <Zap size={12} className="text-error" /> Reschedule
                                    </button>
                                  }
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                    })}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : view === 'calendar' ? (
              <CalendarView
                tasks={tasks}
                onAddTask={(date) => openAddTask(date)}
                onJumpToGoal={jumpToGoalTask}
              />
            ) : view === 'board' ? (
              <BoardView
                onSignIn={() => {
                  pushModalState();
                  setAuthMode('signin');
                  setAuthOpen(true);
                }}
              />
            ) : (
              <GoalView
                pathIds={goalPathIds}
                setPathIds={setGoalPathIds}
                highlightNodeId={highlightNodeId}
                onAddChild={openAddGoal}
                onEditNode={openEditGoal}
                onPushNode={handlePushNode}
                onUnplan={unlinkTask}
                onCopy={copyGoalNode}
                onCopyMany={copyGoalNodes}
                onDeleteMany={deleteGoalNodes}
                onSelectionChange={handleSelectionChange}
                clearSelectionRef={clearSelectionRef}
                onNavigateToPath={navigateToGoalPath}
                onOpenDescription={openDescriptionModal}
                onOpenStudio={openBlueprintStudio}
              />
            )}
          </div>
        </main>

        {/* FAB */}
        {view === 'tasks' && (
          <button
            onClick={() => openAddTask()}
            className="fixed bottom-20 right-4 w-12 h-12 rounded-full text-on-primary grid place-items-center bg-primary shadow-elevated z-30"
            title="Add task"
            aria-label="Add new task"
          >
            <Plus size={24} />
          </button>
        )}

        {/* Bottom Command Bar */}
      <CommandBar
        view={view}
        onNavigate={handlePrimaryNavigate}
          onSettings={openSettings}
          todayCount={todayCount}
          todayDone={todayDone}
          goalsCount={goals.length}
          batch={batchSelectedIds.length > 0 ? {
            count: batchSelectedIds.length,
            scheduleCount: batchLeafGroups.schedule.length,
            replanCount: batchLeafGroups.replan.length,
            unplanCount: batchLeafGroups.unplan.length,
            onCopy: handleBatchCopy,
            onDelete: handleBatchDelete,
            onSchedule: handleBatchSchedule,
            onReplan: handleBatchReplan,
            onUnplan: handleBatchUnplan,
            onCancel: handleBatchCancel,
          } : undefined}
          paste={clipboard.length > 0 && view === 'goals' ? {
            title: clipboard.length === 1 ? clipboard[0].title : `${clipboard.length} copied items`,
            targetName: (() => {
              if (goalPathIds.length === 0) return 'root level';
              const current = findGoal(goals, goalPathIds[goalPathIds.length - 1]);
              return current ? current.title : 'root level';
            })(),
            onPaste: () => pasteGoalNode(goalPathIds.length > 0 ? goalPathIds[goalPathIds.length - 1] : null),
            onCancel: clearClipboard,
          } : undefined}
        />
      </div>

      <AddTaskSheet open={sheetOpen} onClose={closeSheet} onAdd={addTask} initialDate={sheetInitialDate} />
      <AddGoalSheet
        open={goalSheetOpen}
        parentId={goalParentId}
        parentKind={goalParentKind}
        editing={editingNode}
        onClose={closeGoalSheet}
        onAddRoot={addGoalRoot}
        onAddChild={addChildNode}
        onUpdateNode={updateGoalNode}
        onDeleteNode={(id) => { for (const root of goals) deleteGoalNode(root.id, id); }}
      />
      {blueprintStudioOpen && <BlueprintStudio
        open={blueprintStudioOpen}
        goals={goals}
        onClose={closeBlueprintStudio}
        onCommit={(base, next, title) => {
          const result = applyGoalTreeChange(base, next);
          if (result.ok && result.token) setBlueprintUndo({ token: result.token, title });
          return result;
        }}
      />}
      <StepSliceSheet
        open={sliceNodes.length > 0}
        nodes={sliceNodes}
        onClose={closeSliceNode}
        onConfirm={(plans, targetDate) => {
          for (const plan of plans) planTask(plan.nodeId, targetDate, plan.stepSlice);
        }}
      />
      <SettingsSheet
        open={settingsOpen}
        onClose={closeSettings}
        streakBarHours={streakMeta.barHours}
        onStreakBarHoursChange={setStreakBarHours}
        onOpenAuth={(mode) => {
          pushModalState();
          setAuthMode(mode || 'signin');
          setAuthOpen(true);
        }}
      />

      {/* Description Viewer Modal */}
      {descModalData && (
        <Overlay open onClose={closeDescriptionModal} align="center">
          <div className="panel sheet-up p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between pb-3 border-b border-subtle gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-primary-soft text-primary border border-primary shrink-0 mt-0.5">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Full Description</span>
                  <h3 className="text-base font-semibold text-content-primary leading-snug break-words">{descModalData.title}</h3>
                </div>
              </div>
              <button onClick={closeDescriptionModal} className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar text-sm leading-relaxed text-content-primary whitespace-pre-wrap font-medium bg-surface p-4 rounded-[12px] border border-subtle">
              {descModalData.description}
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Ambient Screen Component ── */}
      {showAmbient && activeSession && activeTask && (
        <AmbientScreen
          activeSession={activeSession}
          task={activeTask}
          origin={originNodesFor(activeTask.id)?.map(n => n.title).join(' / ')}
          onPause={pauseSession}
          onResume={resumeSession}
          onStop={() => { setShowAmbient(false); setStopDialogTask(activeTask); }}
          onMinimize={() => setShowAmbient(false)}
          onJumpToGoal={activeTask.goalNodeId ? () => jumpToGoalTask(activeTask.goalNodeId) : undefined}
        />
      )}

      {/* ── Session Stop Dialog ── */}
      {stopDialogTask && (
        <SessionStopDialog
          key={stopDialogTask.id}
          open={!!stopDialogTask}
          task={stopDialogTask}
          onCancel={() => setStopDialogTask(null)}
          onDiscard={() => {
            discardSession();
            setStopDialogTask(null);
            setRecoverySessionPrompt(false);
            setReconstructOpen(false);
          }}
          onConfirm={(outcome) => {
            stopSession(outcome);
            if (outcome.completed === true || (outcome.completedStepIndices?.length ?? 0) > 0) {
              completeSessionSteps(stopDialogTask.id, outcome.completedStepIndices ?? []);
            }
            setStopDialogTask(null);
            setRecoverySessionPrompt(false);
            setReconstructOpen(false);
          }}
        />
      )}

      {/* ── Device clock integrity ── */}
      {clockBlocked && (
        <Overlay open align="center">
          <div className="panel sheet-up p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <AlertTriangle className="w-5 h-5" />
              <span>Device time looks wrong</span>
            </div>
            <p className="text-xs text-content-secondary leading-relaxed">
              Date &amp; time on this device does not match the server. Focus time on this phone may be off until you fix it. Cloud sync still works.
              Set Date &amp; Time to <span className="font-semibold text-content-primary">automatic</span>, then confirm below — or continue anyway.
            </p>
            {clockVerifyError && (
              <p className="text-xs text-red-500 leading-relaxed">{clockVerifyError}</p>
            )}
            <div className="flex flex-col gap-2 pt-1">
              <button
                disabled={clockVerifyBusy}
                onClick={async () => {
                  setClockVerifyError(null);
                  setClockVerifyBusy(true);
                  const clock = await assertDeviceClock();
                  setClockVerifyBusy(false);
                  if (!clock.ok) {
                    setClockVerifyError(clock.reason ?? 'Still mismatched. Set automatic date & time.');
                    return;
                  }
                  clearClockIncident();
                  setClockBlocked(false);
                  if (!user) {
                    setAuthMode('signin');
                    setAuthOpen(true);
                  }
                }}
                className="w-full py-2.5 px-3 rounded-xl border border-subtle text-content-primary font-semibold text-xs disabled:opacity-60"
              >
                {clockVerifyBusy ? 'Checking…' : 'I fixed date & time'}
              </button>
              <button
                onClick={() => setClockBlocked(false)}
                className="w-full py-2.5 px-3 rounded-xl text-content-secondary font-medium text-xs"
              >
                Continue anyway
              </button>
              {!user && (
              <button
                onClick={() => {
                  setAuthMode('signin');
                  setAuthOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-primary text-on-primary font-semibold text-xs"
              >
                Sign in
              </button>
              )}
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Auth Modal ── */}
      <AuthModal open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />

      {/* ── Session Crash Recovery Dialog ── */}
      {recoverySessionPrompt && activeSession && activeTask && !reconstructOpen && !activeSession.isPaused && (
        <Overlay open align="center">
          <div className="panel sheet-up p-5 space-y-4">
            <div className="flex items-center gap-2 text-primary font-semibold text-sm">
              <Clock className="w-5 h-5" />
              <span>Session still running</span>
            </div>
            <p className="text-xs text-content-secondary leading-relaxed">
              <span className="font-semibold text-content-primary">{activeTask.title}</span> was still in a focus session.
              If you kept working with the phone aside, resume — that time is kept.
              If you forgot to stop, pick when you actually finished.
              If you fell asleep or this sitting should not count, discard it.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => {
                  continueInterruptedSession();
                  setRecoverySessionPrompt(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl bg-primary text-on-primary font-semibold text-xs"
              >
                Resume — I kept working
              </button>
              <button
                onClick={() => {
                  setRecoverySessionPrompt(false);
                  setReconstructOpen(true);
                }}
                className="w-full py-2.5 px-3 rounded-xl text-content-primary font-medium text-xs border border-subtle"
              >
                I forgot to stop
              </button>
              <button
                onClick={() => {
                  discardSession();
                  setRecoverySessionPrompt(false);
                }}
                className="w-full py-2.5 px-3 rounded-xl text-content-secondary font-medium text-xs"
              >
                Discard — I fell asleep
              </button>
            </div>
          </div>
        </Overlay>
      )}

      {reconstructOpen && activeSession && activeTask && (
        <SessionReconstructSheet
          open
          task={activeTask}
          session={activeSession}
          onCancel={() => {
            setReconstructOpen(false);
            const session = activeSessionRef.current;
            if (session && shouldOfferSessionRecovery(session, Date.now())) {
              setRecoverySessionPrompt(true);
            }
          }}
          onWasNotWorking={() => {
            discardSession();
            setReconstructOpen(false);
          }}
          onSave={({ endTime, completed, completedStepIndices }) => {
            stopSession({ completed, completedStepIndices }, { endTime, ignoreOpenPause: true });
            if (completed === true || completedStepIndices.length > 0) {
              completeSessionSteps(activeTask.id, completedStepIndices);
            }
            setReconstructOpen(false);
          }}
        />
      )}

      {/* ── Help Center Sheet ── */}
      <HelpCenterSheet
        open={helpOpen}
        onClose={() => {
          setHasSeenHelp(true);
          setHelpOpen(false);
        }}
      />
      <TodayBriefingSheet
        open={briefingOpen}
        todayTasks={todayTasks}
        openTodayCount={openTodayCount}
        todayDone={todayDone}
        openBacklogCount={openBacklogCount}
        oldestBacklogDays={oldestBacklogDays}
        streakStatus={streakStatus}
        sessionHistory={sessionHistory}
        onDismiss={() => {
          setBriefingOpen(false);
        }}
      />
      {blueprintUndo && (
        <UndoToast
          key={blueprintUndo.token}
          title={blueprintUndo.title}
          verb="Applied"
          onUndo={() => {
            undoGoalTreeChange(blueprintUndo.token);
            setBlueprintUndo(null);
          }}
          onGone={() => setBlueprintUndo(null)}
        />
      )}
      {!blueprintUndo && lastDeletedNotification && (
        <UndoToast
          key={lastDeletedNotification.id}
          title={lastDeletedNotification.title}
          onUndo={() => {
            restoreDeletedGoal(lastDeletedNotification.id);
            clearDeletedNotification();
          }}
          onGone={clearDeletedNotification}
        />
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-16 flex flex-col items-center justify-center text-center px-6 fade-in">
      <div className="w-16 h-16 rounded-[16px] bg-surface shadow-card border border-subtle flex items-center justify-center mb-5">
        <ListChecks size={28} className="text-primary" />
      </div>
      <h3 className="text-[16px] font-semibold text-content-primary tracking-tight">Nothing on today</h3>
      <p className="mt-2 text-[13px] text-content-secondary max-w-[260px] leading-relaxed">
        Schedule a piece from Goals, or add a quick task for this date.
      </p>
      <button
        onClick={onAdd}
        className="mt-7 flex items-center gap-2 px-5 py-2.5 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold"
      >
        <Plus size={16} />
        Add Quick Task
      </button>
    </div>
  );
}
