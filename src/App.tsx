import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ListChecks, Plus, Sparkles } from 'lucide-react';
import type { GoalNode, View } from './types';
import { useTheme } from './hooks/useTheme';
import { useLocalStorage } from './hooks/useLocalStorage';
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

  const [view, setView] = useLocalStorage<View>('todo.view', 'tasks');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetInitialDate, setSheetInitialDate] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [goalParentId, setGoalParentId] = useState<string | null>(null);
  const [editingNode, setEditingNode] = useState<GoalNode | null>(null);
  const [sliceNode, setSliceNode] = useState<GoalNode | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [goalPathIds, setGoalPathIds] = useState<string[]>([]);

  useEffect(() => {
    if (view !== 'goals') return;
    const depth = goalPathIds.length;
    if (depth === 0) return;
    window.history.pushState({ goalDepth: depth }, '');
    const onPop = () => {
      setGoalPathIds((prev) => prev.slice(0, -1));
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
    };
  }, [view, goalPathIds]);

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

  const tabs: View[] = ['tasks', 'goals', 'calendar'];
  const swipeState = useRef<{ startX: number; startY: number; tracking: boolean }>({ startX: 0, startY: 0, tracking: false });

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    swipeState.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, tracking: true };
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeState.current.tracking) return;
    swipeState.current.tracking = false;
    const dx = e.changedTouches[0].clientX - swipeState.current.startX;
    const dy = e.changedTouches[0].clientY - swipeState.current.startY;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx)) return;
    const idx = tabs.indexOf(view);
    if (dx < 0 && idx < tabs.length - 1) setView(tabs[idx + 1]);
    else if (dx > 0 && idx > 0) setView(tabs[idx - 1]);
  }, [view, setView]);

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

      <div className="relative z-10 min-h-screen w-full max-w-md mx-auto px-4 pb-28">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 pt-4 pb-1">
          <div className="flex items-center gap-2.5">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800">
              <Sparkles size={16} className="text-blue-500 dark:text-blue-300" />
            </span>
            <div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400 dark:text-slate-400 leading-none font-bold">TuDo</div>
              <div className="text-[15px] font-extrabold text-slate-900 dark:text-slate-100 leading-tight mt-0.5">
                {view === 'goals'
                  ? 'Goals'
                  : view === 'calendar'
                    ? 'Calendar'
                    : new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums font-semibold">
              {view === 'goals'
                ? `${goals.length} goal${goals.length !== 1 ? 's' : ''}`
                : view === 'calendar'
                  ? `${tasks.filter((t) => t.targetDate).length} planned`
                  : `${todayDone}/${todayCount} today`}
            </span>
            <ProgressRing percent={completionPct} accent={ACCENT} dark={dark} />
          </div>
        </header>

        {/* Main */}
        <main className="mt-3" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <div key={view} className="view-fade">
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
          onNavigate={setView}
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
