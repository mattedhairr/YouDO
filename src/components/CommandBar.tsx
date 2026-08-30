import { Calendar, Check, Copy, Settings, Target, Trash2, TrendingUp, X } from 'lucide-react';
import type { View } from '../types';

interface BatchMode {
  count: number;
  leafCount: number;
  onCopy: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onCancel: () => void;
}

interface PasteMode {
  title: string;
  targetName: string;
  onPaste: () => void;
  onCancel: () => void;
}

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  onSettings: () => void;
  todayCount?: number;
  todayDone?: number;
  goalsCount?: number;
  batch?: BatchMode;
  paste?: PasteMode;
}

export default function CommandBar({
  view,
  onNavigate,
  onSettings,
  todayCount = 0,
  todayDone = 0,
  goalsCount = 0,
  batch,
  paste,
}: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);

  const tabs: { id: View; label: string; icon: typeof Check; badge?: number }[] = [
    { id: 'tasks', label: 'Today', icon: Check, badge: remainingToday > 0 ? remainingToday : undefined },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined },
    { id: 'calendar', label: 'Plan', icon: Calendar },
    { id: 'board', label: 'Board', icon: TrendingUp },
  ];

  return (
    <nav className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-4 z-30 max-w-md mx-auto no-swipe" aria-label="Primary navigation">
      <div className="command-dock command-dock-premium flex flex-nowrap items-center rounded-[16px] border border-subtle p-1.5">
        {batch ? (
          <>
            <span className="pl-2 text-[12px] font-semibold text-content-secondary shrink-0 tabular-nums">
              {batch.count} selected
            </span>
            <div className="flex-1" />
            <button
              onClick={batch.onCopy}
              className="px-3 py-2 rounded-xl text-[12px] font-medium text-content-secondary hover:bg-surface"
              title="Copy selected"
            >
              <Copy size={14} className="inline mr-1" />
              Copy
            </button>
            {batch.leafCount > 0 && (
              <button
                onClick={batch.onSchedule}
                className="px-3 py-2 rounded-xl text-[12px] font-semibold bg-primary text-on-primary"
              >
                Schedule {batch.leafCount > 1 ? batch.leafCount : ''}
              </button>
            )}
            <button
              onClick={batch.onDelete}
              className="px-3 py-2 rounded-xl text-[12px] font-medium text-error hover:bg-error-soft"
            >
              <Trash2 size={14} className="inline mr-1" />
              Delete
            </button>
            <button
              onClick={batch.onCancel}
              className="p-2 rounded-xl text-content-secondary hover:bg-surface"
              title="Clear selection"
            >
              <X size={16} />
            </button>
          </>
        ) : paste ? (
          <>
            <div className="p-2 rounded-xl bg-primary-soft text-primary shrink-0">
              <Copy size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-content-primary truncate">{paste.title}</div>
              <div className="text-[11px] text-content-muted truncate">Into {paste.targetName}</div>
            </div>
            <button onClick={paste.onCancel} className="p-2 rounded-xl text-content-secondary hover:bg-surface">
              <X size={16} />
            </button>
            <button
              onClick={paste.onPaste}
              className="px-3.5 py-2 rounded-xl text-[12px] font-semibold bg-primary text-on-primary"
            >
              Paste
            </button>
          </>
        ) : (
          <>
            <div className="flex flex-1 min-w-0 items-center gap-0.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onNavigate(tab.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`command-tab relative flex-1 min-w-0 h-11 flex flex-col items-center justify-center gap-0.5 rounded-[11px] text-[10.5px] transition-all active:scale-[0.96] ${
                      active
                        ? 'is-active text-primary font-semibold'
                        : 'text-content-muted font-medium [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:bg-elevated/60'
                    }`}
                  >
                    <Icon size={16} strokeWidth={active ? 2.45 : 2} />
                    <span className="command-tab-label truncate leading-none">{tab.label}</span>
                    {tab.badge !== undefined && (
                      <span className={`command-tab-badge ${active ? 'is-active' : ''}`}>
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <span className="command-dock-divider" aria-hidden />
            <button
              type="button"
              onClick={onSettings}
              className="command-settings shrink-0 grid place-items-center size-11 rounded-[11px] text-content-muted active:scale-[0.94] [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:bg-elevated"
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={16} strokeWidth={2} />
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
