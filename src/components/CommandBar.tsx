import { lazy, Suspense, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Calendar, CalendarDays, CheckCircle2, Copy, FolderInput, RotateCcw, Settings, Target, Trash2, Users, X } from 'lucide-react';
import type { View } from '../types';
import TabPill from './TabPill';
import { useUiPrefs } from '../hooks/useUiPrefs';
import { hapticTick } from '../lib/haptics';

/** Holding the Settings button this long opens the Admin Hub (admins only). */
export const ADMIN_HOLD_MS = 700;
const ADMIN_HOLD_SLOP = 10;

// The v7 CommandBar is only fetched when Classic Look is on, to keep it out of the initial bundle.
const LegacyCommandBar = lazy(() => import('../legacy/LegacyCommandBar'));

interface BatchMode {
  count: number;
  scheduleCount: number;
  replanCount: number;
  unplanCount: number;
  onCopy: () => void;
  onMove?: () => void;
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
  /**
   * Today's two lists, switched like the Hub's: tap Today again, or swipe up
   * or down on it. Without onSetTodaySubTab the Today tab is a plain tab.
   */
  todaySubTab?: 'today' | 'backlog';
  onSetTodaySubTab?: (tab: 'today' | 'backlog') => void;
  /** Open cards in Backlog: shown on the Today tab while Scheduled is open. */
  backlogCount?: number;
  hubSubTab?: 'social' | 'private';
  onToggleHubSubTab?: () => void;
  onSetHubSubTab?: (tab: 'social' | 'private') => void;
  /** Unread / pending on Hub while user is on another primary tab */
  showHubNavDot?: boolean;
  hubCommunityUnread?: number;
  /** Any private-side activity (notifications, DMs, room requests). */
  hubPrivateAttention?: boolean;
  /** Admins only: holding Settings opens the Admin Hub. */
  onOpenAdminHub?: () => void;
  /** Admin items waiting to be handled; shown as a number on the Settings button. */
  adminPending?: number;
}

/** Press-and-hold on the Settings button; a normal tap still opens Settings. */
function useAdminHold(onOpenAdminHub: (() => void) | undefined) {
  const [holding, setHolding] = useState(false);
  const hold = useRef<{ timer: number; x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (hold.current) window.clearTimeout(hold.current.timer);
    hold.current = null;
    setHolding(false);
  };
  useEffect(() => cancel, []);

  if (!onOpenAdminHub) return { holding: false, handlers: {}, consumeClick: () => false };

  return {
    holding,
    consumeClick: () => {
      if (!fired.current) return false;
      fired.current = false;
      return true;
    },
    handlers: {
      onPointerDown: (event: ReactPointerEvent) => {
        if (!event.isPrimary || event.button !== 0) return;
        fired.current = false;
        cancel();
        hold.current = {
          x: event.clientX,
          y: event.clientY,
          timer: window.setTimeout(() => {
            hold.current = null;
            fired.current = true;
            setHolding(false);
            hapticTick();
            onOpenAdminHub();
          }, ADMIN_HOLD_MS),
        };
        setHolding(true);
      },
      onPointerMove: (event: ReactPointerEvent) => {
        const start = hold.current;
        if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > ADMIN_HOLD_SLOP) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu: (event: ReactMouseEvent) => event.preventDefault(),
    },
  };
}

