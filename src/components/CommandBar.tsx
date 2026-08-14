import { Calendar, Check, Copy, Settings, Target, Trash2, X, Zap } from 'lucide-react';
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

export default function CommandBar({ view, onNavigate, onSettings, todayCount = 0, todayDone = 0, goalsCount = 0, batch, paste }: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);

  const tabs: { id: View; label: string; icon: typeof Check; badge?: number | string }[] = [
    { id: 'tasks', label: 'Today', icon: Check, badge: remainingToday > 0 ? remainingToday : undefined },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <div className="fixed bottom-3 inset-x-4 z-40 max-w-md mx-auto">
      <div className="flex items-center gap-1 rounded-2xl bg-elevated border border-subtle p-1.5 shadow-elevated">

        {batch ? (
          /* ── Batch-action mode ── */
          <>
            <span className="pl-1.5 text-[12px] font-bold text-content-secondary shrink-0 tabular-nums">
              {batch.count} selected
            </span>

            <div className="flex-1" />

            {/* Copy */}
            <button
              onClick={batch.onCopy}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold text-content-secondary border border-subtle hover:bg-elevated transition-all active:scale-95 shrink-0"
              title="Copy selected"
            >
              <Copy size={14} />
              <span>Copy</span>
            </button>

            {/* Schedule (only if leaf-like nodes selected) */}
            {batch.leafCount > 0 && (
              <button
                onClick={batch.onSchedule}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold bg-accent hover:bg-accent-hover text-[#0F172A] transition-all active:scale-95 shrink-0 shadow-sm"
                title={`Schedule ${batch.leafCount} task${batch.leafCount > 1 ? 's' : ''}`}
              >
                <Zap size={14} />
                <span>Schedule {batch.leafCount > 1 ? batch.leafCount : ''}</span>
              </button>
            )}

            {/* Delete */}
            <button
              onClick={batch.onDelete}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold text-error border border-error bg-transparent hover:bg-error-soft transition-all active:scale-95 shrink-0"
              title="Delete selected"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>

            {/* Cancel */}
            <button
              onClick={batch.onCancel}
              className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition-colors shrink-0"
              title="Clear selection"
            >
              <X size={18} />
            </button>
          </>
        ) : paste ? (
          /* ── Paste mode ── */
          <>
            <div className="p-2 rounded-xl bg-primary-soft text-primary shrink-0">
              <Copy size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-content-primary truncate">
                {paste.title}
              </div>
              <div className="text-[10px] font-medium text-content-secondary truncate">
                Paste into {paste.targetName}
              </div>
            </div>
            <button
              onClick={paste.onCancel}
              className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition-colors shrink-0"
              title="Cancel paste"
            >
              <X size={18} />
            </button>
            <button
              onClick={paste.onPaste}
              className="px-3.5 py-2 rounded-xl text-[12px] font-bold bg-accent hover:bg-accent-hover text-[#0F172A] shadow-md transition-all active:scale-95 shrink-0"
            >
              Paste here
            </button>
          </>
        ) : (
          /* ── Normal nav mode ── */
          <>
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = view === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onNavigate(tab.id)}
                  className={`relative flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-[13px] font-semibold outline-none select-none transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    active
                      ? 'bg-primary-soft text-primary shadow-sm scale-[1.03] z-10'
                      : 'text-content-secondary hover:text-content-primary hover:bg-surface active:scale-95'
                  }`}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none transition-colors ${
                        active
                          ? 'bg-primary text-white'
                          : 'bg-surface border border-subtle text-content-muted'
                      }`}
                    >
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* Settings — small icon, not a full tab */}
            <button
              onClick={onSettings}
              className="shrink-0 p-2.5 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition-colors"
              title="Settings"
            >
              <Settings size={17} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
