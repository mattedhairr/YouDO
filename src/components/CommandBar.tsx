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

interface Props {
  view: View;
  onNavigate: (v: View) => void;
  onSettings: () => void;
  accent: string;
  todayCount?: number;
  todayDone?: number;
  goalsCount?: number;
  batch?: BatchMode;
}

export default function CommandBar({ view, onNavigate, onSettings, accent, todayCount = 0, todayDone = 0, goalsCount = 0, batch }: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);

  const tabs: { id: View; label: string; icon: typeof Check; badge?: number | string }[] = [
    { id: 'tasks', label: 'Today', icon: Check, badge: remainingToday > 0 ? remainingToday : undefined },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined },
    { id: 'calendar', label: 'Calendar', icon: Calendar },
  ];

  return (
    <div className="fixed bottom-3 inset-x-4 z-40 max-w-md mx-auto">
      <div className="flex items-center gap-1 rounded-2xl glass-nav p-1.5 shadow-2xl">

        {batch ? (
          /* ── Batch-action mode ── */
          <>
            <span className="pl-1.5 text-[12px] font-bold text-[#A09CB8] shrink-0 tabular-nums">
              {batch.count} selected
            </span>

            <div className="flex-1" />

            {/* Copy */}
            <button
              onClick={batch.onCopy}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold text-[#EEE9FC] bg-white/10 hover:bg-white/15 transition-all active:scale-95 shrink-0"
              title="Copy selected"
            >
              <Copy size={14} />
              <span>Copy</span>
            </button>

            {/* Schedule (only if leaf-like nodes selected) */}
            {batch.leafCount > 0 && (
              <button
                onClick={batch.onSchedule}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold text-white transition-all active:scale-95 shrink-0 shadow-sm"
                style={{ background: accent }}
                title={`Schedule ${batch.leafCount} task${batch.leafCount > 1 ? 's' : ''}`}
              >
                <Zap size={14} />
                <span>Schedule {batch.leafCount > 1 ? batch.leafCount : ''}</span>
              </button>
            )}

            {/* Delete */}
            <button
              onClick={batch.onDelete}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] font-semibold text-white bg-rose-500 hover:bg-rose-600 transition-all active:scale-95 shrink-0 shadow-sm"
              title="Delete selected"
            >
              <Trash2 size={14} />
              <span>Delete</span>
            </button>

            {/* Cancel */}
            <button
              onClick={batch.onCancel}
              className="p-2 rounded-xl text-[#5F5980] hover:text-[#EEE9FC] hover:bg-white/8 transition-colors shrink-0"
              title="Clear selection"
            >
              <X size={18} />
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
                      ? 'text-white shadow-md scale-[1.03] z-10'
                      : 'text-[#5F5980] hover:text-[#EEE9FC] hover:bg-white/5 active:scale-95'
                  }`}
                  style={active ? { background: accent, boxShadow: `0 4px 14px -2px ${accent}66` } : { background: 'transparent' }}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                  {tab.badge !== undefined && (
                    <span
                      className={`inline-flex items-center justify-center text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none transition-colors ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-violet-600/25 text-violet-300 border border-violet-500/20'
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
              className="shrink-0 p-2.5 rounded-xl text-[#5F5980] hover:text-[#EEE9FC] hover:bg-white/5 transition-colors"
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
