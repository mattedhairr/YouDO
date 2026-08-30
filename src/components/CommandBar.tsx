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
    <nav className="fixed bottom-3 inset-x-4 z-30 max-w-md mx-auto no-swipe">
      <div className="command-dock flex flex-nowrap items-center gap-0.5 rounded-[14px] border border-subtle p-1">
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
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onNavigate(tab.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex-1 min-w-0 h-9 flex items-center justify-center gap-1 rounded-[10px] text-[11px] transition-colors ${
                    active
                      ? 'bg-primary-soft text-primary font-semibold'
                      : 'text-content-muted font-medium [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:bg-elevated'
                  }`}
                >
                  <Icon size={15} strokeWidth={active ? 2.4 : 2} />
                  <span className="truncate max-[22rem]:hidden">{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`min-w-[16px] h-4 px-1 grid place-items-center rounded-full text-[10px] font-semibold leading-none tabular-nums ${
                        active ? 'bg-primary/20 text-primary' : 'bg-elevated text-content-secondary'
                      }`}
                    >
                      {tab.badge > 99 ? '99+' : tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onSettings}
              className="shrink-0 grid place-items-center size-9 rounded-[10px] text-content-muted [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:bg-elevated"
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
