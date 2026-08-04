import { Calendar, Check, Settings, Target } from 'lucide-react';
import type { View } from '../types';

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  onSettings: () => void;
  accent: string;
  todayCount?: number;
  todayDone?: number;
  goalsCount?: number;
}

export default function CommandBar({ view, onNavigate, onSettings, accent, todayCount = 0, todayDone = 0, goalsCount = 0 }: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);

  const tabs: { id: View; label: string; icon: typeof Check; badge?: number | string }[] = [
    { id: 'tasks', label: 'Today', icon: Check, badge: remainingToday > 0 ? remainingToday : undefined },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <div className="fixed bottom-3 inset-x-4 z-40 max-w-md mx-auto">
      <div className="flex items-center gap-1 rounded-2xl glass-nav p-1.5 shadow-2xl">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold outline-none select-none transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                active
                  ? 'text-white shadow-md shadow-blue-500/25 scale-[1.03] z-10'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100/60 dark:hover:bg-white/5 active:scale-95'
              }`}
              style={active ? { background: accent } : { background: 'transparent' }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none transition-colors ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={onSettings}
          className="shrink-0 p-2.5 rounded-xl text-slate-400 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100/80 dark:hover:bg-white/10 transition-colors"
          title="Settings"
        >
          <Settings size={18} />
        </button>
      </div>
    </div>
  );
}

