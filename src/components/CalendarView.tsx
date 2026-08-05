import { useMemo, useState } from 'react';
import { Activity, ChevronLeft, ChevronRight, Flame, Link2, Plus, Trash2 } from 'lucide-react';
import type { Task } from '../types';
import { useStore, isTaskComplete } from '../store';

interface Props {
  tasks: Task[];
  onAddTask: (date: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeStreak(tasks: Task[]): number {
  const tasksByDate: Record<string, Task[]> = {};
  for (const t of tasks) {
    if (!t.targetDate) continue;
    (tasksByDate[t.targetDate] ??= []).push(t);
  }

  const todayStr = localISODate(new Date());
  const todayTasks = tasksByDate[todayStr] ?? [];
  const todayHasTasks = todayTasks.length > 0;
  const todayAllDone = todayHasTasks && todayTasks.every(isTaskComplete);

  let streak = 0;
  const checkDate = new Date();

  // If today has tasks and all are done, streak starts including today
  if (todayHasTasks && todayAllDone) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  } else {
    // Start checking backwards from yesterday
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Check past days (up to 365 days back)
  for (let i = 0; i < 365; i++) {
    const dateStr = localISODate(checkDate);
    const dayTasks = tasksByDate[dateStr] ?? [];
    if (dayTasks.length > 0) {
      if (dayTasks.every(isTaskComplete)) {
        streak++;
      } else {
        // Break on first day that had tasks left incomplete
        break;
      }
    }
    // Days with 0 tasks don't break streak, continue checking previous day
    checkDate.setDate(checkDate.getDate() - 1);
  }

  return streak;
}

export default function CalendarView({ tasks, onAddTask }: Props) {
  const { advance, removeTask, unlinkTask } = useStore();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(localISODate(new Date()));

  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      if (!t.targetDate) continue;
      (map[t.targetDate] ??= []).push(t);
    }
    return map;
  }, [tasks]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthName = cursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Performance metrics
  const streak = useMemo(() => computeStreak(tasks), [tasks]);
  const totalCompleted = useMemo(() => tasks.filter(isTaskComplete).length, [tasks]);
  const activeDaysCount = useMemo(
    () => new Set(tasks.filter(isTaskComplete).map((t) => t.targetDate)).size,
    [tasks],
  );
  const monthTasks = useMemo(
    () => tasks.filter((t) => t.targetDate && t.targetDate.startsWith(monthPrefix)),
    [tasks, monthPrefix],
  );
  const monthDone = useMemo(() => monthTasks.filter(isTaskComplete).length, [monthTasks]);
  const monthRate = monthTasks.length > 0 ? Math.round((monthDone / monthTasks.length) * 100) : 0;

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

