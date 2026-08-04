import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Plus, Quote, Sparkles } from 'lucide-react';
import type { GoalNode, View } from './types';
import { useTheme } from './hooks/useTheme';
import { isToday, pathTitles, useStore } from './store';
import ProgressRing from './components/ProgressRing';
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
  { text: "It's not about being the best. It's about being better than you were yesterday.", author: "Unknown" },
  { text: "Discipline equals freedom.", author: "Jocko Willink" },
  { text: "You must do the thing you think you cannot do.", author: "Eleanor Roosevelt" },
];

function parseNavigationState(): { initialView: View; initialPathIds: string[] } {
  try {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');
    const pathParam = params.get('path');

    let initialView: View = 'tasks';
    if (viewParam === 'tasks' || viewParam === 'goals' || viewParam === 'calendar') {
      initialView = viewParam as View;
    } else {
      const savedView = localStorage.getItem('todo.view');
      if (savedView) {
        try {
          const parsed = JSON.parse(savedView);
          if (parsed === 'tasks' || parsed === 'goals' || parsed === 'calendar') {
            initialView = parsed as View;
          }
        } catch {
          if (savedView === 'tasks' || savedView === 'goals' || savedView === 'calendar') {
            initialView = savedView as View;
          }
        }
      }
    }

    let initialPathIds: string[] = [];
    if (pathParam) {
      initialPathIds = pathParam.split('/').filter(Boolean);
    } else {
      const savedPath = localStorage.getItem('todo.goalPathIds');
      if (savedPath) {
        try {
          initialPathIds = JSON.parse(savedPath);
        } catch {
          /* ignore */
        }
      }
    }

    return { initialView, initialPathIds };
  } catch {
    return { initialView: 'tasks', initialPathIds: [] };
  }
}

