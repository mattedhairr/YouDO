import { useMemo } from 'react';
import type { TaskSession } from '../types';
import { isCountableSession } from '../lib/sessionStats';
import { formatDuration } from '../lib/format';

interface Props {
  sessions: TaskSession[];
}

export default function FocusAnalytics({ sessions }: Props) {
  const { streak, heatmapDays, maxNetFocus } = useMemo(() => {
    // 1. Filter out manual check-offs
    const counted = sessions.filter(isCountableSession);
    
    // 2. Map sessions by local date (YYYY-MM-DD)
    const byDate = new Map<string, number>();
    for (const s of counted) {
      // Use wallClockStart or just new Date(s.startTime) to find local date string
      // A simple approach is using Date object in local time
      const dateStr = new Date(s.startTime).toLocaleDateString('en-CA'); // YYYY-MM-DD local
      byDate.set(dateStr, (byDate.get(dateStr) || 0) + s.netFocusMs);
    }

    // 3. Compute current streak (counting backwards from today)
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // We allow the streak to be "alive" if they haven't worked today yet, 
    // but they did work yesterday.
    let checkDate = new Date(today);
    let todayStr = checkDate.toLocaleDateString('en-CA');
    
    if (byDate.get(todayStr) && byDate.get(todayStr)! > 0) {
      currentStreak++;
    } else {
      // If not worked today, check yesterday to see if streak is still alive
    }

    // Check past days
    for (let i = 1; i < 365; i++) {
      const past = new Date(today);
      past.setDate(today.getDate() - i);
      const str = past.toLocaleDateString('en-CA');
      
      if (byDate.get(str) && byDate.get(str)! > 0) {
        currentStreak++;
      } else {
        // Break the streak if a day is missed (unless it's today and they just haven't started)
        if (i > 1 || (i === 1 && currentStreak === 0)) {
           break;
        }
      }
    }

    // 4. Compute 7-day heatmap (last 7 days including today)
    const heatmap = [];
    let maxMs = 0;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const str = d.toLocaleDateString('en-CA');
      const focusMs = byDate.get(str) || 0;
      if (focusMs > maxMs) maxMs = focusMs;
      heatmap.push({
        date: d,
        str,
        focusMs,
        dayName: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      });
    }

    return { streak: currentStreak, heatmapDays: heatmap, maxNetFocus: maxMs };
  }, [sessions]);

  if (heatmapDays.every((d) => d.focusMs === 0)) {
    return null; // Don't show analytics if there's no countable focus time at all
  }

  return (
    <div className="bg-surface rounded-[16px] border border-subtle p-4 space-y-4 shadow-card">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold text-content-secondary uppercase tracking-wider">
          Focus Trends
        </h4>
        {streak > 1 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-accent-soft text-accent border border-accent/20">
            <span className="text-[12px]">🔥</span>
            <span className="text-[11px] font-bold">{streak} Day Streak</span>
          </div>
        )}
      </div>

      {/* 7-Day Heatmap Bar Chart */}
      <div className="flex items-end justify-between h-20 gap-1.5 pt-2">
        {heatmapDays.map((day) => {
          const isToday = new Date().toLocaleDateString('en-CA') === day.str;
          const pct = maxNetFocus > 0 ? (day.focusMs / maxNetFocus) * 100 : 0;
          const hasFocus = day.focusMs > 0;
          
          return (
            <div key={day.str} className="flex-1 flex flex-col items-center gap-2 group relative">
              {/* Tooltip on hover/active */}
              {hasFocus && (
                <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-elevated text-content-primary text-[10px] font-medium px-2 py-1 rounded shadow-elevated border border-subtle whitespace-nowrap z-10 pointer-events-none">
                  {formatDuration(day.focusMs)}
                </div>
              )}
              
              <div className="w-full bg-border-subtle rounded-sm h-full flex items-end overflow-hidden">
                <div 
                  className={`w-full rounded-sm transition-all duration-500 ease-out ${
                    isToday ? 'bg-primary' : hasFocus ? 'bg-primary/60' : 'bg-transparent'
                  }`}
                  style={{ height: `${Math.max(pct, hasFocus ? 5 : 0)}%` }}
                />
              </div>
              <span className={`text-[10px] font-medium ${isToday ? 'text-primary font-bold' : 'text-content-muted'}`}>
                {day.dayName}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