  return (
    <div className="fade-in space-y-4">
      {/* ── Executive Performance Tracker Card ── */}
      <div className="card p-4 bg-slate-900/90 text-white border border-slate-700/60 shadow-lg">
        {/* Card Header: Title + Streak Badge */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-700/60 mb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Activity size={18} />
            </div>
            <div>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-200">
                Execution Performance
              </h3>
              <p className="text-[10.5px] font-semibold text-slate-400">
                Consistency & Streak Analytics
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-base font-black text-amber-400 flex items-center justify-end gap-1.5">
              <Flame size={18} className="fill-amber-400 text-amber-400" />
              <span>{streak} Day{streak !== 1 ? 's' : ''}</span>
            </div>
            <span className="text-[9px] uppercase font-bold text-amber-300/80 tracking-wider">
              Absolute Streak
            </span>
          </div>
        </div>

        {/* 3 Metric Chips Row */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Monthly Rate</div>
            <div className="text-base font-black text-blue-400 mt-0.5 tabular-nums">{monthRate}%</div>
            <div className="text-[9px] text-slate-400 font-medium mt-0.5">{monthDone}/{monthTasks.length} done</div>
          </div>

          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Total Done</div>
            <div className="text-base font-black text-emerald-400 mt-0.5 tabular-nums">{totalCompleted}</div>
            <div className="text-[9px] text-slate-400 font-medium mt-0.5">all-time tasks</div>
          </div>

          <div className="p-2 rounded-xl bg-white/5 border border-white/10">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-slate-400">Active Days</div>
            <div className="text-base font-black text-purple-400 mt-0.5 tabular-nums">{activeDaysCount}</div>
            <div className="text-[9px] text-slate-400 font-medium mt-0.5">days executed</div>
          </div>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button onClick={prevMonth} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">{monthName}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="card p-3.5">
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-400 py-1">{d}</div>
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
            const allDone = hasTasks && dayTasks.every((t) => t.steps.length > 0 && t.progress >= t.steps.length);

            return (
              <button
                key={i}
                onClick={() => setSelectedDate(dateStr)}
                className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all text-[13px] ${
                  isSelected
                    ? 'bg-blue-600 text-white font-bold shadow-md shadow-blue-500/30 scale-105 z-10'
                    : isToday
                      ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 font-bold border border-blue-200 dark:border-blue-700/60'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100/60 dark:hover:bg-white/5'
                }`}
              >
                <span>{day}</span>
                {hasTasks && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayTasks.slice(0, 3).map((t, j) => (
                      <span
                        key={j}
                        className={`w-1 h-1 rounded-full ${
                          isSelected
                            ? 'bg-white/80'
                            : allDone
                              ? 'bg-emerald-500'
                              : t.steps.length > 0 && t.progress >= t.steps.length
                                ? 'bg-emerald-500'
                                : 'bg-blue-400'
                        }`}
                      />
                    ))}
                    {dayTasks.length > 3 && (
                      <span className={`text-[8px] leading-none ${isSelected ? 'text-white/70' : 'text-slate-400'}`}>+</span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected date tasks */}
      <div className="mt-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="text-[14px] font-bold text-slate-900 dark:text-slate-100">
              {selectedDate
                ? new Date(selectedDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                : 'Select a date'}
            </h3>
            {selectedTasks.length > 0 && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                {selectedDone}/{selectedTasks.length} done
              </p>
            )}
          </div>
          {selectedDate && (
            <button
              onClick={() => onAddTask(selectedDate)}
              className="p-2 rounded-lg text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
              title="Add task on this date"
            >
              <Plus size={18} />
            </button>
          )}
        </div>

        {selectedTasks.length === 0 ? (
          <div className="card p-6 text-center">
            <p className="text-sm text-slate-400 dark:text-slate-400">No tasks planned for this day.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((t) => {
              const total = t.steps.length || 1;
              const fillPct = (t.progress / total) * 100;
              const complete = isTaskComplete(t);
              return (
                <div
                  key={t.id}
                  onClick={() => !complete && advance(t.id)}
                  className={`card p-3.5 cursor-pointer transition-all hover:border-blue-300 dark:hover:border-blue-400/50 ${complete ? 'opacity-75 ring-1 ring-emerald-500/30 dark:ring-emerald-400/30 animate-glow-pulse' : ''}`}
                >
                  <div className="flex items-center gap-2">
                    <h4 className={`flex-1 text-[13.5px] font-semibold ${complete ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>{t.title}</h4>
                    {t.goalNodeId && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-md px-1.5 py-0.5">
                        <Link2 size={8} /> Goal
                      </span>
                    )}
                    <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 tabular-nums">{t.progress}/{t.steps.length || 1}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (t.goalNodeId) {
                          unlinkTask(t.id);
                        } else {
                          removeTask(t.id);
                        }
                      }}
                      className="p-1 rounded-md text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors shrink-0"
                      title="Delete task"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {t.description && <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1">{t.description}</p>}
                  
                  {t.steps.length > 0 && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {t.steps.map((s, i) => (
                        <span
                          key={i}
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-md border transition-all ${
                            i < t.progress
                              ? 'bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 line-through animate-stamp'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {i < t.progress ? '✓' : `${i + 1}.`} {s}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="mt-2.5 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500 progress-bar-fill" style={{ width: `${fillPct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