function ModernCommandBar({
  view,
  onNavigate,
  onSettings,
  todayCount = 0,
  todayDone = 0,
  goalsCount = 0,
  syncAttention = false,
  batch,
  paste,
  todaySubTab = 'today',
  onSetTodaySubTab,
  backlogCount = 0,
  hubSubTab = 'social',
  onToggleHubSubTab,
  onSetHubSubTab,
  showHubNavDot = false,
  hubCommunityUnread = 0,
  hubPrivateAttention = false,
  onOpenAdminHub,
  adminPending = 0,
}: Props) {
  const remainingToday = Math.max(0, todayCount - todayDone);
  const switchTouchStartY = useRef<number | null>(null);
  const [{ liquidGlass }] = useUiPrefs();
  const adminHold = useAdminHold(onOpenAdminHub);
  const showAdminBadge = Boolean(onOpenAdminHub) && adminPending > 0;

  // On Today the badge counts the other list: Backlog's open cards (red) while
  // Scheduled is showing, what's left today (quiet) while Backlog is.
  const todaySwitch = view === 'tasks' && Boolean(onSetTodaySubTab);
  const todayBadge = !todaySwitch ? remainingToday : todaySubTab === 'today' ? backlogCount : remainingToday;
  const tabs: { id: View; label: string; icon: typeof Target; badge?: number; quietBadge?: boolean }[] = [
    { id: 'tasks', label: 'Today', icon: CheckCircle2, badge: todayBadge > 0 ? todayBadge : undefined, quietBadge: todaySwitch && todaySubTab === 'backlog' },
    { id: 'goals', label: 'Goals', icon: Target, badge: goalsCount > 0 ? goalsCount : undefined, quietBadge: true },
    { id: 'calendar', label: 'Calendar', icon: CalendarDays },
    { id: 'board', label: 'Hub', icon: Users },
  ];

  return (
    <nav className="tab-bar-wrap no-swipe" aria-label="Primary navigation">
      <div className={`glass tab-bar ${batch || paste ? 'tab-bar-sheet' : ''}`}>
        {batch ? (
          <div className="w-full p-1 space-y-1.5">
            <div className="h-10 flex items-center gap-1">
              <span className="pl-2 flex-1 text-[15px] font-semibold text-content-primary tabular-nums">
                {batch.count} selected
              </span>
              <button onClick={batch.onCopy} className="h-9 px-2.5 rounded-full text-[13px] font-medium text-primary inline-flex items-center gap-1" title="Copy selected">
                <Copy size={13} /> Copy
              </button>
              {batch.onMove && (
                <button onClick={batch.onMove} className="h-9 px-2.5 rounded-full text-[13px] font-medium text-primary inline-flex items-center gap-1" title="Move selected">
                  <FolderInput size={13} /> Move
                </button>
              )}
              <button onClick={batch.onDelete} className="h-9 px-2.5 rounded-full text-[13px] font-medium text-error inline-flex items-center gap-1" title="Delete selected">
                <Trash2 size={13} /> Delete
              </button>
              <button onClick={batch.onCancel} className="w-9 h-9 grid place-items-center rounded-full bg-fill text-content-secondary" title="Clear selection">
                <X size={15} />
              </button>
            </div>
            {(batch.scheduleCount > 0 || batch.replanCount > 0 || batch.unplanCount > 0) ? (
              <div className="grid grid-cols-3 gap-1.5">
                <button onClick={batch.onSchedule} disabled={batch.scheduleCount === 0} className="h-10 rounded-full text-[13px] font-semibold bg-primary text-on-primary disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <Calendar size={13} /> Schedule {batch.scheduleCount || ''}
                </button>
                <button onClick={batch.onReplan} disabled={batch.replanCount === 0} className="h-10 rounded-full text-[13px] font-semibold bg-primary-soft text-primary disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <RotateCcw size={13} /> Replan {batch.replanCount || ''}
                </button>
                <button onClick={batch.onUnplan} disabled={batch.unplanCount === 0} className="h-10 rounded-full text-[13px] font-semibold bg-error-soft text-error disabled:opacity-25 inline-flex items-center justify-center gap-1">
                  <X size={13} /> Unplan {batch.unplanCount || ''}
                </button>
              </div>
            ) : (
              <p className="px-2 pb-1 text-[10.5px] text-content-muted">No schedulable tasks selected. Active sessions stay protected.</p>
            )}
          </div>
        ) : paste ? (
          <>
            <div className="ml-1 w-10 h-10 grid place-items-center rounded-full bg-primary-soft text-primary shrink-0">
              <Copy size={17} />
            </div>
            <div className="flex-1 min-w-0 px-2">
              <div className="text-[15px] font-semibold text-content-primary truncate">{paste.title}</div>
              <div className="text-[13px] text-content-secondary truncate">Into {paste.targetName}</div>
            </div>
            <button onClick={paste.onCancel} className="w-10 h-10 grid place-items-center rounded-full bg-fill text-content-secondary" aria-label="Cancel paste">
              <X size={17} />
            </button>
            <button
              onClick={paste.onPaste}
              className="h-10 px-5 rounded-full text-[15px] font-semibold bg-primary text-on-primary"
            >
              Paste
            </button>
          </>
        ) : (
          <>
            <div className={`tab-bar-tabs ${liquidGlass ? 'has-pill' : ''}`}>
              {liquidGlass && (
                <TabPill
                  activeIndex={tabs.findIndex((tab) => tab.id === view)}
                  onSelect={(index) => onNavigate(tabs[index].id)}
                />
              )}
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const active = view === tab.id;
                const isHubTab = tab.id === 'board';
                const isTodaySwitch = tab.id === 'tasks' && active && todaySwitch;
                const switches = (isHubTab && active) || isTodaySwitch;
                // Which half of the two-list switch is showing: 0 the first, 1 the second.
                const second = isTodaySwitch ? todaySubTab === 'backlog' : hubSubTab === 'private';
                const setSecond = (on: boolean) => {
                  if (isTodaySwitch) onSetTodaySubTab?.(on ? 'backlog' : 'today');
                  else onSetHubSubTab?.(on ? 'private' : 'social');
                };
                const switchLabels = isTodaySwitch ? ['Today', 'Backlog'] : ['Public', 'Private'];
                const hubIconDot = isHubTab && !active && showHubNavDot;
                const hubStripPublicDot =
                  isHubTab && active && hubSubTab === 'private' && hubCommunityUnread > 0;
                const hubStripPrivateDot =
                  isHubTab && active && hubSubTab === 'social' && hubPrivateAttention;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (isTodaySwitch) {
                        setSecond(!second);
                      } else if (isHubTab && active) {
                        onToggleHubSubTab?.();
                      } else {
                        onNavigate(tab.id);
                      }
                    }}
                    onWheel={
                      switches
                        ? (e) => {
                            if (e.deltaY > 5) setSecond(true);
                            else if (e.deltaY < -5) setSecond(false);
                          }
                        : undefined
                    }
                    onTouchStart={
                      switches
                        ? (e) => {
                            switchTouchStartY.current = e.touches[0].clientY;
                          }
                        : undefined
                    }
                    onTouchEnd={
                      switches
                        ? (e) => {
                            if (switchTouchStartY.current === null) return;
                            const diff = e.changedTouches[0].clientY - switchTouchStartY.current;
                            if (diff < -12) setSecond(true);
                            else if (diff > 12) setSecond(false);
                            switchTouchStartY.current = null;
                          }
                        : undefined
                    }
                    aria-current={active ? 'page' : undefined}
                    aria-label={isTodaySwitch ? `Today, showing ${second ? 'Backlog' : 'Scheduled'}. Tap to switch` : undefined}
                    title={isTodaySwitch ? 'Scroll or tap to switch Today / Backlog' : isHubTab && active ? 'Scroll or tap to switch Public / Private' : undefined}
                    className={`tab-bar-item ${active ? 'is-active' : ''}`}
                  >
                    <span className="relative inline-flex shrink-0">
                      <Icon size={23} strokeWidth={active ? 2.3 : 1.9} />
                      {hubIconDot && (
                        <span
                          className="absolute -right-1 -top-0.5 size-[9px] rounded-full bg-error ring-2 ring-[var(--bg-surface)] pointer-events-none"
                          aria-hidden
                        />
                      )}
                    </span>
                    
                    {/* Rolling label on a tab with two lists (Hub, Today), static label for others */}
                    {switches ? (
                      <div className="h-[12px] overflow-hidden relative w-full">
                        <div
                          className="flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
                          style={{
                            transform: second ? 'translateY(-50%)' : 'translateY(0%)',
                          }}
                        >
                          <span className="h-[12px] flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                            {switchLabels[0]}
                          </span>
                          <span className="h-[12px] flex items-center justify-center text-[10px] font-semibold text-primary shrink-0">
                            {switchLabels[1]}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <span className="tab-bar-label">{tab.label}</span>
                    )}

                    {switches && (
                      <div
                        className="absolute right-2 top-3 bottom-3 w-[4px] pointer-events-none"
                        aria-hidden
                      >
                        {hubStripPublicDot && (
                          <span
                            className="absolute right-full top-[25%] mr-[3px] size-[5px] -translate-y-1/2 rounded-full bg-[var(--switch-on,var(--primary))] ring-[1.5px] ring-[var(--bg-surface)]"
                            aria-label="Public hub has unread"
                          />
                        )}
                        {hubStripPrivateDot && (
                          <span
                            className="absolute right-full top-[75%] mr-[3px] size-[5px] -translate-y-1/2 rounded-full bg-[var(--switch-on,var(--primary))] ring-[1.5px] ring-[var(--bg-surface)]"
                            aria-label="Private hub has activity"
                          />
                        )}
                        <div className="absolute inset-0 rounded-full bg-fill overflow-hidden">
                          <div
                            className="absolute left-0 right-0 h-1/2 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] p-[1px]"
                            style={{
                              transform: second ? 'translateY(100%)' : 'translateY(0%)',
                            }}
                          >
                            <div className="w-full h-full rounded-full bg-primary" />
                          </div>
                        </div>
                      </div>
                    )}

                    {tab.badge !== undefined && (
                      <span className={`tab-bar-badge ${tab.quietBadge ? 'is-quiet' : ''}`}>
                        {tab.badge > 99 ? '99+' : tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      {!batch && !paste && (
        <button
          type="button"
          onClick={() => {
            if (!adminHold.consumeClick()) onSettings();
          }}
          {...adminHold.handlers}
          className={`glass tab-bar-orb ${adminHold.holding ? 'is-admin-holding' : ''}`}
          title={onOpenAdminHub ? 'Settings · hold for Admin Hub' : 'Settings'}
          aria-label={showAdminBadge ? `Settings, ${adminPending} admin ${adminPending === 1 ? 'item' : 'items'} waiting` : 'Settings'}
        >
          <Settings size={24} strokeWidth={1.9} />
          {adminHold.holding && (
            <svg className="admin-hold-ring" viewBox="0 0 40 40" aria-hidden>
              <circle cx="20" cy="20" r="18" pathLength={100} />
            </svg>
          )}
          {showAdminBadge && (
            <span className="admin-orb-badge" aria-hidden>
              {adminPending > 9 ? '9+' : adminPending}
            </span>
          )}
          {syncAttention && (
            <span
              className="absolute right-3.5 top-3.5 size-2.5 rounded-full bg-warning ring-2 ring-[var(--bg-surface)]"
              aria-label="Sync needs review"
            />
          )}
        </button>
      )}
    </nav>
  );
}

/** The redesign, or the v7 CommandBar under Settings → Appearance → Classic look. */
export default function CommandBar(props: Props) {
  const [{ legacyStyle }] = useUiPrefs();
  return legacyStyle ? (
    <Suspense fallback={null}>
      <LegacyCommandBar {...props} />
    </Suspense>
  ) : (
    <ModernCommandBar {...props} />
  );
}
