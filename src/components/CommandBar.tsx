import { Calendar, Check, Copy, RotateCcw, Settings, Target, Trash2, TrendingUp, X } from 'lucide-react';
import type { View } from '../types';

interface BatchMode {
  count: number;
  scheduleCount: number;
  replanCount: number;
  unplanCount: number;
  onCopy: () => void;
  onDelete: () => void;
  onSchedule: () => void;
  onReplan: () => void;
  onUnplan: () => void;
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
  syncAttention?: boolean;
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
  syncAttention = false,
  batch,
  paste,
}: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);

  const tabs: { id: View; label: string; icon: typeof Check; badge?: number }[] = [
    { id: 'tasks', label: 'Today', icon: Check, badge: remainingToday > 0 ? remainingToday : undefined },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
    { id: 'board', label: 'Board', icon: TrendingUp },
  ];

  return (
    <nav className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] inset-x-4 z-30 max-w-md mx-auto no-swipe" aria-label="Primary navigation">
      <div className="command-dock command-dock-premium flex flex-nowrap items-center rounded-[16px] border border-subtle p-1.5">
        {batch ? (
          <div className="w-full p-1 space-y-1.5">
            <div className="h-9 flex items-center gap-1">
              <span className="pl-2 flex-1 text-[12px] font-semibold text-content-secondary tabular-nums">
                {batch.count} selected
              </span>
              <button onClick={batch.onCopy} className="h-8 px-2.5 rounded-[9px] text-[11px] font-medium text-content-secondary hover:bg-surface inline-flex items-center gap-1.5" title="Copy selected">
                <Copy size={13} /> Copy
              </button>
              <button onClick={batch.onDelete} className="h-8 px-2.5 rounded-[9px] text-[11px] font-medium text-error hover:bg-error-soft inline-flex items-center gap-1.5" title="Delete selected">
                <Trash2 size={13} /> Delete
              </button>
              <button onClick={batch.onCancel} className="w-8 h-8 grid place-items-center rounded-[9px] text-content-secondary hover:bg-surface" title="Clear selection">
                <X size={15} />
              </button>
            </div>
            {(batch.scheduleCount > 0 || batch.replanCount > 0 || batch.unplanCount > 0) ? (
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={batch.onSchedule} disabled={batch.scheduleCount === 0} className="h-9 rounded-[9px] text-[11px] font-semibold bg-primary text-on-primary disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <Calendar size={13} /> Schedule {batch.scheduleCount || ''}
                </button>
                <button onClick={batch.onReplan} disabled={batch.replanCount === 0} className="h-9 rounded-[9px] text-[11px] font-semibold bg-primary-soft text-primary border border-primary/15 disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <RotateCcw size={13} /> Replan {batch.replanCount || ''}
                </button>
                <button onClick={batch.onUnplan} disabled={batch.unplanCount === 0} className="h-9 rounded-[9px] text-[11px] font-semibold bg-error-soft text-error border border-error/15 disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <X size={13} /> Unplan {batch.unplanCount || ''}
                </button>
              </div>
            ) : (
              <p className="px-2 pb-1 text-[10.5px] text-content-muted">No schedulable leaf tasks selected. Active sessions stay protected.</p>
            )}
          </div>
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
              className="command-settings relative shrink-0 grid place-items-center size-11 rounded-[11px] text-content-muted active:scale-[0.94] [@media(hover:hover)]:hover:text-content-primary [@media(hover:hover)]:hover:bg-elevated"
              title="Settings"
              aria-label="Settings"
            >
              <Settings size={16} strokeWidth={2} />
              {syncAttention && (
                <span
                  className="absolute right-2 top-2 size-2 rounded-full bg-warning ring-2 ring-[var(--bg-surface)]"
                  aria-label="Sync needs review"
                />
              )}
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
