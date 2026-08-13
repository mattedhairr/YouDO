import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Link2, Plus, BarChart2, X } from 'lucide-react';
import type { Task } from '../types';
import { isTaskComplete, pathTitles, useStore, isBacklogTask } from '../store';

interface Props {
  tasks: Task[];
  onAddTask: (date: string) => void;
  onJumpToGoal: (goalNodeId: string | null | undefined) => void;
  onViewStats?: (taskId: string, title: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDuration(ms: number) {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hrs > 0) return `${hrs}h ${remMins}m`;
  return `${mins} min`;
}

export default function CalendarView({ tasks, onAddTask, onJumpToGoal, onViewStats }: Props) {
  const { goals, sessionHistory } = useStore();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(localISODate(new Date()));
  const [dayStatsModalDate, setDayStatsModalDate] = useState<string | null>(null);

  const getOriginPath = (goalNodeId: string | undefined): string | null => {
    if (!goalNodeId) return null;
    for (const root of goals) {
      const titles = pathTitles(root, goalNodeId);
      if (titles.length) return titles.join(' / ');
    }
    return null;
  };

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    const add = (d: string, t: Task) => {
      if (!map[d]) map[d] = [];
      if (!map[d].some(x => x.id === t.id)) map[d].push(t);
    };
    for (const t of tasks) {
      if (t.targetDate) add(t.targetDate, t);
      t.pastFailedNativeDates?.forEach(d => add(d, t));
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthName = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = localISODate(new Date());

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const prevMonth = () => setCursor(new Date(year, month - 1, 1));
  const nextMonth = () => setCursor(new Date(year, month + 1, 1));

  const selectedTasks = selectedDate ? (tasksByDate[selectedDate] ?? []) : [];
  const selectedDone = selectedTasks.filter(isTaskComplete).length;

  // Gather sessions for modal date
  const modalDateSessions = useMemo(() => {
    if (!dayStatsModalDate) return [];
    const allSessions = Object.values(sessionHistory).flat();
    return allSessions.filter((s) => {
      const sessionDate = localISODate(new Date(s.startTime));
      return sessionDate === dayStatsModalDate;
    });
  }, [dayStatsModalDate, sessionHistory]);

  const modalDateTasks = useMemo(() => {
    return dayStatsModalDate ? (tasksByDate[dayStatsModalDate] ?? []) : [];
  }, [dayStatsModalDate, tasksByDate]);

  const hasSessionProcess = (tId: string, date: string) => {
    return sessionHistory[tId]?.some(s => localISODate(new Date(s.startTime)) === date) ?? false;
  };

  // Group 1: Task Execution (Native)
  const nativeTasks = modalDateTasks.filter(t => 
    (!t.originalTargetDate && t.targetDate === dayStatsModalDate!) || 
    t.pastFailedNativeDates?.includes(dayStatsModalDate!)
  );
  
  // Filter out manual completions from stats calculation
  const processNativeTasks = nativeTasks.filter(t => !isTaskComplete(t) || hasSessionProcess(t.id, dayStatsModalDate!));
  
  const nativeScheduledCount = processNativeTasks.length;
  const nativeCompletedCount = processNativeTasks.filter(t => isTaskComplete(t) && t.targetDate === dayStatsModalDate!).length;
  const nativeFailedCount = processNativeTasks.filter(t => t.pastFailedNativeDates?.includes(dayStatsModalDate!) || (t.targetDate === dayStatsModalDate! && !isTaskComplete(t) && dayStatsModalDate! < todayStr)).length;
  
  const taskEfficiency = nativeScheduledCount > 0 ? Math.round((nativeCompletedCount / nativeScheduledCount) * 100) : 0;

  // Group 2: Focus Quality
  const dayTotalNFT = useMemo(() => modalDateSessions.reduce((acc, s) => acc + s.netFocusMs, 0), [modalDateSessions]);
  const dayTotalWCD = useMemo(() => modalDateSessions.reduce((acc, s) => acc + (s.endTime - s.startTime), 0), [modalDateSessions]);
  const focusEfficiency = dayTotalWCD > 0 ? Math.min(100, Math.round((dayTotalNFT / dayTotalWCD) * 100)) : 0;

  // Group 3: Momentum
  const globalBacklogsCount = tasks.filter(isBacklogTask).length;
  const backlogsCleared = modalDateTasks.filter(t => !!t.originalTargetDate && t.targetDate === dayStatsModalDate! && isTaskComplete(t) && hasSessionProcess(t.id, dayStatsModalDate!)).length;
  const totalRelevantBacklogs = globalBacklogsCount + backlogsCleared;

  let momentumStr = "";
  if (globalBacklogsCount === 0 && backlogsCleared === 0) {
    momentumStr = "Keeping the slate clean.";
  } else if (globalBacklogsCount === 0 && backlogsCleared > 0) {
    momentumStr = "Incredible. All backlogs crushed.";
  } else if (backlogsCleared > 0) {
    momentumStr = "Solid work catching up.";
  } else {
    momentumStr = "Backlogs are piling up. Time to focus.";
  }

  return (
    <div className="fade-in space-y-4">
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-bold text-slate-100">{monthName}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card p-3.5">
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} />;
            const dateStr = localISODate(new Date(year, month, day));
            const dayTasks = tasksByDate[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const hasTasks = dayTasks.length > 0;
            const allDone = hasTasks && dayTasks.every((t) => t.steps.length > 0 ? t.progress >= t.steps.length : t.progress >= 1);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative aspect-square rounded-xl flex items-center justify-center transition-all text-[13px] font-medium ${
                  isSelected
                    ? 'bg-violet-600 text-white font-bold shadow-lg shadow-violet-600/30 scale-105 z-10'
                    : isToday
                      ? 'bg-violet-950/40 text-violet-300 font-bold border border-violet-700/60'
                      : 'text-slate-200 hover:bg-white/5'
                }`}
              >
                {/* Math Superscript Notation x^n */}
                <span className="inline-flex items-baseline">
                  <span>{day}</span>
                  {hasTasks && (
                    <sup className={`task-sup font-bold ${
                      isSelected
                        ? 'text-amber-300'
                        : allDone
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                    }`}>
                      {dayTasks.length}
                    </sup>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date tasks */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-slate-100">
                {selectedDate
                  ? new Date(selectedDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                  : 'Select a date'}
              </h3>
              {selectedDate && (
                <button
                  onClick={() => setDayStatsModalDate(selectedDate)}
                  className="p-1 rounded-lg bg-violet-600/20 text-violet-300 hover:bg-violet-600/30 border border-violet-500/30 transition text-[10px] font-bold flex items-center gap-1"
                  title="View Daily Efficiency & Stats"
                >
                  <BarChart2 size={12} /> Stats
                </button>
              )}
            </div>
            {selectedTasks.length > 0 && (
              <p className="text-[11px] text-slate-400 font-medium">
                {selectedDone}/{selectedTasks.length} done
              </p>
            )}
          </div>
          {selectedDate && (
            <button
              onClick={() => onAddTask(selectedDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-semibold rounded-xl shadow-md shadow-violet-600/25 transition-all"
            >
              <Plus size={14} /> Add task
            </button>
          )}
        </div>

        {selectedTasks.length === 0 ? (
          <div className="card p-6 text-center text-slate-400 text-xs">
            No tasks planned for this date.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((t) => {
              const complete = isTaskComplete(t);
              const hasSteps = t.steps.length > 0;
              const originPath = getOriginPath(t.goalNodeId);
              
              const isNativeToSelected = !t.originalTargetDate && t.targetDate === selectedDate!;
              const hasFailedNativelyHere = t.pastFailedNativeDates?.includes(selectedDate!) || (isNativeToSelected && !complete && selectedDate! < todayStr);
              const isBacklogCompletedHere = !!t.originalTargetDate && t.targetDate === selectedDate! && complete;
              
              const isManualCompletion = complete && t.targetDate === selectedDate! && (!sessionHistory[t.id] || sessionHistory[t.id].length === 0);

              return (
                <div
                  key={t.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (onViewStats) onViewStats(t.id, t.title);
                  }}
                  className={`card p-4 transition-all select-none ${
                    complete ? 'opacity-70 bg-[#1D1930]/20' : ''
                  }`}
                >
                  <div className="flex flex-col gap-1.5 mb-2">
                    {/* Eyebrow: Path */}
                    {originPath && (
                      <div
                        onClick={() => onJumpToGoal(t.goalNodeId)}
                        className="flex items-center gap-1.5 text-[10px] font-extrabold bg-[#1A1625] border border-white/5 rounded-lg px-2 py-0.5 leading-normal shadow-xs hover:bg-[#1F1B2C] hover:border-violet-500/20 transition-all cursor-pointer w-fit group/path max-w-full"
                      >
                        <Link2 size={10} className="shrink-0 text-violet-500 mr-0.5 group-hover/path:text-violet-400 transition-colors" />
                        <div className="flex items-center gap-1.5 truncate">
                          {originPath.split('/').slice(0, 2).map((part, i, arr) => (
                            <span key={i} className="flex items-center gap-1.5 shrink-0">
                              <span className="text-violet-300 group-hover/path:text-violet-200 transition-colors truncate">
                                {part.trim()}
                              </span>
                              {i < arr.length - 1 && (
                                <span className="text-white/20 shrink-0">•</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className={`text-[14.5px] font-bold leading-snug tracking-tight ${complete ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                          {t.title}
                        </h3>
                        {hasFailedNativelyHere && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/20">
                            FAILED
                          </span>
                        )}
                        {isBacklogCompletedHere && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            BACKLOG
                          </span>
                        )}
                        {isManualCompletion && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-slate-500/20 text-slate-300 border border-slate-500/30">
                            MANUAL
                          </span>
                        )}
                      </div>
                      <span className="text-[12px] font-bold tabular-nums text-slate-400 shrink-0 mt-0.5">
                        {t.progress}/{hasSteps ? t.steps.length : 1}
                      </span>
                    </div>
                  </div>

                  {t.description && (
                    <p className="text-[11.5px] text-slate-400/80 line-clamp-2 mb-3">
                      {t.description}
                    </p>
                  )}

                  {/* Progress bar */}
                  <div className="mt-1 h-1.5 rounded-full bg-slate-800/80 overflow-hidden mb-2.5">
                    <div
                      className="h-full bg-emerald-500 progress-bar-fill rounded-full"
                      style={{ width: `${(t.progress / (hasSteps ? t.steps.length : 1)) * 100}%` }}
                    />
                  </div>

                  {/* Step chips */}
                  {hasSteps && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {t.steps.map((s, idx) => {
                        const stepDone = idx < t.progress;
                        return (
                          <span
                            key={idx}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-all ${
                              stepDone
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 line-through'
                                : 'bg-white/5 text-slate-400 border border-white/5'
                            }`}
                          >
                            {stepDone ? '✓ ' : ''}{s}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Daily Focus Stats & Efficiency Modal ── */}
      {dayStatsModalDate && createPortal(
        <div
          onClick={() => setDayStatsModalDate(null)}
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop animate-fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-[#14111F] card border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4 cursor-default"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-600 dark:text-violet-400">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">Daily Focus Stats</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(dayStatsModalDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDayStatsModalDate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar pb-2">
              {/* Group 1: Task Execution */}
              <div className="bg-[#1D1930]/40 p-3 rounded-2xl border border-white/5 space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Task Execution</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-slate-100 dark:bg-[#14111F] p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-500">Scheduled</p>
                    <p className="text-sm font-black text-slate-200">{nativeScheduledCount}</p>
                  </div>
                  <div className="bg-emerald-500/10 dark:bg-[#14111F] p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-emerald-500">Completed</p>
                    <p className="text-sm font-black text-emerald-400">{nativeCompletedCount}</p>
                  </div>
                  <div className="bg-red-500/10 dark:bg-[#14111F] p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-red-500">Failed</p>
                    <p className="text-sm font-black text-red-400">{nativeFailedCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-300 w-24">Task Efficiency</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${taskEfficiency}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-indigo-400 w-8 text-right">{taskEfficiency}%</span>
                </div>
              </div>

              {/* Group 2: Focus Quality */}
              <div className="bg-[#1D1930]/40 p-3 rounded-2xl border border-white/5 space-y-2.5">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Focus Quality</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-amber-500/10 dark:bg-[#14111F] p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-amber-600">Net Focus</p>
                    <p className="text-sm font-black text-amber-500">{formatDuration(dayTotalNFT)}</p>
                  </div>
                  <div className="bg-slate-100 dark:bg-[#14111F] p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-slate-500">Total Duration</p>
                    <p className="text-sm font-black text-slate-300">{formatDuration(dayTotalWCD)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-300 w-24">Focus Efficiency</span>
                  <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${focusEfficiency}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-amber-400 w-8 text-right">{focusEfficiency}%</span>
                </div>
              </div>

              {/* Group 3: Momentum */}
              <div className="bg-[#1D1930]/40 p-3 rounded-2xl border border-white/5 space-y-2">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Momentum</h4>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300">Backlogs Cleared</span>
                  <span className="text-xs font-black text-rose-400">
                    {totalRelevantBacklogs === 0 ? 'No Backlogs Remaining' : `${backlogsCleared} out of ${totalRelevantBacklogs}`}
                  </span>
                </div>
                <p className="text-[10.5px] font-semibold text-slate-400 italic">
                  {momentumStr}
                </p>
              </div>

              {/* Sessions List */}
            <div>
              <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Sessions Run ({modalDateSessions.length})</h4>
              {modalDateSessions.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 italic py-3 text-center bg-slate-100 dark:bg-[#1D1930]/40 rounded-xl border border-slate-200 dark:border-white/5">
                  No focus sessions logged on this date.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                  {modalDateSessions.map((s) => {
                    const taskObj = tasks.find((t) => t.id === s.taskId);
                    const title = taskObj?.title || 'Focus Session';
                    const dur = s.endTime - s.startTime;
                    return (
                      <div key={s.id} className="bg-slate-100 dark:bg-[#1D1930]/80 p-2.5 rounded-xl border border-slate-200 dark:border-white/5 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-800 dark:text-slate-200 truncate">{title}</p>
                          <p className="text-[10.5px] text-slate-500 dark:text-slate-400 font-mono">
                            {s.wallClockStart} - {s.wallClockEnd} ({formatDuration(dur)})
                          </p>
                        </div>
                        <span className="text-amber-600 dark:text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-[10.5px] shrink-0">
                          {formatDuration(s.netFocusMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>,
        document.body
      )}
    </div>
  );
}
