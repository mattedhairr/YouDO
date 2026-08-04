import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Plus, Quote } from 'lucide-react';
import type { GoalNode, View } from './types';
import { useTheme } from './hooks/useTheme';
import { useNavigationSync } from './hooks/useNavigationSync';
import { isTaskComplete, isToday, pathTitles, useStore } from './store';
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
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "Who's going to carry the boats and the logs?", author: "David Goggins" },
  { text: "Don't count the days, make the days count.", author: "Muhammad Ali" },
  { text: "Suffer the pain of discipline or suffer the pain of regret.", author: "Jim Rohn" },
  { text: "Pain is weakness leaving the body.", author: "General Lewis B. Puller" },
  { text: "The mind is the limit. As long as the mind can envision the fact that you can do something, you can do it.", author: "Arnold Schwarzenegger" },
  { text: "He who has a why to live can bear almost any how.", author: "Friedrich Nietzsche" },
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt" },
  { text: "Greatness is not given, it's earned.", author: "Unknown" },
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
    if (el.getAttribute && el.getAttribute('draggable') === 'true') return true;
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
  const [editingNode, setEditingNode] = useState<GoalNode | null>(null);
  const [sliceNode, setSliceNode] = useState<GoalNode | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

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
    if (sliceNode) {
      setSliceNode(null);
      return true;
    }
    return false;
  };

  const handleModalPopState = useCallback(() => {
    return modalCloseRef.current();
  }, []);

  const { view, goalPathIds, slideDirection, setGoalPathIds, handleNavigateTab } =
    useNavigationSync(handleModalPopState);
  const tabs: View[] = useMemo(() => ['tasks', 'goals', 'calendar'], []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

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

  const openAddGoal = (parentId: string | null) => {
    pushModalState();
    setEditingNode(null);
    setGoalParentId(parentId);
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
    setSliceNode(node);
  };

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
    setSliceNode(null);
    if (window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  // Single random quote selected on startup/refresh
  const [randomQuote] = useState(() => {
    const idx = Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length);
    return MOTIVATIONAL_QUOTES[idx];
  });

  const todayTasks = useMemo(() => tasks.filter((t) => isToday(t.targetDate)), [tasks]);
  const todayCount = todayTasks.length;
  const todayDone = todayTasks.filter(isTaskComplete).length;
  
  // Today's Progress calculation: 0 if todayCount is 0, never NaN
  const todayProgress = todayCount > 0 ? Math.round((todayDone / todayCount) * 100) : 0;

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
      if (sheetOpen || goalSheetOpen || settingsOpen || !!sliceNode) return;
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
    [sheetOpen, goalSheetOpen, settingsOpen, sliceNode],
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


  return (
    <div className={dark ? 'dark bg-[#0B0F17] text-slate-100 min-h-screen relative overflow-x-hidden' : 'bg-slate-50 text-slate-900 min-h-screen relative overflow-x-hidden'}>
      {/* Ambient Glowing Orbs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className={`absolute -top-32 -left-20 w-96 h-96 rounded-full blur-3xl transition-opacity duration-700 ${dark ? 'bg-blue-600/15 opacity-100' : 'bg-blue-400/10 opacity-70'}`} />
        <div className={`absolute top-1/3 -right-24 w-96 h-96 rounded-full blur-3xl transition-opacity duration-700 ${dark ? 'bg-indigo-600/15 opacity-100' : 'bg-indigo-400/10 opacity-70'}`} />
        <div className={`absolute -bottom-32 left-1/4 w-96 h-96 rounded-full blur-3xl transition-opacity duration-700 ${dark ? 'bg-purple-600/15 opacity-100' : 'bg-purple-400/10 opacity-70'}`} />
      </div>

      <div
        className="relative z-10 min-h-screen w-full max-w-md mx-auto px-4 pb-28"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* Single Sleek Consolidated Top Header */}
        <header className="pt-3 pb-1 space-y-2 shrink-0 overflow-hidden">
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
              sortedTasks.length === 0 ? (
                <EmptyState onAdd={() => openAddTask()} />
              ) : (
                <div className="space-y-2.5">
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
                    />
                  ))}
                </div>
              )
            ) : view === 'calendar' ? (
              <CalendarView tasks={tasks} onAddTask={(date) => openAddTask(date)} />
            ) : (
              <GoalView
                accent={ACCENT}
                pathIds={goalPathIds}
                setPathIds={setGoalPathIds}
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

        {/* Bottom Floating Navigation Bar */}
        <CommandBar
          view={view}
          onNavigate={handleNavigateTab}
          onSettings={openSettings}
          accent={ACCENT}
          todayCount={todayCount}
          todayDone={todayDone}
          goalsCount={goals.length}
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
        editing={editingNode}
        onClose={closeGoalSheet}
        onAddRoot={addGoalRoot}
        onAddChild={addChildNode}
        onUpdateNode={updateGoalNode}
        onDeleteNode={(id) => { for (const root of goals) deleteGoalNode(root.id, id); }}
      />

      <StepSliceSheet
        open={!!sliceNode}
        node={sliceNode}
        onClose={closeSliceNode}
        onConfirm={(nodeId, slice, date) => planTask(nodeId, date, slice)}
      />

      <SettingsSheet
        open={settingsOpen}
        theme={theme}
        onClose={closeSettings}
        onApply={(t) => { setTheme(t); closeSettings(); }}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card p-10 text-center fade-in dark:bg-slate-800 dark:border-slate-700">
      <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-700 animate-float">
        <ListChecks size={26} className="text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">No tasks today</h3>
      <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">Tap the + button to add a task, or plan one from your Goals.</p>
      <button onClick={onAdd} className="mt-4 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors">
        Add a task
      </button>
    </div>
  );
}
