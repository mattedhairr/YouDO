import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Calendar, FileText, Flame, ListChecks, Plus, Quote, X, Zap } from 'lucide-react';
import { StatusBar, Style } from '@capacitor/status-bar';
import type { GoalKind, GoalNode, Task, View } from './types';
import { useTheme } from './hooks/useTheme';
import { useNavigationSync } from './hooks/useNavigationSync';
import { findNode, formatDDMMYYYY, isBacklogTask, isTaskComplete, isToday, pathNodes, pathTitles, useStore } from './store';
import TaskCard from './components/TaskCard';
import AddTaskSheet from './components/AddTaskSheet';
import CommandBar from './components/CommandBar';
import SettingsSheet from './components/SettingsSheet';
import GoalView from './components/GoalView';
import AddGoalSheet from './components/AddGoalSheet';
import StepSliceSheet from './components/StepSliceSheet';
import CalendarView from './components/CalendarView';

const ACCENT = '#3b82f6';

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
      {/* Y-stem: left arm descending to centre — electric blue */}
      <path
        d="M4 4L11.5 13.5V20"
        stroke="#3b82f6"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Y-arm: right arm with execution checkmark sweep — emerald */}
      <path
        d="M20 4L11.5 13.5L8.5 10"
        stroke="#10b981"
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
    // NOTE: Do NOT bail on draggable elements — drag uses dragstart, not touchstart.
    // Bailing here would block swipe navigation over every goal card.
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
    planTask,
    copyGoalNode,
    copyGoalNodes,
    pasteGoalNode,
    clearClipboard,
    clipboard,
    deleteGoalNodes,
  } = useStore();
  const [theme, setTheme] = useTheme();
  const dark = theme.darkMode;

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

  // Batch selection state (owned by App, fed from GoalView via onSelectionChange)
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

  // High-priority modal interceptor ref for popstate (device back gesture)
  const modalCloseRef = useRef<() => boolean>(() => false);
  modalCloseRef.current = () => {
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.classList.toggle('glass', theme.glassUI);
  }, [dark, theme.glassUI]);

  // Push history state when opening a modal sheet
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
    if (window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  const closeGoalSheet = useCallback(() => {
    setGoalSheetOpen(false);
    if (window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  const closeSliceNode = useCallback(() => {
    setSliceNodes([]);
    if (window.history.state?.modal) {
      window.history.back();
    }
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
    if (window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  // Single random quote selected on startup/refresh
  const [randomQuote] = useState(() => {
    const idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    return MOTIVATIONAL_QUOTES[idx];
  });

  // Native Android Status Bar safe area initialization
  useEffect(() => {
    const initStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch {
        /* non-capacitor web fallback */
      }
    };
    initStatusBar();
  }, []);

  const [todaySubTab, setTodaySubTab] = useState<'today' | 'backlog'>('today');

  const todayTasks = useMemo(() => tasks.filter((t) => isToday(t.targetDate)), [tasks]);
  const backlogTasks = useMemo(() => tasks.filter(isBacklogTask), [tasks]);
  const todayCount = todayTasks.length;
  const todayDone = todayTasks.filter(isTaskComplete).length;
  
  // Today's Progress calculation: 0 if todayCount is 0, never NaN
  const todayProgress = todayCount > 0 ? Math.round((todayDone / todayCount) * 100) : 0;

  const backlogByDate = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const t of backlogTasks) {
      const d = t.targetDate || 'No Date';
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    }
    const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((date) => ({
      date,
      formattedDate: formatDDMMYYYY(date),
      tasks: groups[date],
    }));
  }, [backlogTasks]);

  const [highlightNodeId, setHighlightNodeId] = useState<string | null>(null);

  const jumpToGoalTask = useCallback(
    (goalNodeId: string | null | undefined) => {
      if (!goalNodeId) return;
      for (const root of goals) {
        const nodes = pathNodes(root, goalNodeId);
        if (nodes.length > 0) {
          const parentPath = nodes.length > 1 ? nodes.slice(0, -1) : [];
          const parentIds = parentPath.map((n) => n.id);
          setHighlightNodeId(goalNodeId);
          navigateToGoalPath(parentIds);
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

  const originFor = (taskId: string): string | undefined => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task?.goalNodeId) return undefined;
    for (const root of goals) {
      const path = pathTitles(root, task.goalNodeId);
      if (path.length) return path.slice(0, -1).join(' > ') || undefined;
    }
    return undefined;
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

  const sortedTasks = useMemo(() => [...todayTasks].sort((a, b) => a.order - b.order), [todayTasks]);



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
      if (sheetOpen || goalSheetOpen || settingsOpen || sliceNodes.length > 0) return;
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
    [sheetOpen, goalSheetOpen, settingsOpen, sliceNodes],
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
          // Vertical scroll detected: cancel tracking immediately to prevent tab jumps while scrolling
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

      // Strict gesture validation: >= 50px distance, dy <= dx * 0.75 ratio, <= 750ms duration
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx) * 0.75 || dt > 750) return;

      // Strict 3-tab linear sequence: 0: Today ('tasks'), 1: Goals ('goals'), 2: Calendar ('calendar')
      const currentIdx = tabs.indexOf(view);

      if (dx <= -50) {
        // Swipe LEFT: Move to NEXT tab (tasks -> goals -> calendar), clamped at index 2 (calendar)
        const nextIdx = Math.min(tabs.length - 1, currentIdx + 1);
        if (nextIdx !== currentIdx) {
          handleNavigateTab(tabs[nextIdx]);
        }
      } else if (dx >= 50) {
        // Swipe RIGHT:
        // If inside nested goal breadcrumbs, step back up the goal hierarchy
        if (view === 'goals' && goalPathIds.length > 0) {
          setGoalPathIds(goalPathIds.slice(0, -1));
          return;
        }
        // Otherwise move to PREVIOUS tab (calendar -> goals -> tasks), clamped at index 0 (tasks)
        const prevIdx = Math.max(0, currentIdx - 1);
        if (prevIdx !== currentIdx) {
          handleNavigateTab(tabs[prevIdx]);
        }
      }
    },
    [view, goalPathIds, tabs, handleNavigateTab, setGoalPathIds],
  );


  const isGlass = theme.glassUI;

  return (
    <div className={`min-h-screen relative overflow-x-hidden transition-colors duration-300 ${
      dark
        ? isGlass ? 'dark bg-[#05080E] text-slate-100' : 'dark bg-[#070A0F] text-slate-100'
        : isGlass ? 'bg-[#EBF0F7] text-slate-900' : 'bg-[#F1F5F9] text-slate-900'
    }`}>
      {/* Ambient Glowing Orbs — ONLY visible when Frosted Glass mode is enabled */}
      <div className={`fixed inset-0 pointer-events-none overflow-hidden z-0 transition-opacity duration-700 ${isGlass ? 'opacity-100' : 'opacity-0'}`}>
        <div className={`absolute -top-32 -left-20 w-96 h-96 rounded-full blur-3xl transition-all duration-700 ${dark ? 'bg-blue-600/25' : 'bg-blue-500/20'}`} />
        <div className={`absolute top-1/3 -right-24 w-96 h-96 rounded-full blur-3xl transition-all duration-700 ${dark ? 'bg-indigo-600/25' : 'bg-purple-500/20'}`} />
        <div className={`absolute -bottom-32 left-1/4 w-96 h-96 rounded-full blur-3xl transition-all duration-700 ${dark ? 'bg-emerald-600/20' : 'bg-cyan-500/18'}`} />
      </div>

      <div
        className="relative z-10 min-h-screen w-full max-w-md mx-auto px-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Single Sleek Consolidated Top Header */}
        <header className="pt-[max(0.75rem,env(safe-area-inset-top))] pb-1 space-y-2 shrink-0 overflow-hidden">
          {/* Inline Top Row: Brand + Date (Left) | Marquee Quote Ticker (Right) */}
          <div className="flex items-center justify-between gap-2.5 h-10">
            {/* Left: YouDO Icon + Brand + Date */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-100 dark:border-blue-700/60 shadow-xs shrink-0">
                <YouDoIcon size={18} />
              </span>
              <div className="shrink-0">
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-400 font-extrabold leading-none">YouDO</div>
                <div className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">
                  {view === 'goals'
                    ? 'Goals'
                    : view === 'calendar'
                      ? 'Calendar'
                      : new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
                </div>
              </div>
            </div>

            {/* Right: Inline Marquee Scrolling Quote Ticker */}
            <div className="flex-1 min-w-0 card h-9 px-2.5 flex items-center gap-1.5 border border-white/10 overflow-hidden">
              <Quote size={11} className="text-blue-500 dark:text-blue-400 shrink-0" />
              <div className="marquee-container flex-1">
                <div className="marquee-content text-[11px] italic font-medium text-slate-700 dark:text-slate-200">
                  "{randomQuote.text}" <span className="not-italic font-bold text-blue-600 dark:text-blue-400 text-[9.5px] ml-1.5">— {randomQuote.author}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Row: Unified Horizontal Linear Progress Bar (Today Tab ONLY) */}
          {view === 'tasks' && (
            <div className="card p-2.5 space-y-1.5 border border-white/10">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span className="text-slate-600 dark:text-slate-300">Today's Execution</span>
                <span className="text-blue-500 dark:text-blue-400 tabular-nums">
                  {todayDone}/{todayCount} tasks • {todayProgress}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 progress-bar-fill shadow-sm shadow-blue-500/30"
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
                {/* Sub-tab Switcher: Today vs Backlog */}
                <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-200/50 dark:bg-slate-800/60 border border-slate-300/50 dark:border-slate-700/50 w-full">
                  <button
                    onClick={() => setTodaySubTab('today')}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'today'
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                    }`}
                  >
                    <span>Today</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${todaySubTab === 'today' ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300' : 'bg-slate-300/50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                      {todayTasks.length}
                    </span>
                  </button>
                  <button
                    onClick={() => setTodaySubTab('backlog')}
                    className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                      todaySubTab === 'backlog'
                        ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                        : 'text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400'
                    }`}
                  >
                    <AlertTriangle size={13} className={backlogTasks.length > 0 ? 'text-rose-500' : 'text-slate-400'} />
                    <span>Backlog</span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.2 rounded-full ${backlogTasks.length > 0 ? 'bg-rose-500 text-white shadow-xs' : 'bg-slate-300/50 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                      {backlogTasks.length}
                    </span>
                  </button>
                </div>

                {/* Sub-tab Content */}
                {todaySubTab === 'today' ? (
                  sortedTasks.length === 0 ? (
                    <EmptyState onAdd={() => openAddTask()} />
                  ) : (
                    <div className="space-y-2.5 fade-in">
                      {sortedTasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          onAdvance={advance}
                          onUndo={undo}
                          onDelete={t.goalNodeId ? unlinkTask : removeTask}
                          onDuplicate={duplicateTask}
                          onDragStart={(id) => setDragId(id)}
                          onDragEnter={(id) => setOverId(id)}
                          onDragEnd={doReorder}
                          isDragging={dragId === t.id}
                          dragOver={overId === t.id && dragId !== t.id}
                          origin={originFor(t.id)}
                          softRemove={!!t.goalNodeId}
                          dark={dark}
                          onJumpToGoal={() => t.goalNodeId && jumpToGoalTask(t.goalNodeId)}
                          onOpenDescription={openDescriptionModal}
                        />
                      ))}
                    </div>
                  )
                ) : (
                  <div className="space-y-4 fade-in">
                    {/* Backlog Loss Aversion / Appreciation Tagline */}
                    {backlogTasks.length > 0 ? (
                      <div className="card p-3.5 bg-rose-500/10 dark:bg-rose-500/15 border border-rose-500/30 dark:border-rose-500/40 rounded-2xl space-y-1">
                        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-extrabold text-xs uppercase tracking-wider">
                          <AlertTriangle size={15} /> Backlog Momentum Alert
                        </div>
                        <p className="text-[12px] text-rose-800 dark:text-rose-200 font-medium leading-relaxed">
                          ⚠️ You are losing momentum! <span className="font-extrabold underline decoration-rose-400">{backlogTasks.length} task{backlogTasks.length > 1 ? 's' : ''}</span> slipped into backlog. Don't let your blueprint decay — reschedule or finish them now!
                        </p>
                      </div>
                    ) : (
                      <div className="card p-4 bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/30 dark:border-emerald-500/40 rounded-2xl text-center space-y-1.5">
                        <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-500 mb-1">
                          <Flame size={20} />
                        </div>
                        <h3 className="text-sm font-extrabold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">
                          Zero Backlog — Flawless Execution!
                        </h3>
                        <p className="text-[12px] text-emerald-800/90 dark:text-emerald-200/90 font-medium leading-relaxed max-w-xs mx-auto">
                          🔥 Outstanding momentum! You have zero backlogged tasks. All your goals are executing on schedule.
                        </p>
                      </div>
                    )}

                    {/* Date-wise Grouped Tasks */}
                    {backlogByDate.map((group) => (
                      <div key={group.date} className="space-y-2">
                        <div className="flex items-center gap-2 px-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                          <Calendar size={12} />
                          <span>Due: {group.formattedDate}</span>
                          <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">({group.tasks.length} task{group.tasks.length > 1 ? 's' : ''})</span>
                        </div>
                        <div className="space-y-2">
                          {group.tasks.map((t) => (
                            <TaskCard
                              key={t.id}
                              task={t}
                              onAdvance={advance}
                              onUndo={undo}
                              onDelete={t.goalNodeId ? unlinkTask : removeTask}
                              onDuplicate={duplicateTask}
                              onDragStart={() => {}}
                              onDragEnter={() => {}}
                              onDragEnd={() => {}}
                              isDragging={false}
                              dragOver={false}
                              origin={originFor(t.id)}
                              softRemove={!!t.goalNodeId}
                              dark={dark}
                              onJumpToGoal={() => t.goalNodeId && jumpToGoalTask(t.goalNodeId)}
                              onOpenDescription={openDescriptionModal}
                              backlogAction={
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePushBacklogTask(t);
                                  }}
                                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-xs shadow-rose-500/30 transition-all active:scale-95 shrink-0"
                                  title="Schedule task for Today or future date"
                                >
                                  <Zap size={12} className="fill-white" /> Schedule
                                </button>
                              }
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : view === 'calendar' ? (
              <CalendarView tasks={tasks} onAddTask={(date) => openAddTask(date)} onJumpToGoal={jumpToGoalTask} />
            ) : (
              <GoalView
                accent={ACCENT}
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
                onPaste={pasteGoalNode}
                onCancelPaste={clearClipboard}
                clipboard={clipboard}
                onSelectionChange={handleSelectionChange}
                clearSelectionRef={clearSelectionRef}
                onOpenDescription={openDescriptionModal}
              />
            )}
          </div>
        </main>

        {/* FAB — only on Today view */}
        {view === 'tasks' && (
          <button
            onClick={() => openAddTask()}
            className="fixed bottom-20 right-4 w-12 h-12 rounded-full text-white grid place-items-center shadow-lg transition-all active:scale-90 z-30"
            style={{ background: ACCENT, boxShadow: `0 6px 20px -4px ${ACCENT}aa` }}
            title="Add task"
          >
            <Plus size={24} />
          </button>
        )}

        {/* Bottom Floating Navigation Bar / Batch Action Bar */}
        <CommandBar
          view={view}
          onNavigate={handleNavigateTab}
          onSettings={openSettings}
          accent={ACCENT}
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
        />
      </div>

      <AddTaskSheet
        open={sheetOpen}
        onClose={closeSheet}
        onAdd={addTask}
        initialDate={sheetInitialDate}
      />

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
          for (const plan of plans) {
            planTask(plan.nodeId, targetDate, plan.stepSlice);
          }
        }}
      />

      <SettingsSheet
        open={settingsOpen}
        theme={theme}
        onClose={closeSettings}
        onApply={(t) => { setTheme(t); closeSettings(); }}
      />

      {/* ── Description Viewer Modal Pop-up ── */}
      {descModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={closeDescriptionModal} />
          <div className="sheet-up relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl p-5 pb-6 shadow-2xl space-y-4 border border-slate-200/80 dark:border-slate-800 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 shrink-0 mt-0.5">
                  <FileText size={18} />
                </div>
                <div className="min-w-0">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">Full Description</span>
                  <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 leading-snug break-words">{descModalData.title}</h3>
                </div>
              </div>
              <button
                onClick={closeDescriptionModal}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Description Body (Scrollable) */}
            <div className="flex-1 overflow-y-auto no-scrollbar text-sm leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap font-medium bg-slate-50/70 dark:bg-slate-950/40 p-4 rounded-2xl border border-slate-200/60 dark:border-slate-800/80">
              {descModalData.description}
            </div>

            {/* Close Button */}
            <button
              onClick={closeDescriptionModal}
              className="w-full py-3 rounded-2xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/25 transition-all active:scale-[0.99]"
            >
              Close Description
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card p-10 text-center fade-in dark:bg-slate-800 dark:border-slate-700">
      <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-700 animate-float">
        <ListChecks size={26} className="text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-200">No study tasks for today</h3>
      <p className="mt-1 text-sm text-slate-400 dark:text-slate-400 max-w-xs mx-auto leading-relaxed">
        Dispatch chapter topics from your Goal Blueprint or add quick study targets to keep your exam preparation on track.
      </p>
      <button onClick={onAdd} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20">
        Add Study Task
      </button>
    </div>
  );
}
