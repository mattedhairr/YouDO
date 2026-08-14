import { useCallback, useEffect, useMemo, useRef, useState, startTransition } from 'react';
import { AlertTriangle, Calendar, FileText, Flame, ListChecks, Plus, Quote, X, Zap, Clock, Cloud, Trash2 } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { GoalKind, GoalNode, Task, View, TaskSession } from './types';
import { useNavigationSync } from './hooks/useNavigationSync';
import { findNode, formatDDMMYYYY, isBacklogTask, isTaskComplete, isToday, pathNodes, pathTitles, useStore } from './store';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import TaskCard from './components/TaskCard';
import AddTaskSheet from './components/AddTaskSheet';
import CommandBar from './components/CommandBar';
import SettingsSheet from './components/SettingsSheet';
import GoalView from './components/GoalView';
import AddGoalSheet from './components/AddGoalSheet';
import StepSliceSheet from './components/StepSliceSheet';
import CalendarView from './components/CalendarView';
import { AmbientScreen } from './components/AmbientScreen';
import { SessionStopDialog } from './components/SessionStopDialog';
import { TaskSessionStats } from './components/TaskSessionStats';
import { AuthModal } from './components/AuthModal';
import { useTheme } from './hooks/useTheme';

const MOTIVATIONAL_QUOTES = [
  { text: "Giving up is not in the blood sir... not in the blood", author: "Nimsdai Purja" },
  { text: "Dream is not that which you see while sleeping, it is something that does not let you sleep.", author: "Dr. A.P.J. Abdul Kalam" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "Cultivation of mind should be the ultimate aim of human existence.", author: "Dr. B.R. Ambedkar" },
  { text: "Arise, awake, and stop not till the goal is reached.", author: "Swami Vivekananda" },
  { text: "At dawn, when you have trouble getting out of bed, tell yourself: 'I have to go to work — as a human being.'", author: "Marcus Aurelius" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
];

function YouDoIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M4 4L11.5 13.5V20"
        style={{ stroke: 'var(--primary)' }}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 4L11.5 13.5L8.5 10"
        style={{ stroke: 'var(--secondary)' }}
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
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
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
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
    // Session state & actions
    activeSession,
    restoreFromCloud,
    sessionHistory,
    startSession,
    pauseSession,
    resumeSession,
    stopSession,
    discardSession,
    heartbeatSession,
    completeSessionSteps,
  } = useStore();

  const { user } = useAuth();
  const [{ darkMode }] = useTheme();


  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialDate, setSheetInitialDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
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
  const [statsTarget, setStatsTarget] = useState<{ id: string; title: string; isGoal?: boolean } | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [recoverySessionPrompt, setRecoverySessionPrompt] = useState<boolean>(false);

  // Heartbeat timer (30s)
  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(heartbeatSession, 30_000);
    return () => clearInterval(interval);
  }, [activeSession, heartbeatSession]);

  const targetSessions = useMemo(() => {
    if (!statsTarget) return [];
    if (!statsTarget.isGoal) {
      return sessionHistory[statsTarget.id] ?? [];
    }
    // For a goal, gather all sessions with matching goalNodeId
    return Object.values(sessionHistory).flat().filter(s => s.goalNodeId === statsTarget.id);
  }, [statsTarget, sessionHistory]);

  // Crash / Interrupted Session Recovery check on startup
  useEffect(() => {
    if (activeSession && activeSession.lastHeartbeat) {
      const msSinceHeartbeat = Date.now() - activeSession.lastHeartbeat;
      if (msSinceHeartbeat > 300_000) { // 5 mins
        setRecoverySessionPrompt(true);
      }
    }
  }, []);

  // Batch selection state
  const [batchSelectedIds, setBatchSelectedIds] = useState<string[]>([]);
  const [batchLeafIds, setBatchLeafIds] = useState<string[]>([]);
  const clearSelectionRef = useRef<() => void>(() => {});

  const handleSelectionChange = useCallback((ids: string[], leafIds: string[]) => {
    setBatchSelectedIds(ids);
    setBatchLeafIds(leafIds);
  }, []);

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
    if (statsTarget) {
      setStatsTarget(null);
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
    if (settingsOpen) {
      setSettingsOpen(false);
      return true;
    }
    if (sliceNodes.length > 0) {
      setSliceNodes([]);
      return true;
    }
    return false;
  };

  const handleModalPopState = useCallback(() => {
    return modalCloseRef.current();
  }, []);

  const { view, goalPathIds, slideDirection, setGoalPathIds, handleNavigateTab, navigateToGoalPath } =
    useNavigationSync(handleModalPopState);
  const tabs: View[] = useMemo(() => ['tasks', 'goals', 'calendar'], []);

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

  const handleBatchSchedule = useCallback(() => {
    if (batchLeafIds.length === 0) return;
    const allNodes: GoalNode[] = [];
    const flatten = (n: GoalNode) => { allNodes.push(n); n.children.forEach(flatten); };
    goals.forEach(flatten);
    const selectedNodes = allNodes.filter((n) => batchLeafIds.includes(n.id));
    if (selectedNodes.length === 0) return;
    pushModalState();
    setSliceNodes(selectedNodes);
    clearSelectionRef.current();
    setBatchSelectedIds([]);
    setBatchLeafIds([]);
  }, [batchLeafIds, goals, pushModalState]);

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

  useEffect(() => {
    const initStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        /* fallback */
      }
    };
    initStatusBar();
  }, []);

  const [todaySubTab, setTodaySubTab] = useState<'today' | 'backlog'>('today');

  const todayTasks = useMemo(() => tasks.filter((t) => isToday(t.targetDate)), [tasks]);
  const backlogTasks = useMemo(() => tasks.filter(isBacklogTask), [tasks]);
  const todayCount = todayTasks.length;
  const todayDone = todayTasks.filter(isTaskComplete).length;
  const todayProgress = todayCount > 0 ? Math.round((todayDone / todayCount) * 100) : 0;

  const activeTask = useMemo(() => {
    if (!activeSession) return null;
    return tasks.find((t) => t.id === activeSession.taskId) ?? null;
  }, [activeSession, tasks]);

  const backlogByDate = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of backlogTasks) {
      const d = t.targetDate || 'No Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    }
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => {
      const sortedGroupTasks = groups[date].sort((a, b) => {
        if (activeSession) {
          if (a.id === activeSession.taskId) return -1;
          if (b.id === activeSession.taskId) return 1;
        }
        return a.order - b.order;
      });
      return {
        date,
        formattedDate: formatDDMMYYYY(date),
        tasks: sortedGroupTasks,
      };
    });
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

  const originNodesFor = (taskId: string): { title: string; kind: GoalKind }[] | undefined => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.goalNodeId) return undefined;
    for (const root of goals) {
      const nodes = pathNodes(root, task.goalNodeId);
      if (nodes.length) return nodes.slice(0, -1).map(n => ({ title: n.title, kind: n.kind }));
    }
    return undefined;
  };

  const getTaskSessions = (taskId: string): TaskSession[] => {
    return sessionHistory[taskId] || [];
  };

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

  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string>('all');

  const categoryChips = useMemo(() => {
    const activeTasksList = todaySubTab === 'today' ? todayTasks : backlogTasks;
    const map = new Map<string, { id: string; label: string; count: number }>();

    let quickCount = 0;
    for (const t of activeTasksList) {
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
      if (sheetOpen || goalSheetOpen || settingsOpen || sliceNodes.length > 0 || showAmbient || stopDialogTask || statsTarget) return;
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
    [sheetOpen, goalSheetOpen, settingsOpen, sliceNodes, showAmbient, stopDialogTask, statsTarget],
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
    (_e: React.TouchEvent) => {
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

  return (
    <div className="min-h-screen relative overflow-x-hidden transition-colors duration-300">

      <div
        className="relative z-10 min-h-screen w-full max-w-md mx-auto px-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 space-y-2 shrink-0 overflow-hidden">
          <div className="flex items-center justify-between gap-2.5 h-10">
            {/* Left: YouDO Icon + Brand */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-primary-soft text-primary shrink-0">
                <YouDoIcon size={18} />
              </span>
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-content-muted font-extrabold leading-none">YouDO</div>
                <div className="text-[13px] font-extrabold text-content-primary leading-tight mt-0.5">
                  {view === 'goals'
                    ? 'Goals'
                    : view === 'calendar'
                      ? 'Calendar'
                      : new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>

            {/* Right: Marquee Quote Ticker */}
            <div className="flex-1 min-w-0 bg-surface h-10 px-3 flex items-center gap-2 border border-subtle overflow-hidden rounded-2xl shadow-card">
              <Quote size={12} className="text-primary shrink-0" />
              <div className="marquee-container flex-1">
                <div className="marquee-content text-[11px] italic font-medium text-content-secondary">
                  "{randomQuote.text}" <span className="not-italic font-extrabold text-primary text-[10px] ml-1.5">— {randomQuote.author}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Today Tab Progress Bar */}
          {view === 'tasks' && (
            <div className="bg-surface p-2.5 space-y-1.5 border border-subtle rounded-2xl shadow-card">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-content-primary">Scheduled Progress</span>
                <span className="text-primary tabular-nums">
                  {todayDone}/{todayCount} tasks • {todayProgress}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-elevated overflow-hidden">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--primary),var(--secondary))] progress-bar-fill"
                  style={{ width: `${todayProgress}%` }}
                />
              </div>
            </div>
          )}
        </header>

        {/* Main View Area */}
        <main className="mt-3 overflow-hidden">
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
                {/* Cloud Backup Available Banner */}
                {user && tasks.length === 0 && goals.length === 0 && (
                  <div className="p-3.5 bg-primary-soft border border-primary flex items-center justify-between gap-3 animate-fade-in shadow-lg rounded-2xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Cloud className="w-5 h-5 text-primary shrink-0 animate-bounce" />
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-content-primary">Cloud Backup Ready</div>
                        <div className="text-[10.5px] text-content-muted font-medium truncate">Restore your study goals &amp; tasks</div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await restoreFromCloud();
                        if (!ok) alert('No cloud backup found for this account.');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-glow text-white text-xs font-extrabold shrink-0 transition active:scale-95"
                    >
                      Restore Cloud Data
                    </button>
                  </div>
                )}

                {/* Today vs Backlog Sub-tabs */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-surface border border-subtle w-full">
                  <button
                    onClick={() => startTransition(() => setTodaySubTab('today'))}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'today'
                        ? 'bg-elevated text-content-primary shadow-elevated border border-subtle'
                        : 'text-content-secondary hover:text-content-primary'
                    }`}
                  >
                    <span>Scheduled</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${todaySubTab === 'today' ? 'bg-primary text-white' : 'bg-surface text-content-muted'}`}>
                      {todayTasks.length}
                    </span>
                  </button>
                  <button
                    onClick={() => startTransition(() => setTodaySubTab('backlog'))}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'backlog'
                        ? 'bg-elevated text-error shadow-elevated border border-error-soft'
                        : 'text-content-secondary hover:text-error'
                    }`}
                  >
                    <AlertTriangle size={13} className={backlogTasks.length > 0 ? 'text-error' : 'text-content-secondary'} />
                    <span>Backlog</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${backlogTasks.length > 0 ? 'bg-error text-white' : 'bg-surface text-content-muted'}`}>
                      {backlogTasks.length}
                    </span>
                  </button>
                </div>

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
                      All ({todaySubTab === 'today' ? todayTasks.length : backlogTasks.length})
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
                        <span className="text-[9.5px] font-extrabold px-1.5 py-0.2 rounded-full bg-white/10 text-content-muted">
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
                              onViewStats={(taskToView) => setStatsTarget({ id: taskToView.id, title: taskToView.title, isGoal: false })}
                              onOpenAmbient={() => setShowAmbient(true)}
                              taskSessions={getTaskSessions(t.id)}
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
                      <div className="bg-surface p-4 space-y-3 border border-error-soft rounded-2xl shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-error-soft border border-error flex items-center justify-center text-error shrink-0">
                              <AlertTriangle size={18} />
                            </div>
                            <div>
                              <p className="text-sm font-extrabold text-content-primary">
                                {backlogTasks.length} Task{backlogTasks.length > 1 ? 's' : ''} in Backlog
                              </p>
                              <p className="text-[11px] font-bold text-error">
                                Across {backlogByDate.length} missed date{backlogByDate.length > 1 ? 's' : ''}
                              </p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-extrabold text-content-secondary uppercase tracking-wider">Oldest Due</p>
                            <p className="text-xs font-black text-error">
                              {backlogByDate.length > 0 ? backlogByDate[backlogByDate.length - 1].formattedDate : '—'}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-content-secondary font-semibold leading-relaxed border-t border-error-soft pt-2.5">
                          ⚡ Reschedule or complete these tasks to restore your momentum. Don't let backlog compound!
                        </p>
                      </div>
                    ) : (
                      <div className="bg-surface p-6 border border-subtle rounded-2xl text-center space-y-2">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-transparent text-content-muted/50 mb-1">
                          <Flame size={22} />
                        </div>
                        <h3 className="text-sm font-extrabold text-content-secondary uppercase tracking-wider">Zero Backlog</h3>
                        <p className="text-[12px] text-content-muted font-medium max-w-xs mx-auto">
                          🔥 Outstanding! Every task is on schedule. Keep the streak alive.
                        </p>
                      </div>
                    )}

                    {/* Date-grouped task lists */}
                    {backlogByDate.map((group) => (
                      <div key={group.date} className="space-y-2">
                        {/* Group header row */}
                        <div className="flex items-center gap-2 px-0.5">
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-error-soft border border-error">
                            <Calendar size={11} className="text-error" />
                            <span className="text-[10.5px] font-extrabold text-error">{group.formattedDate}</span>
                          </div>
                          <span className="text-[10px] font-semibold text-content-secondary">
                            {group.tasks.length} task{group.tasks.length > 1 ? 's' : ''}
                          </span>
                          <div className="flex-1 h-px bg-subtle" />
                        </div>

                        {/* Task cards */}
                        <div className="space-y-2">
                          {group.tasks.map((t) => {
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
                                  onStartSession={(id) => {
                                    startSession(id);
                                    startTransition(() => setTodaySubTab('today'));
                                  }}
                                  onPauseSession={pauseSession}
                                  onResumeSession={resumeSession}
                                  onStopSession={() => setStopDialogTask(t)}
                                  onViewStats={(taskToView) => setStatsTarget({ id: taskToView.id, title: taskToView.title, isGoal: false })}
                                  onOpenAmbient={() => setShowAmbient(true)}
                                  taskSessions={getTaskSessions(t.id)}
                                  backlogAction={
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handlePushBacklogTask(t);
                                      }}
                                      className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-error text-error bg-transparent hover:bg-error-soft shadow-sm transition-all active:scale-95 shrink-0"
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
                    ))}
                  </div>
                )}
              </div>
            ) : view === 'calendar' ? (
              <CalendarView
                tasks={tasks}
                onAddTask={(date) => openAddTask(date)}
                onJumpToGoal={jumpToGoalTask}
                onViewStats={(id, title) => setStatsTarget({ id, title, isGoal: false })}
              />
            ) : (
              <GoalView
                accent="var(--primary)"
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
                onViewStats={(id, title) => setStatsTarget({ id, title, isGoal: true })}
              />
            )}
          </div>
        </main>

        {/* Floating Undo Goal Delete Toast */}
        {lastDeletedNotification && (
          <div className="fixed bottom-20 left-4 right-4 max-w-md mx-auto z-40 bg-error-soft border border-error text-content-primary p-3 rounded-2xl shadow-2xl backdrop-blur-md flex items-center justify-between gap-3 animate-sheet-up">
            <div className="flex items-center gap-2 min-w-0">
              <Trash2 size={16} className="text-error shrink-0" />
              <span className="text-xs font-bold truncate">
                Deleted "{lastDeletedNotification.title}"
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => restoreDeletedGoal(lastDeletedNotification.id)}
                className="px-3 py-1 rounded-xl border border-error text-error bg-transparent hover:bg-error shadow-md transition active:scale-95"
              >
                Undo Delete
              </button>
              <button
                onClick={clearDeletedNotification}
                className="p-1 rounded-lg text-content-secondary hover:text-content-primary hover:bg-error"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* FAB */}
        {view === 'tasks' && (
          <button
            onClick={() => openAddTask()}
            className="fixed bottom-20 right-4 w-12 h-12 rounded-full text-white grid place-items-center bg-primary shadow-elevated transition-all active:scale-90 z-30"
            title="Add task"
          >
            <Plus size={24} />
          </button>
        )}

        {/* Bottom Command Bar */}
        <CommandBar
          view={view}
          onNavigate={handleNavigateTab}
          onSettings={openSettings}
          todayCount={todayCount}
          todayDone={todayDone}
          goalsCount={goals.length}
          batch={batchSelectedIds.length > 0 ? {
            count: batchSelectedIds.length,
            leafCount: batchLeafIds.length,
            onCopy: handleBatchCopy,
            onDelete: handleBatchDelete,
            onSchedule: handleBatchSchedule,
            onCancel: handleBatchCancel,
          } : undefined}
          paste={clipboard.length > 0 && view === 'goals' ? {
            title: clipboard.length === 1 ? clipboard[0].title : `${clipboard.length} copied items`,
            targetName: (() => {
              if (goalPathIds.length === 0) return 'root level';
              const findNode = (nodes: GoalNode[], id: string): GoalNode | null => {
                for (const n of nodes) {
                  if (n.id === id) return n;
                  const found = findNode(n.children, id);
                  if (found) return found;
                }
                return null;
              };
              const current = findNode(goals, goalPathIds[goalPathIds.length - 1]);
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
        onOpenAuth={(mode) => {
          pushModalState();
          setAuthMode(mode || 'signin');
          setAuthOpen(true);
        }}
      />

      {/* Description Viewer Modal */}
      {descModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 modal-backdrop animate-fade-in" onClick={closeDescriptionModal} />
          <div className="sheet-up relative w-full max-w-lg bg-elevated border border-subtle rounded-3xl p-5 pb-6 shadow-elevated space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between pb-3 border-b border-subtle gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-primary-soft text-primary border border-primary shrink-0 mt-0.5">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-primary">Full Description</span>
                  <h3 className="text-base font-extrabold text-content-primary leading-snug break-words">{descModalData.title}</h3>
                </div>
              </div>
              <button onClick={closeDescriptionModal} className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition shrink-0">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto no-scrollbar text-sm leading-relaxed text-content-primary whitespace-pre-wrap font-medium bg-surface p-4 rounded-2xl border border-subtle">
              {descModalData.description}
            </div>
          </div>
        </div>
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
          open={!!stopDialogTask}
          task={stopDialogTask}
          onCancel={() => setStopDialogTask(null)}
          onConfirm={(outcome) => {
            stopSession(outcome);
            if (outcome.completedStepIndices && outcome.completedStepIndices.length > 0) {
              completeSessionSteps(stopDialogTask.id, outcome.completedStepIndices);
            }
            setStopDialogTask(null);
          }}
        />
      )}

      {/* ── Task Session Stats ── */}
      {statsTarget && (
        <TaskSessionStats
          open={!!statsTarget}
          title={statsTarget.title}
          sessions={targetSessions}
          onClose={() => setStatsTarget(null)}
        />
      )}

      {/* ── Auth Modal ── */}
      <AuthModal open={authOpen} initialMode={authMode} onClose={() => setAuthOpen(false)} />

      {/* ── Session Crash Recovery Dialog ── */}
      {recoverySessionPrompt && activeSession && activeTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop animate-fade-in">
          <div className="max-w-sm w-full bg-elevated border border-accent p-5 rounded-3xl space-y-4 shadow-elevated">
            <div className="flex items-center gap-2 text-warning font-bold text-sm">
              <Clock className="w-5 h-5 text-warning" />
              <span>Interrupted Session Detected</span>
            </div>
            <p className="text-xs text-content-secondary leading-relaxed">
              You had an active focus session for <span className="font-bold text-content-primary">"{activeTask.title}"</span> that was interrupted. Would you like to resume it or discard it?
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setRecoverySessionPrompt(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-accent text-on-accent hover:bg-accent-hover font-bold text-xs transition"
              >
                Resume Session
              </button>
              <button
                onClick={() => { discardSession(); setRecoverySessionPrompt(false); }}
                className="flex-1 py-2.5 px-3 rounded-xl bg-transparent text-content-secondary font-semibold text-xs hover:bg-surface border border-subtle transition"
              >
                Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="mt-20 flex flex-col items-center justify-center opacity-80 text-center px-6">
      <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mb-4">
        <ListChecks size={28} className="text-primary" />
      </div>
      <h3 className="mt-4 text-base font-bold text-content-primary">No tasks for today</h3>
      <p className="mt-2 text-sm text-content-secondary max-w-[240px] leading-relaxed">
        Dispatch tasks from your Goals or add quick targets to keep your day on track.
      </p>
      <button
        onClick={onAdd}
        className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-glow transition-colors"
      >
        <Plus size={16} />
        Add Task
      </button>
    </div>
  );
}
