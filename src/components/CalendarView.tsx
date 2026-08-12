import { useMemo, useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Link2, Plus, BarChart2, Clock, CheckCircle2, X } from 'lucide-react';
import type { Task, TaskSession } from '../types';
import { isTaskComplete, pathTitles, useStore } from '../store';

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

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  const handleTouchStart = (dateStr: string) => {
    longPressTimer.current = setTimeout(() => {
      setDayStatsModalDate(dateStr);
    }, 600);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

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
    for (const t of tasks) {
      if (!t.targetDate) continue;
      (map[t.targetDate] ??= []).push(t);
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

  const dayTotalNFT = useMemo(() => modalDateSessions.reduce((acc, s) => acc + s.netFocusMs, 0), [modalDateSessions]);
  const dayTotalWCD = useMemo(() => modalDateSessions.reduce((acc, s) => acc + (s.endTime - s.startTime), 0), [modalDateSessions]);
  const dayEfficiency = dayTotalWCD > 0 ? Math.min(100, Math.round((dayTotalNFT / dayTotalWCD) * 100)) : 0;

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
                onMouseDown={() => handleTouchStart(dateStr)}
                onMouseUp={handleTouchEnd}
                onTouchStart={() => handleTouchStart(dateStr)}
                onTouchEnd={handleTouchEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setDayStatsModalDate(dateStr);
                }}
                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
                className={`relative aspect-square rounded-xl flex items-center justify-center transition-all text-[13px] font-medium select-none touch-manipulation ${
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
              return (
                <div
                  key={t.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (onViewStats) onViewStats(t.id, t.title);
                  }}
                  className={`card p-3 transition-all select-none ${
                    complete ? 'opacity-60 bg-[#1D1930]/40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className={`text-[13px] font-bold ${complete ? 'line-through text-slate-400' : 'text-slate-100'}`}>
                      {t.title}
                    </span>
                    <span className="text-[11px] font-semibold text-slate-400 shrink-0">
                      {t.progress}/{hasSteps ? t.steps.length : 1}
                    </span>
                  </div>

                  {originPath && (
                    <div
                      onClick={() => onJumpToGoal(t.goalNodeId)}
                      className="mt-1 mb-2 flex items-center gap-1 flex-wrap text-[10.5px] font-semibold text-violet-300 bg-violet-950/40 border border-violet-800/40 rounded-md px-2 py-1 w-full hover:bg-violet-900/60 transition cursor-pointer leading-relaxed"
                    >
                      <Link2 size={10} className="shrink-0" />
                      <span className="break-words">{originPath}</span>
                    </div>
                  )}

                  {t.description && (
                    <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">
                      {t.description}
                    </p>
                  )}

                  {/* Step chips */}
                  {hasSteps && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {t.steps.map((s, idx) => {
                        const stepDone = idx < t.progress;
                        return (
                          <span
                            key={idx}
                            className={`text-[10px] px-2 py-0.5 rounded-md font-medium transition-all ${
                              stepDone
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 animate-stamp line-through'
                                : 'bg-white/5 text-slate-400 border border-white/5'
                            }`}
                          >
                            {stepDone ? '✓ ' : ''}{s}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Progress bar */}
                  <div className="mt-2.5 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 progress-bar-fill rounded-full"
                      style={{ width: `${(t.progress / (hasSteps ? t.steps.length : 1)) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Daily Focus Stats & Efficiency Modal ── */}
      {dayStatsModalDate && (
        <div
          onClick={() => setDayStatsModalDate(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fade-in cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-md bg-[#14111F] border border-white/10 rounded-3xl p-5 shadow-2xl space-y-4 cursor-default"
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Daily Focus Stats</h3>
                  <p className="text-xs text-slate-400">
                    {new Date(dayStatsModalDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setDayStatsModalDate(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/5 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Metrics Cards */}
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-[#1D1930] p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9.5px] font-extrabold uppercase text-amber-400/80">Net Focus</p>
                <p className="text-sm font-black text-amber-400 mt-0.5">{formatDuration(dayTotalNFT)}</p>
              </div>
              <div className="bg-[#1D1930] p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9.5px] font-extrabold uppercase text-slate-400">Total Duration</p>
                <p className="text-sm font-black text-slate-200 mt-0.5">{formatDuration(dayTotalWCD)}</p>
              </div>
              <div className="bg-[#1D1930] p-3 rounded-2xl border border-white/5 text-center">
                <p className="text-[9.5px] font-extrabold uppercase text-emerald-400">Efficiency</p>
                <p className="text-sm font-black text-emerald-400 mt-0.5">{dayEfficiency}%</p>
              </div>
            </div>

            {/* Single Clean Efficiency Progress Bar */}
            <div className="bg-[#1D1930] p-3 rounded-2xl border border-white/5 space-y-1.5">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-300">Daily Efficiency (Net Focus ÷ Total Duration)</span>
                <span className="text-emerald-400">{dayEfficiency}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-800/80 overflow-hidden">
                <div
                  className="h-full bg-emerald-500/70 rounded-full transition-all"
                  style={{ width: `${dayEfficiency}%` }}
                />
              </div>
            </div>

            {/* Sessions List */}
            <div>
              <h4 className="text-xs font-bold text-slate-400 mb-2">Sessions Run ({modalDateSessions.length})</h4>
              {modalDateSessions.length === 0 ? (
                <p className="text-xs text-slate-500 italic py-3 text-center bg-[#1D1930]/40 rounded-xl border border-white/5">
                  No focus sessions logged on this date.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                  {modalDateSessions.map((s) => {
                    const taskObj = tasks.find((t) => t.id === s.taskId);
                    const title = taskObj?.title || 'Focus Session';
                    const dur = s.endTime - s.startTime;
                    return (
                      <div key={s.id} className="bg-[#1D1930]/80 p-2.5 rounded-xl border border-white/5 flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-slate-200 truncate">{title}</p>
                          <p className="text-[10.5px] text-slate-400 font-mono">
                            {s.wallClockStart} - {s.wallClockEnd} ({formatDuration(dur)})
                          </p>
                        </div>
                        <span className="text-amber-400 font-extrabold bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-lg text-[10.5px] shrink-0">
                          {formatDuration(s.netFocusMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              onClick={() => setDayStatsModalDate(null)}
              className="w-full py-3 rounded-2xl bg-violet-600 hover:bg-violet-500 text-white font-extrabold text-xs shadow-md shadow-violet-600/25 transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
