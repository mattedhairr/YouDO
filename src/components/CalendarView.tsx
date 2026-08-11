import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Link2, Plus } from 'lucide-react';
import type { Task } from '../types';
import { isTaskComplete, pathTitles, useStore } from '../store';

interface Props {
  tasks: Task[];
  onAddTask: (date: string) => void;
  onJumpToGoal: (goalNodeId: string | null | undefined) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function CalendarView({ tasks, onAddTask, onJumpToGoal }: Props) {
  const { goals } = useStore();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(localISODate(new Date()));

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
            <h3 className="text-[14px] font-bold text-slate-100">
              {selectedDate
                ? new Date(selectedDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                : 'Select a date'}
            </h3>
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
                  className={`card p-3 transition-all ${
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

                  {/* Origin banner */}
                  {originPath && (
                    <div
                      onClick={() => onJumpToGoal(t.goalNodeId)}
                      className="mt-1 mb-2 flex items-center gap-1 text-[10.5px] font-semibold text-violet-300 bg-violet-950/40 border border-violet-800/40 rounded-md px-2 py-0.5 w-fit hover:bg-violet-900/60 transition cursor-pointer"
                    >
                      <Link2 size={10} className="shrink-0" />
                      <span className="truncate max-w-[240px]">{originPath}</span>
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
    </div>
  );
}
