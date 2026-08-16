import { useState } from 'react';
import type { TaskSession } from '../types';
import { formatDuration } from '../lib/format';
import { currentFocusStreak, netFocusByLocalDate, weekHeatmap } from '../lib/focusTrends';
import { todayISO } from '../lib/dates';

interface Props {
  sessions: TaskSession[];
}

export default function FocusAnalytics({ sessions }: Props) {
  const today = todayISO();
  const byDate = netFocusByLocalDate(sessions);
  const streak = currentFocusStreak(byDate, today);
  const heatmapDays = weekHeatmap(byDate, today);
  const maxNetFocus = Math.max(0, ...heatmapDays.map((d) => d.focusMs));
  const [selected, setSelected] = useState<string | null>(null);

  const selectedDay = heatmapDays.find((d) => d.date === selected);

  return (
    <div className="bg-surface rounded-[12px] border border-subtle p-4 space-y-3 shadow-card">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
          Focus this week
        </h4>
        {streak > 1 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/20">
            <span className="text-[11px] font-bold tabular-nums">{streak}-day streak</span>
          </div>
        )}
      </div>

      <div className="flex items-end justify-between h-[4.5rem] gap-1.5 pt-1">
        {heatmapDays.map((day) => {
          const isToday = day.date === today;
          const pct = maxNetFocus > 0 ? (day.focusMs / maxNetFocus) * 100 : 0;
          const hasFocus = day.focusMs > 0;
          const active = selected === day.date || (!selected && isToday);
          return (
            <button
              key={day.date}
              type="button"
              onClick={() => setSelected((prev) => (prev === day.date ? null : day.date))}
              className="flex-1 h-full flex flex-col items-center gap-1.5 min-w-0"
              aria-pressed={active}
              aria-label={`${day.date}: ${hasFocus ? formatDuration(day.focusMs) : 'no focus'}`}
            >
              <div className="w-full flex-1 bg-border-subtle rounded-sm flex items-end overflow-hidden">
                <div
                  className={`w-full rounded-sm transition-[height,background-color] duration-300 ${
                    isToday ? 'bg-primary' : hasFocus ? 'bg-primary/55' : 'bg-transparent'
                  }`}
                  style={{ height: `${hasFocus ? Math.max(pct, 8) : 0}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${isToday ? 'text-primary font-bold' : 'text-content-muted'}`}>
                {day.dayName}
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-content-secondary tabular-nums min-h-[1rem]">
        {selectedDay
          ? selectedDay.focusMs > 0
            ? `${formatDuration(selectedDay.focusMs)} on that day`
            : 'No countable focus that day'
          : maxNetFocus > 0
            ? 'Tap a day for net focus'
            : 'Start a sitting — bars fill as you work'}
      </p>
    </div>
  );
}