function syncUrlAndStorage(targetView: View, targetPathIds: string[], pushHistory: boolean) {
  try {
    localStorage.setItem('todo.view', JSON.stringify(targetView));
    localStorage.setItem('todo.goalPathIds', JSON.stringify(targetPathIds));

    const params = new URLSearchParams();
    params.set('view', targetView);
    if (targetView === 'goals' && targetPathIds.length > 0) {
      params.set('path', targetPathIds.join('/'));
    }
    const newUrl = `${window.location.pathname}?${params.toString()}`;
    const stateObj = { view: targetView, goalPathIds: targetPathIds };

    if (pushHistory) {
      window.history.pushState(stateObj, '', newUrl);
    } else {
      window.history.replaceState(stateObj, '', newUrl);
    }
  } catch (err) {
    console.error('Failed to sync navigation URL:', err);
  }
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

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);

  const initialNav = useMemo(() => parseNavigationState(), []);
  const [view, setView] = useState<View>(initialNav.initialView);
  const [goalPathIds, setGoalPathIds] = useState<string[]>(initialNav.initialPathIds);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | 'fade'>('fade');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialDate, setSheetInitialDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [goalParentId, setGoalParentId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<GoalNode | null>(null);
  const [sliceNode, setSliceNode] = useState<GoalNode | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const isNavigatingHistory = useRef(false);
  const [quoteIdx, setQuoteIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const currentQuote = MOTIVATIONAL_QUOTES[quoteIdx];

  const tabs: View[] = useMemo(() => ['tasks', 'goals', 'calendar'], []);

  // Sync initial URL and local storage on mount
  useEffect(() => {
    syncUrlAndStorage(view, goalPathIds, false);
  }, []);

  // Sync back-button (popstate) with views and deep goal tree navigation
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      isNavigatingHistory.current = true;
      let targetView: View = view;
      let targetPathIds: string[] = [];

      const state = e.state;
      if (state) {
        if (state.view && tabs.includes(state.view)) {
          targetView = state.view;
        }
        if (Array.isArray(state.goalPathIds)) {
          targetPathIds = state.goalPathIds;
        }
      } else {
        const parsed = parseNavigationState();
        targetView = parsed.initialView;
        targetPathIds = parsed.initialPathIds;
      }

      const currentIdx = tabs.indexOf(view);
      const targetIdx = tabs.indexOf(targetView);
      setSlideDirection(targetIdx > currentIdx ? 'right' : 'left');
      setView(targetView);
      setGoalPathIds(targetPathIds);

      syncUrlAndStorage(targetView, targetPathIds, false);

      setTimeout(() => {
        isNavigatingHistory.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [view, tabs]);

  // Tab navigation handler with URL push
  const handleNavigateTab = useCallback((targetView: View) => {
    if (targetView === view) return;
    const currentIdx = tabs.indexOf(view);
    const targetIdx = tabs.indexOf(targetView);
    const direction = targetIdx > currentIdx ? 'right' : 'left';
    setSlideDirection(direction);
    setView(targetView);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage(targetView, goalPathIds, true);
    }
  }, [view, tabs, goalPathIds]);

  // Goal path update with URL push
  const handleUpdateGoalPath = useCallback((newPath: string[]) => {
    setGoalPathIds(newPath);
    if (!isNavigatingHistory.current) {
      syncUrlAndStorage('goals', newPath, true);
    }
  }, []);

  const todayTasks = useMemo(() => tasks.filter((t) => isToday(t.targetDate)), [tasks]);

  const completionPct = useMemo(() => {
    if (tasks.length === 0) return 0;
    const done = tasks.filter((t) => t.steps.length > 0 && t.progress >= t.steps.length).length;
    return Math.round((done / tasks.length) * 100);
  }, [tasks]);

  const todayCount = todayTasks.length;
  const todayDone = todayTasks.filter((t) => t.steps.length > 0 && t.progress >= t.steps.length).length;

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

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    if (sheetOpen || goalSheetOpen || settingsOpen || !!sliceNode) return;
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
  }, [sheetOpen, goalSheetOpen, settingsOpen, sliceNode]);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchState.current.tracking) return;
    const touch = e.touches[0];
    touchState.current.currentX = touch.clientX;
    touchState.current.currentY = touch.clientY;

    const dx = touch.clientX - touchState.current.startX;
    const dy = touch.clientY - touchState.current.startY;

    if (touchState.current.isHorizontal === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        touchState.current.isHorizontal = Math.abs(dx) > Math.abs(dy);
      }
    }
  }, []);

  const onTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!touchState.current.tracking) return;
    touchState.current.tracking = false;

    const dx = touchState.current.currentX - touchState.current.startX;
    const dy = touchState.current.currentY - touchState.current.startY;
    const dt = Date.now() - touchState.current.startTime;

    // Mobile swipe sensitivity threshold (30px distance, 750ms duration)
    if (Math.abs(dx) < 30 || Math.abs(dy) > Math.abs(dx) * 1.1 || dt > 750) return;

    // Deep tree swipe-right back navigation
    if (view === 'goals' && goalPathIds.length > 0) {
      if (dx > 30) {
        window.history.back();
      }
      return;
    }

    // Top view tab swiping
    const currentIdx = tabs.indexOf(view);
    if (dx < -30 && currentIdx < tabs.length - 1) {
      handleNavigateTab(tabs[currentIdx + 1]);
    } else if (dx > 30 && currentIdx > 0) {
      handleNavigateTab(tabs[currentIdx - 1]);
    }
  }, [view, goalPathIds, tabs, handleNavigateTab]);

  const openAddTask = (date?: string) => {
    setSheetInitialDate(date ?? null);
    setSheetOpen(true);
  };

  const openAddGoal = (parentId: string | null) => {
    setEditingNode(null);
    setGoalParentId(parentId);
    setGoalSheetOpen(true);
  };

  const openEditGoal = (node: GoalNode) => {
    setEditingNode(node);
    setGoalParentId(null);
    setGoalSheetOpen(true);
  };

  const handlePushNode = (node: GoalNode) => {
    setSliceNode(node);
  };

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
        {/* Header */}
        <header className="pt-4 pb-2 space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="grid place-items-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 border border-blue-100 dark:border-blue-700/60 shadow-xs">
                <Sparkles size={16} className="text-blue-500 dark:text-blue-300" />
              </span>
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 dark:text-slate-400 font-extrabold">TuDo</div>
                <div className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">
                  {view === 'goals'
                    ? 'Goals Blueprint'
                    : view === 'calendar'
                      ? 'Calendar Schedule'
                      : new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums font-bold">
                {view === 'goals'
                  ? `${goals.length} goal${goals.length !== 1 ? 's' : ''}`
                  : view === 'calendar'
                    ? `${tasks.filter((t) => t.targetDate).length} planned`
                    : `${todayDone}/${todayCount} today`}
              </span>
              <ProgressRing percent={completionPct} accent={ACCENT} dark={dark} />
            </div>
          </div>

          {/* Animated Progress Bar */}
          <div className="card p-3 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="text-slate-600 dark:text-slate-300">Today's Execution</span>
              <span className="text-blue-500 dark:text-blue-400 tabular-nums">{completionPct}% Completed</span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800/80 overflow-hidden border border-slate-200/50 dark:border-slate-700/50">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-emerald-400 transition-all duration-700 ease-out shadow-sm shadow-blue-500/30"
                style={{ width: `${completionPct}%` }}
              />
            </div>
          </div>

          {/* Dynamic Rotating Motivational Quote Card */}
          <div
            onClick={() => setQuoteIdx((prev) => (prev + 1) % MOTIVATIONAL_QUOTES.length)}
            className="card p-2.5 cursor-pointer hover:border-blue-400/40 transition-all active:scale-[0.99] group"
            title="Tap to cycle motivational quote"
          >
            <div className="flex items-start gap-2.5">
              <Quote size={13} className="text-blue-500 dark:text-blue-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
              <div className="flex-1 min-w-0">
                <p className="text-[11.5px] italic font-medium text-slate-700 dark:text-slate-200 leading-snug">
                  "{currentQuote.text}"
                </p>
                <p className="mt-0.5 text-[9.5px] font-bold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                  — {currentQuote.author}
                </p>
              </div>
            </div>
          </div>
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
                setPathIds={handleUpdateGoalPath}
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
          onSettings={() => setSettingsOpen(true)}
          accent={ACCENT}
          todayCount={todayCount}
          todayDone={todayDone}
          goalsCount={goals.length}
        />
      </div>

      <AddTaskSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onAdd={addTask}
        initialDate={sheetInitialDate}
      />

      <AddGoalSheet
        open={goalSheetOpen}
        parentId={goalParentId}
        editing={editingNode}
        onClose={() => setGoalSheetOpen(false)}
        onAddRoot={addGoalRoot}
        onAddChild={addChildNode}
        onUpdateNode={updateGoalNode}
        onDeleteNode={(id) => { for (const root of goals) deleteGoalNode(root.id, id); }}
      />

      <StepSliceSheet
        open={!!sliceNode}
        node={sliceNode}
        onClose={() => setSliceNode(null)}
        onConfirm={(nodeId, slice, date) => planTask(nodeId, date, slice)}
      />

      <SettingsSheet
        open={settingsOpen}
        theme={theme}
        onClose={() => setSettingsOpen(false)}
        onApply={(t) => { setTheme(t); setSettingsOpen(false); }}
      />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="card p-10 text-center fade-in dark:bg-slate-800 dark:border-slate-700">
      <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-700">
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
