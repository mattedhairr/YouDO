import { useMemo, useState } from 'react';
import Overlay from './Overlay';
import { ChevronLeft, ChevronRight, Link2, Plus, BarChart2, X, Info } from 'lucide-react';
import type { Task } from '../types';
import { isTaskComplete, localISODate, pathTitles, useStore, isOpenBacklogTask } from '../store';
import { formatDuration } from '../lib/format';
import { isCountableSession, sessionOverlapsLocalDate } from '../lib/sessionStats';

interface Props {
  tasks: Task[];
  onAddTask: (date: string) => void;
  onJumpToGoal: (goalNodeId: string | null | undefined) => void;
  onViewStats?: (taskId: string, title: string) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CalendarView({ tasks, onAddTask, onJumpToGoal, onViewStats }: Props) {
  const { goals, sessionHistory } = useStore();
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(localISODate(new Date()));
  const [dayStatsModalDate, setDayStatsModalDate] = useState<string | null>(null);
  const [showDayStatsHelp, setShowDayStatsHelp] = useState(false);

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
      if (t.originalTargetDate) add(t.originalTargetDate, t);
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
    return allSessions.flatMap((s) => {
      const slice = sessionOverlapsLocalDate(s, dayStatsModalDate);
      if (!slice || (slice.durationMs <= 0 && slice.netFocusMs <= 0)) return [];
      return [{ session: s, slice }];
    });
  }, [dayStatsModalDate, sessionHistory]);

  const modalDateTasks = useMemo(() => {
    return dayStatsModalDate ? (tasksByDate[dayStatsModalDate] ?? []) : [];
  }, [dayStatsModalDate, tasksByDate]);

  const hasSessionProcess = (tId: string, date: string) => {
    return sessionHistory[tId]?.some((s) => {
      if (!isCountableSession(s)) return false;
      const slice = sessionOverlapsLocalDate(s, date);
      return !!slice && slice.netFocusMs > 0;
    }) ?? false;
  };

  // Group 1: Task Execution (Native)
  const nativeTasks = modalDateTasks.filter(t => 
    (!t.originalTargetDate && t.targetDate === dayStatsModalDate!) || 
    t.pastFailedNativeDates?.includes(dayStatsModalDate!) ||
    t.originalTargetDate === dayStatsModalDate!
  );
  
  // Filter out manual completions from stats calculation
  const processNativeTasks = nativeTasks.filter(t =>
    !isTaskComplete(t) ||
    hasSessionProcess(t.id, dayStatsModalDate!) ||
    t.pastFailedNativeDates?.includes(dayStatsModalDate!) ||
    t.originalTargetDate === dayStatsModalDate!
  );
  
  const nativeScheduledCount = processNativeTasks.length;
  const nativeCompletedCount = processNativeTasks.filter(t => isTaskComplete(t) && t.targetDate === dayStatsModalDate!).length;
  const nativeFailedCount = processNativeTasks.filter(t => t.pastFailedNativeDates?.includes(dayStatsModalDate!) || t.originalTargetDate === dayStatsModalDate! || (t.targetDate === dayStatsModalDate! && !isTaskComplete(t) && dayStatsModalDate! < todayStr)).length;
  
  const taskEfficiency = nativeScheduledCount > 0 ? Math.round((nativeCompletedCount / nativeScheduledCount) * 100) : 0;

  // Group 2: Focus Quality
  const dayTotalNFT = useMemo(
    () => modalDateSessions.filter(({ session }) => isCountableSession(session)).reduce((acc, { slice }) => acc + slice.netFocusMs, 0),
    [modalDateSessions],
  );
  const dayTotalWCD = useMemo(
    () => modalDateSessions.filter(({ session }) => isCountableSession(session)).reduce((acc, { slice }) => acc + slice.durationMs, 0),
    [modalDateSessions],
  );
  const focusEfficiency = dayTotalWCD > 0 ? Math.min(100, Math.round((dayTotalNFT / dayTotalWCD) * 100)) : 0;

  // Group 3: Momentum
  const globalBacklogsCount = tasks.filter((t) => isOpenBacklogTask(t)).length;
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
        <button onClick={prevMonth} className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface transition-colors">
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-base font-bold text-content-primary">{monthName}</h2>
        <button onClick={nextMonth} className="p-2 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface transition-colors">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="bg-surface border border-subtle rounded-2xl shadow-card p-3.5">
        <div className="grid grid-cols-7 mb-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] font-bold uppercase tracking-wider text-content-secondary py-1">{d}</div>
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
                    ? 'bg-primary text-on-primary font-semibold shadow-card scale-105 z-10'
                    : isToday
                      ? 'bg-primary-soft text-primary-glow font-bold border border-primary/20'
                      : 'text-content-primary hover:bg-surface'
                }`}
              >
                {/* Math Superscript Notation x^n */}
                <span className="inline-flex items-baseline">
                  <span>{day}</span>
                  {hasTasks && (
                    <sup className={`task-sup font-bold ${
                      isSelected
                        ? 'text-warning'
                        : allDone
                          ? 'text-secondary'
                          : 'text-warning'
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
              <h3 className="text-[14px] font-bold text-content-primary">
                {selectedDate
                  ? new Date(selectedDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
                  : 'Select a date'}
              </h3>
              {selectedDate && (
                <button
                  onClick={() => setDayStatsModalDate(selectedDate)}
                  className="p-1 rounded-lg bg-primary-soft text-primary-glow hover:bg-primary-soft border border-primary/20 transition text-[10px] font-bold flex items-center gap-1"
                  title="View Daily Efficiency & Stats"
                >
                  <BarChart2 size={12} /> Stats
                </button>
              )}
            </div>
            {selectedTasks.length > 0 && (
              <p className="text-[11px] text-content-secondary font-medium">
                {selectedDone}/{selectedTasks.length} done
              </p>
            )}
          </div>
          {selectedDate && (
            <button
              onClick={() => onAddTask(selectedDate)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-on-primary text-xs font-semibold rounded-xl"
            >
              <Plus size={14} /> Add task
            </button>
          )}
        </div>

        {selectedTasks.length === 0 ? (
          <div className="bg-surface border border-subtle rounded-2xl shadow-card p-6 text-center text-content-secondary text-xs">
            No tasks planned for this date.
          </div>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map((t) => {
              const complete = isTaskComplete(t);
              const hasSteps = t.steps.length > 0;
              const originPath = getOriginPath(t.goalNodeId);
              
              const isNativeToSelected = !t.originalTargetDate && t.targetDate === selectedDate!;
              const hasFailedNativelyHere = t.pastFailedNativeDates?.includes(selectedDate!) || t.originalTargetDate === selectedDate! || (isNativeToSelected && !complete && selectedDate! < todayStr);
              const isBacklogCompletedHere = !!t.originalTargetDate && t.targetDate === selectedDate! && complete;
              
              const isManualCompletion = complete && t.targetDate === selectedDate! && !sessionHistory[t.id]?.some(isCountableSession);

              return (
                <div
                  key={t.id}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    if (onViewStats) onViewStats(t.id, t.title);
                  }}
                  className={`bg-surface border border-subtle rounded-2xl shadow-card p-4 transition-all select-none ${
                    complete ? 'opacity-60 bg-surface/50' : ''
                  }`}
                >
                  <div className="flex flex-col gap-1.5 mb-2">
                    {/* Eyebrow: Path */}
                    {originPath && (
                      <div
                        onClick={() => onJumpToGoal(t.goalNodeId)}
                        className="flex items-center gap-1.5 text-[10px] font-extrabold bg-elevated border border-subtle rounded-lg px-2 py-0.5 leading-normal shadow-xs hover:bg-surface hover:border-primary/20 transition-all cursor-pointer w-fit group/path max-w-full"
                      >
                        <Link2 size={10} className="shrink-0 text-primary mr-0.5 group-hover/path:text-primary transition-colors" />
                        <div className="flex items-center gap-1.5 truncate">
                          {originPath.split('/').slice(0, 2).map((part, i, arr) => (
                            <span key={i} className="flex items-center gap-1.5 shrink-0">
                              <span className="text-primary-glow group-hover/path:text-primary-glow transition-colors truncate">
                                {part.trim()}
                              </span>
                              {i < arr.length - 1 && (
                                <span className="text-content-muted shrink-0">•</span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Title Row */}
                    <div className="flex items-start justify-between gap-3 pr-1">
                      <div className="flex items-start gap-2 flex-1">
                        <span className={`mt-[6px] w-1.5 h-1.5 rounded-full shrink-0 ${complete ? 'bg-secondary/30' : 'bg-primary'} shadow-sm`} />
                        <div className="flex flex-col gap-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className={`text-[14.5px] font-bold leading-snug tracking-tight ${complete ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                              {t.title}
                            </h3>
                            {hasFailedNativelyHere && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-error-soft text-error border border-error/20">
                                FAILED
                              </span>
                            )}
                            {isBacklogCompletedHere && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-error-soft text-error border border-error/20">
                                BACKLOG
                              </span>
                            )}
                            {isManualCompletion && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-surface text-content-muted border border-subtle">
                                MANUAL
                              </span>
                            )}
                          </div>

                          {/* Subtitle context (remaining path) */}
                          {originPath && originPath.split('/').length > 3 && (
                            <div className="text-[11px] font-normal text-content-muted line-clamp-1">
                              {originPath.split('/').slice(2, -1).map(p => p.trim()).join(' / ')}
                            </div>
                          )}

                          {t.description && (
                            <p className="text-[11.5px] text-content-secondary/80 line-clamp-2 mt-1">
                              {t.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[12px] font-bold tabular-nums text-content-secondary shrink-0 mt-0.5">
                        {t.progress}/{hasSteps ? t.steps.length : 1}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-1 h-1.5 rounded-full bg-border-subtle overflow-hidden mb-2.5">
                    <div
                      className="h-full bg-secondary progress-bar-fill rounded-full"
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
                                ? 'bg-secondary/10 text-secondary border border-secondary/20 line-through'
                                : 'bg-surface text-content-secondary border border-subtle'
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
      {dayStatsModalDate && (
        <Overlay open onClose={() => setDayStatsModalDate(null)} align="center">
          <div className="panel sheet-up p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-subtle">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-soft border border-primary/20 flex items-center justify-center text-primary dark:text-primary">
                  <BarChart2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-content-primary">Daily Focus Stats</h3>
                  <p className="text-xs text-content-secondary">
                    {new Date(dayStatsModalDate + 'T00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => setShowDayStatsHelp((v) => !v)}
                  className={`p-1.5 rounded-lg ${showDayStatsHelp ? 'bg-primary-soft text-primary' : 'text-content-secondary hover:text-content-primary hover:bg-elevated'}`}
                  title="How stats work"
                >
                  <Info className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setDayStatsModalDate(null)}
                  className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-elevated transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="space-y-4 max-h-[70vh] overflow-y-auto no-scrollbar pb-2">
              {showDayStatsHelp && (
                <div className="bg-elevated border border-subtle rounded-[12px] p-3.5 space-y-2 text-[12px] text-content-secondary leading-relaxed">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">How stats work</p>
                  <p><span className="font-semibold text-content-primary">Task execution</span> counts scheduled work for this date. Completed and failed are from that set. Manual completions (no focus session) are left out so they do not inflate efficiency.</p>
                  <p><span className="font-semibold text-content-primary">Task efficiency</span> is completed ÷ scheduled for this date.</p>
                  <p><span className="font-semibold text-content-primary">Net focus</span> is time sessions were running and not paused. Overnight sessions are split at midnight so each day only gets its share.</p>
                  <p><span className="font-semibold text-content-primary">Total duration</span> is start-to-stop time on this date, including pauses.</p>
                  <p><span className="font-semibold text-content-primary">Focus efficiency</span> is net focus ÷ total duration for this date.</p>
                  <p><span className="font-semibold text-content-primary">Momentum</span> is backlogs you cleared today versus how many are still open.</p>
                  <p>Sessions under 15 seconds of focus are ignored in the totals.</p>
                </div>
              )}
              {/* Group 1: Task Execution */}
              <div className="bg-surface p-3 rounded-[12px] border border-subtle space-y-2.5">
                <h4 className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">Task execution</h4>
                <div className="grid grid-cols-3 gap-2">
                  <div className="bg-elevated  p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-content-secondary">Scheduled</p>
                    <p className="text-sm font-semibold text-content-primary">{nativeScheduledCount}</p>
                  </div>
                  <div className="bg-secondary/10  p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-secondary">Completed</p>
                    <p className="text-sm font-semibold text-secondary">{nativeCompletedCount}</p>
                  </div>
                  <div className="bg-error-soft  p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-error">Failed</p>
                    <p className="text-sm font-semibold text-error">{nativeFailedCount}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-content-muted w-24">Task Efficiency</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${taskEfficiency}%` }} />
                  </div>
                  <span className="text-[10px] font-bold text-primary w-8 text-right">{taskEfficiency}%</span>
                </div>
              </div>

              {/* Group 2: Focus Quality */}
              <div className="bg-surface p-3 rounded-[12px] border border-subtle space-y-2.5">
                <h4 className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">Focus quality</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-primary-soft p-2 rounded-xl text-center">
                    <p className="text-[9px] font-semibold uppercase text-primary">Net Focus</p>
                    <p className="text-sm font-semibold text-primary">{formatDuration(dayTotalNFT)}</p>
                  </div>
                  <div className="bg-elevated  p-2 rounded-xl text-center">
                    <p className="text-[9px] font-bold uppercase text-content-secondary">Total Duration</p>
                    <p className="text-sm font-semibold text-content-muted">{formatDuration(dayTotalWCD)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-content-muted w-24">Focus Efficiency</span>
                  <div className="flex-1 h-1.5 rounded-full bg-border-subtle overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${focusEfficiency}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-primary w-8 text-right">{focusEfficiency}%</span>
                </div>
              </div>

              {/* Group 3: Momentum */}
              <div className="bg-surface p-3 rounded-[12px] border border-subtle space-y-2">
                <h4 className="text-[10px] font-semibold text-content-muted uppercase tracking-wider">Momentum</h4>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-content-muted">Backlogs Cleared</span>
                  <span className="text-xs font-semibold text-error">
                    {totalRelevantBacklogs === 0 ? 'No Backlogs Remaining' : `${backlogsCleared} out of ${totalRelevantBacklogs}`}
                  </span>
                </div>
                <p className="text-[10.5px] font-semibold text-content-secondary italic">
                  {momentumStr}
                </p>
              </div>

              {/* Sessions List */}
            <div>
              <h4 className="text-xs font-bold text-content-secondary mb-2">Sessions Run ({modalDateSessions.length})</h4>
              {modalDateSessions.length === 0 ? (
                <p className="text-xs text-content-secondary italic py-3 text-center bg-elevated  rounded-xl border border-subtle dark:border-subtle">
                  No focus sessions logged on this date.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto no-scrollbar">
                  {modalDateSessions.map(({ session: s, slice }) => {
                    const taskObj = tasks.find((t) => t.id === s.taskId);
                    const title = taskObj?.title || 'Focus Session';
                    const overnight = localISODate(new Date(s.startTime)) !== localISODate(new Date(s.endTime));
                    return (
                      <div key={s.id} className="bg-elevated  p-2.5 rounded-xl border border-subtle dark:border-subtle flex items-center justify-between text-xs">
                        <div className="min-w-0 pr-2">
                          <p className="font-bold text-content-primary dark:text-content-primary truncate">{title}</p>
                          <p className="text-[10.5px] text-content-secondary font-mono">
                            {s.wallClockStart} - {s.wallClockEnd}
                            {overnight ? ' · split' : ''} ({formatDuration(slice.durationMs)})
                          </p>
                        </div>
                        <span className="text-primary font-semibold bg-primary-soft px-2 py-0.5 rounded-lg text-[10.5px] shrink-0">
                          {formatDuration(slice.netFocusMs)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          </div>
        </Overlay>
      )}
    </div>
  );
}
