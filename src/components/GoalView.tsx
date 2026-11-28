import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useUiPrefs } from '../hooks/useUiPrefs';
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleDot,
  Copy,
  FileText,
  Layers,
  ListTree,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Star,
  Target,
  Wand2,
} from 'lucide-react';
import type { GoalNode } from '../types';
import {
  countDirectChildren,
  countCompletedDirectChildren,
  findNode,
  formatDDMMYYYY,
  goalNodeRole,
  hasGoalExecutionState,
  isGoalEndpoint,
  isBacklogTask,
  isTaskComplete,
  localISODate,
  rollupPct,
  useStore,
  useSessionStore,
} from '../store';
import Overlay from './Overlay';
import { goalBranchContainsTask, nextOpenItem } from '../lib/goalTree';
import { daysBetweenLocalISO, deadlineDaysLabel, goalTimingLabel, todayISO } from '../lib/dates';
import ActivityRing from './ActivityRing';
import ClampedTitle from './ClampedTitle';
import OriginChip from './OriginChip';
import ExtraFocusLine from './ExtraFocusLine';
import { hapticTick } from '../lib/haptics';
import './goalCard.css';

const STEP_CHIPS_SHOWN = 8;

/** Touch screens select with a long press; native drag there lifts rows at the slightest movement. */
const coarsePointer = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(pointer: coarse)').matches);

function formatShortDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function getScheduledDateLabel(targetDate: string | null | undefined): string {
  if (!targetDate) return 'Scheduled';
  const today = localISODate(new Date());
  const tom = new Date();
  tom.setDate(tom.getDate() + 1);
  const tomStr = localISODate(tom);

  if (targetDate === today) return 'Today';
  if (targetDate === tomStr) return 'Tomorrow';
  return formatDDMMYYYY(targetDate);
}

function formatGoalDateRange(startDate: string | null | undefined, endDate: string | null | undefined): string {
  const format = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const start = startDate ?? endDate;
  const end = endDate ?? startDate;
  if (!start || !end) return '';

  const startParts = new Date(`${start}T00:00:00`);
  const endParts = new Date(`${end}T00:00:00`);
  if (start !== end && startParts.getFullYear() === endParts.getFullYear() && startParts.getMonth() === endParts.getMonth()) {
    return `${startParts.getDate()}–${format(end)}`;
  }
  return start === end ? format(start) : `${format(start)} – ${format(end)}`;
}

function findGoalInTree(id: string, nodes: GoalNode[]): GoalNode | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    const found = findGoalInTree(id, n.children);
    if (found) return found;
  }
  return undefined;
}

function findPath(root: GoalNode, ids: string[]): GoalNode[] {
  if (ids.length === 0) return [];
  if (root.id === ids[0]) {
    if (ids.length === 1) return [root];
    for (const child of root.children) {
      const sub = findPath(child, ids.slice(1));
      if (sub.length) return [root, ...sub];
    }
  }
  return [];
}

function collectPinned(root: GoalNode, acc: { node: GoalNode; path: GoalNode[] }[] = [], path: GoalNode[] = []): { node: GoalNode; path: GoalNode[] }[] {
  const cur = [...path, root];
  if (root.pinned) acc.push({ node: root, path: cur });
  for (const child of root.children) collectPinned(child, acc, cur);
  return acc;
}

interface Props {
  accent?: string;
  pathIds: string[];
  setPathIds: (ids: string[]) => void;
  highlightNodeId?: string | null;
  onAddChild: (parentId: string | null) => void;
  onEditNode: (node: GoalNode) => void;
  onPushNode: (node: GoalNode) => void;
  onUnplan: (taskId: string) => void;
  onCopy: (nodeId: string) => void;
  onCopyMany: (nodeIds: string[]) => void;
  onDeleteMany: (nodeIds: string[]) => void;
  /** Called whenever selection changes — passes selected IDs and schedulable work-item IDs. */
  onSelectionChange: (selectedIds: string[], workItemIds: string[]) => void;
  /** Ref App provides — GoalView stores its clearSelection fn here so App can call it */
  clearSelectionRef: React.MutableRefObject<() => void>;
  /** Optional direct navigation handler for recording jump origin for 1-step back navigation */
  onNavigateToPath?: (pathIds: string[]) => void;
  onOpenStudio: () => void;
  onOpenDescription?: (title: string, description: string, steps?: { label: string; done: boolean }[]) => void;
}

function nodeMeta(node: GoalNode): { icon: typeof Target; tint: string; label: string } {
  const role = goalNodeRole(node);
  if (role === 'Goal') return { icon: Target, tint: 'var(--primary)', label: role };
  if (role === 'Branch') return { icon: Layers, tint: 'var(--text-secondary)', label: role };
  return { icon: CircleDot, tint: 'var(--text-muted)', label: role };
}

export default function GoalView({ pathIds, setPathIds, highlightNodeId, onAddChild, onEditNode, onPushNode, onUnplan, onCopy, onSelectionChange, clearSelectionRef, onNavigateToPath, onOpenStudio, onOpenDescription }: Props) {
  const { goals, tasks, toggleGoalStep, togglePin, reorderGoalNodes, toggleNodeCompletion } = useStore();
  // Long step lists stay tidy: the first few chips, then "+N more".
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => new Set());
  const [{ legacyStyle }] = useUiPrefs();
  const { activeSession } = useSessionStore();
  const runningTask = tasks.find((task) => task.id === activeSession?.taskId);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pressingId, setPressingId] = useState<string | null>(null);
  const [dragIds, setDragIds] = useState<string[]>([]);
  const [overId, setOverId] = useState<string | null>(null);
  const [pathMapOpen, setPathMapOpen] = useState(false);
  const [parentDescriptionExpanded, setParentDescriptionExpanded] = useState(false);
  const siblingStripRef = useRef<HTMLDivElement>(null);
  const pendingSiblingScrollRef = useRef<number | null>(null);

  const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressTriggeredRef = useRef(false);
  // A long press selects. Android sends no click after it, so the "skip the
  // click after a long press" window must expire on its own, or it would eat
  // the next tap.
  const suppressClickUntilRef = useRef(0);

  const stepsOf = (node: GoalNode) => node.steps?.map((label, i) => ({ label, done: Boolean(node.stepDone?.[i]) }));
  /** The "…" on a cut title opens the full name, description and steps. */
  const showFullText = onOpenDescription
    ? (node: GoalNode) => () => onOpenDescription(node.title, node.description ?? '', stepsOf(node))
    : () => undefined;
  const pressHighlightRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressTimeoutRef.current) {
      clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
    if (pressHighlightRef.current) {
      clearTimeout(pressHighlightRef.current);
      pressHighlightRef.current = null;
    }
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      suppressClickUntilRef.current = performance.now() + 450;
    }
    pointerStartRef.current = null;
    setPressingId(null);
  };

  // Reordering by touch. Rows are not native drag items on touch screens (they
  // lifted at the slightest movement), so a hold arms a drag instead: after the
  // long press, moving the same finger carries the row (or the selected rows)
  // and lifting it drops them where the outline shows. The page doesn't scroll
  // while a drag is armed; a quick swipe still scrolls as before.
  const touchDragRef = useRef<{ ids: string[]; startY: number; active: boolean; overId: string | null } | null>(null);
  const autoScrollRef = useRef<{ frame: number; speed: number; el: HTMLElement | null }>({ frame: 0, speed: 0, el: null });

  const stopAutoScroll = () => {
    cancelAnimationFrame(autoScrollRef.current.frame);
    autoScrollRef.current = { frame: 0, speed: 0, el: null };
  };

  const scrollParentOf = (el: HTMLElement | null): HTMLElement => {
    for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return (document.scrollingElement as HTMLElement) ?? document.documentElement;
  };

  const armTouchDrag = (ids: string[], startY: number) => {
    touchDragRef.current = { ids, startY, active: false, overId: null };
  };

  const endTouchDrag = (drop: boolean) => {
    const drag = touchDragRef.current;
    touchDragRef.current = null;
    stopAutoScroll();
    if (!drag?.active) return;
    if (drop && drag.overId && !drag.ids.includes(drag.overId)) {
      reorderGoalNodes(current ? current.id : null, drag.ids, drag.overId);
    }
    setDragIds([]);
    setOverId(null);
    // The long press selected the rows only to carry them; the move is done.
    setSelected(new Set());
    onSelectionChange([], []);
  };

  useEffect(() => {
    // While a drag is armed, the finger moves the rows, not the page.
    const blockScroll = (event: TouchEvent) => {
      if (touchDragRef.current && event.cancelable) event.preventDefault();
    };
    document.addEventListener('touchmove', blockScroll, { passive: false });
    return () => {
      document.removeEventListener('touchmove', blockScroll);
      cancelAnimationFrame(autoScrollRef.current.frame);
    };
  }, []);

  const handleNodePointerDown = (nodeId: string, e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, input, a')) return;
    const touch = e.pointerType !== 'mouse';
    const startY = e.clientY;

    if (selected.size > 0) {
      // With rows selected, a tap still selects or clears; holding a selected
      // row and moving carries the whole selection.
      if (!touch || !selected.has(nodeId)) return;
      clearLongPress();
      pointerStartRef.current = { x: e.clientX, y: e.clientY };
      const ids = Array.from(selected);
      longPressTimeoutRef.current = setTimeout(() => {
        longPressTimeoutRef.current = null;
        isLongPressTriggeredRef.current = true;
        hapticTick();
        armTouchDrag(ids, startY);
      }, 380);
      return;
    }

    clearLongPress();
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    // Only a finger that stays shows the press, so starting a scroll doesn't flash rows.
    pressHighlightRef.current = setTimeout(() => setPressingId(nodeId), 110);

    longPressTimeoutRef.current = setTimeout(() => {
      longPressTimeoutRef.current = null;
      isLongPressTriggeredRef.current = true;
      hapticTick();
      toggleSelect(nodeId);
      if (touch) armTouchDrag([nodeId], startY);
    }, 380);
  };

  const handleNodePointerMove = (e: React.PointerEvent) => {
    const drag = touchDragRef.current;
    if (drag) {
      if (!drag.active) {
        if (Math.abs(e.clientY - drag.startY) < 6) return;
        drag.active = true;
        setPressingId(null);
        setDragIds(drag.ids);
      }
      const row = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)?.closest<HTMLElement>('[data-goal-row]');
      const id = row?.dataset.goalRow ?? null;
      if (id !== drag.overId) {
        drag.overId = id;
        setOverId(id && !drag.ids.includes(id) ? id : null);
      }
      // Near the top or bottom of the screen, the list scrolls so a row can travel far.
      const edge = 110;
      const speed = e.clientY < edge ? -Math.ceil((edge - e.clientY) / 10) : e.clientY > window.innerHeight - edge ? Math.ceil((e.clientY - (window.innerHeight - edge)) / 10) : 0;
      autoScrollRef.current.speed = speed;
      if (speed && !autoScrollRef.current.frame) {
        autoScrollRef.current.el = scrollParentOf(e.currentTarget as HTMLElement);
        const step = () => {
          const auto = autoScrollRef.current;
          if (!auto.speed || !auto.el || !touchDragRef.current) {
            auto.frame = 0;
            return;
          }
          auto.el.scrollTop += auto.speed;
          auto.frame = requestAnimationFrame(step);
        };
        autoScrollRef.current.frame = requestAnimationFrame(step);
      }
      return;
    }
    if (!pointerStartRef.current || !longPressTimeoutRef.current) return;
    const dist = Math.hypot(e.clientX - pointerStartRef.current.x, e.clientY - pointerStartRef.current.y);
    if (dist > 10) {
      clearLongPress();
    }
  };

  const handleNodePointerUp = () => {
    endTouchDrag(true);
    clearLongPress();
  };

  const handleNodePointerCancel = () => {
    endTouchDrag(false);
    clearLongPress();
  };

  // Register clearSelection so App can call it when batch actions complete
  useEffect(() => {
    clearSelectionRef.current = () => {
      setSelected(new Set());
      onSelectionChange([], []);
    };
  }, [clearSelectionRef, onSelectionChange]);

  useEffect(() => {
    setPathMapOpen(false);
    setParentDescriptionExpanded(false);
  }, [pathIds]);

  const current = useMemo(() => {
    if (pathIds.length === 0) return null;
    for (const root of goals) {
      const [found] = findNode(root, pathIds[pathIds.length - 1]);
      if (found) return found;
    }
    return null;
  }, [goals, pathIds]);

  const path = useMemo(() => {
    for (const root of goals) {
      const chain = findPath(root, pathIds);
      if (chain.length) return chain;
    }
    return [];
  }, [goals, pathIds]);

  const pinned = useMemo(() => {
    const acc: { node: GoalNode; path: GoalNode[] }[] = [];
    for (const root of goals) collectPinned(root, acc, []);
    return acc;
  }, [goals]);

  const children = current ? current.children : goals;

  const siblings = useMemo(() => {
    if (pathIds.length === 0) return [];
    if (pathIds.length === 1) return goals;
    const parent = path[path.length - 2];
    return parent?.children ?? [];
  }, [goals, path, pathIds.length]);

  const collapsedTrail = useMemo(() => {
    if (path.length === 0) return '';
    const ancestors = path.slice(0, -1);
    if (ancestors.length === 0) return 'All Goals';
    if (ancestors.length === 1) return ancestors[0].title;
    if (ancestors.length === 2) return `${ancestors[0].title} › ${ancestors[1].title}`;
    return `${ancestors[0].title} › … › ${ancestors[ancestors.length - 1].title}`;
  }, [path]);

  // Auto-scroll & center target node ONCE when explicitly jumped to via highlightNodeId
  const scrolledHighlightRef = useState<{ id: string | null }>({ id: null })[0];

  useEffect(() => {
    // Only scroll if explicit highlightNodeId is passed AND we haven't already scrolled to it
    if (!highlightNodeId || scrolledHighlightRef.id === highlightNodeId) return;

    scrolledHighlightRef.id = highlightNodeId;
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById(`goal-node-${highlightNodeId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(interval);
      } else if (attempts >= 15) {
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [highlightNodeId, scrolledHighlightRef]);


  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      // Notify parent of selection change
      const allIds = [...next];
      const workItemIds = allIds.filter((itemId) => {
        const n = findGoalInTree(itemId, children);
        return n && n.children.length === 0;
      });
      onSelectionChange(allIds, workItemIds);
      return next;
    });

  const drillInto = (node: GoalNode) => {
    setPathIds([...pathIds, node.id]);
    setSelected(new Set());
    onSelectionChange([], []);
  };

  const goTo = (index: number) => {
    setPathIds(pathIds.slice(0, index + 1));
    setSelected(new Set());
    onSelectionChange([], []);
  };

  const goRoot = () => {
    setPathIds([]);
    setSelected(new Set());
    onSelectionChange([], []);
    setPathMapOpen(false);
  };

  const goUp = () => {
    if (pathIds.length === 0) return;
    setPathIds(pathIds.slice(0, -1));
    setSelected(new Set());
    onSelectionChange([], []);
  };

  const jumpToPathIndex = (index: number) => {
    if (index < 0) goRoot();
    else goTo(index);
    setPathMapOpen(false);
  };

  const jumpToSibling = (node: GoalNode) => {
    if (node.id === current?.id) return;
    pendingSiblingScrollRef.current = siblingStripRef.current?.scrollLeft ?? null;
    setPathIds([...pathIds.slice(0, -1), node.id]);
    setSelected(new Set());
    onSelectionChange([], []);
  };

  useLayoutEffect(() => {
    const strip = siblingStripRef.current;
    if (!strip || !current) return;
    const preservedLeft = pendingSiblingScrollRef.current;
    pendingSiblingScrollRef.current = null;
    if (preservedLeft != null) {
      strip.scrollLeft = preservedLeft;
      return;
    }

    const active = strip.querySelector<HTMLElement>(`[data-sibling-id="${CSS.escape(current.id)}"]`);
    if (!active) return;
    const stripRect = strip.getBoundingClientRect();
    const activeRect = active.getBoundingClientRect();
    if (activeRect.left < stripRect.left) {
      strip.scrollLeft -= stripRect.left - activeRect.left + 8;
    } else if (activeRect.right > stripRect.right) {
      strip.scrollLeft += activeRect.right - stripRect.right + 8;
    }
  }, [current, siblings]);

  const jumpToPinned = (p: { node: GoalNode; path: GoalNode[] }) => {
    // Groups open directly; endpoints open at their parent so they remain visible in context.
    const targetIds =
      p.node.children.length > 0
        ? p.path.map((n) => n.id)
        : p.path.slice(0, -1).map((n) => n.id);

    if (onNavigateToPath) {
      onNavigateToPath(targetIds);
    } else {
      setPathIds(targetIds);
    }
    setSelected(new Set());
    onSelectionChange([], []);
  };

  return (
    <div className="fade-in pb-20">
      <div className="sticky top-0 z-30 no-swipe mb-3.5 pt-1.5 pb-2 bg-base space-y-2 shadow-[0_10px_18px_-18px_rgba(0,0,0,0.9)]">
        <nav
          aria-label="Goal location"
          className="flex items-center gap-1 rounded-[12px] border border-subtle bg-surface p-1"
        >
          {path.length > 0 ? (
            <button
              type="button"
              onClick={goUp}
              className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-content-secondary hover:bg-elevated hover:text-content-primary"
              aria-label="Go to parent"
              title="Up one level"
            >
              <ChevronLeft size={18} strokeWidth={2.25} />
            </button>
          ) : (
            <div className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-primary bg-primary-soft">
              <Target size={15} strokeWidth={2.25} />
            </div>
          )}

          <button
            type="button"
            onClick={() => path.length > 0 && setPathMapOpen(true)}
            disabled={path.length === 0}
            className={`flex-1 min-w-0 text-left px-1.5 py-1 rounded-lg ${
              path.length > 0 ? 'hover:bg-elevated' : ''
            }`}
            title={path.length > 0 ? 'Open path map' : undefined}
          >
            <p className="text-[13px] font-bold text-content-primary truncate leading-tight">
              {current?.title ?? 'Goals'}
            </p>
            {path.length > 0 && (
              <p className="mt-0.5 text-[10px] font-medium text-content-muted truncate leading-tight">
                {collapsedTrail}
              </p>
            )}
          </button>

          {path.length > 0 && (
            <button
              type="button"
              onClick={() => setPathMapOpen(true)}
              className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-primary bg-primary-soft hover:opacity-90"
              aria-label="Open path map"
              title="Jump to any level"
            >
              <ListTree size={15} strokeWidth={2.25} />
            </button>
          )}
          <button
            type="button"
            onClick={onOpenStudio}
            className="shrink-0 w-9 h-9 grid place-items-center rounded-lg text-primary bg-primary-soft hover:opacity-90"
            aria-label="Open Blueprint Studio"
            title="Blueprint Studio"
          >
            <Wand2 size={15} strokeWidth={2.25} />
          </button>
        </nav>

        {siblings.length > 1 && current && (
          <div className="rounded-[14px] border border-subtle bg-surface shadow-card px-2 py-2">
            <div ref={siblingStripRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar" aria-label="Sibling branches">
              <span className="shrink-0 pl-1 text-[9px] font-bold uppercase tracking-[0.14em] text-content-muted">Branches</span>
              <span className="h-4 w-px shrink-0 bg-border-subtle" aria-hidden />
            {siblings.map((node) => {
              const here = node.id === current.id;
              return (
                <button
                  key={node.id}
                  data-sibling-id={node.id}
                  type="button"
                  onClick={() => jumpToSibling(node)}
                  title={node.title}
                  className={`shrink-0 max-w-[9.5rem] h-8 px-3 rounded-[10px] text-[11px] font-semibold truncate border transition-all ${
                    here
                      ? 'bg-primary-soft text-primary border-primary/30 shadow-[inset_0_0_0_1px_rgba(196,165,116,0.08)]'
                      : 'bg-elevated/60 text-content-secondary border-subtle hover:text-content-primary hover:bg-elevated'
                  }`}
                >
                  {node.title}
                </button>
              );
            })}
            </div>
          </div>
        )}
      </div>

      <Overlay open={pathMapOpen} onClose={() => setPathMapOpen(false)} align="bottom">
        <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] flex flex-col gap-3">
          {/* Grab Handle */}
          <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto -mt-1 mb-1 opacity-70 shrink-0" />

          {/* Header */}
          <div className="px-1 shrink-0">
            <h3 className="text-[14px] font-bold text-content-primary">Jump to a level</h3>
            <p className="text-[11px] font-medium text-content-muted mt-0.5">Where you are</p>
          </div>

          <div className="bg-surface rounded-2xl border border-subtle overflow-hidden divide-y divide-subtle max-h-[55vh] overflow-y-auto no-scrollbar shadow-sm">
            <button
              type="button"
              onClick={() => jumpToPathIndex(-1)}
              className="w-full flex items-center gap-2.5 px-3.5 h-12 text-left hover:bg-elevated transition-colors"
            >
              <Target size={15} className="text-primary shrink-0" />
              <span className="text-[13px] font-semibold text-content-primary">All Goals</span>
            </button>
            {path.map((n, i) => {
              const meta = nodeMeta(n);
              const MetaIcon = meta.icon;
              const isHere = i === path.length - 1;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => jumpToPathIndex(i)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 min-h-[48px] text-left hover:bg-elevated transition-colors ${
                    isHere ? 'bg-primary-soft/50' : ''
                  }`}
                  style={{ paddingLeft: `${14 + Math.min(i + 1, 5) * 12}px` }}
                >
                  <MetaIcon size={15} style={{ color: meta.tint }} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-semibold truncate ${isHere ? 'text-primary' : 'text-content-primary'}`}>
                      {n.title}
                    </span>
                    <span className="block text-[10px] text-content-muted">{meta.label}</span>
                  </span>
                  {isHere && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">Here</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </Overlay>

      {/* Pinned/Favorites section */}
      {pinned.length > 0 && pathIds.length === 0 && (
        <>
          <section className="mb-4">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Star size={12} className="fill-primary text-primary" />
                Pinned
              </div>
              <span className="text-[11px] font-medium tabular-nums text-content-muted">{pinned.length}</span>
            </div>
            <div className="bg-surface rounded-[12px] border border-subtle overflow-hidden">
              {pinned.map((p, i) => {
                const meta = nodeMeta(p.node);
                const Icon = meta.icon;
                const ancestors = p.path.slice(0, -1);
                const badgeNodes = ancestors.slice(0, Math.min(2, ancestors.length));
                const contextNodes = ancestors.slice(badgeNodes.length);
                const pathLabel = ancestors.map((n) => n.title).join(' / ') || 'Root goal';
                const pPct = rollupPct(p.node);
                return (
                  <button
                    key={p.node.id}
                    onClick={() => jumpToPinned(p)}
                    title={pathLabel}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-elevated ${
                      i < pinned.length - 1 ? 'border-b border-subtle' : ''
                    }`}
                  >
                    <Icon size={15} style={{ color: meta.tint }} className="mt-1 shrink-0" />
                    <div className="flex-1 min-w-0">
                      {badgeNodes.length > 0 && (
                        <div className="mb-1.5">
                          <OriginChip names={badgeNodes.map((node) => node.title)} />
                        </div>
                      )}
                      <div className="text-[13.5px] font-semibold leading-snug text-content-primary break-words">{p.node.title}</div>
                      <div className="mt-0.5 truncate text-[11px] leading-relaxed text-content-muted">
                        {contextNodes.length > 0 ? contextNodes.map((node) => node.title).join(' / ') : badgeNodes.length === 0 ? pathLabel : meta.label}
                      </div>
                    </div>
                    <span
                      className={`text-[12px] font-semibold tabular-nums shrink-0 ${
                        pPct >= 100 ? 'text-secondary' : pPct > 0 ? 'text-primary' : 'text-content-muted'
                      }`}
                    >
                      {pPct}%
                    </span>
                    <ChevronRight size={15} className="text-content-muted shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>

          {/* Partition Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[10px] font-semibold uppercase tracking-widest text-content-muted">
              All Goals
            </span>
            <div className="h-px flex-1 bg-border/60" />
          </div>
        </>
      )}

      {/* Current node header card */}
      {current && (
        <div className="bg-surface border border-subtle rounded-[16px] shadow-card p-4 mb-3.5 fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {(() => {
                const meta = nodeMeta(current);
                const Icon = meta.icon;
                return (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: meta.tint }}>
                    <Icon size={13} className="shrink-0" />
                    {meta.label}
                  </div>
                );
              })()}
              <ClampedTitle as="h2" className="goal-head-title mt-1 text-[19px] font-bold tracking-[-0.02em] text-content-primary" text={current.title} onMore={showFullText(current)} />
            </div>
            <div className="flex items-center gap-0.5 shrink-0 -mt-1">
              {(() => {
                const parentPct = rollupPct(current);
                const isParentDone = parentPct >= 100;
                return (
                  <span
                    className={`mr-1 text-base font-bold tabular-nums px-0.5 ${
                      isParentDone ? 'text-secondary' : parentPct > 0 ? 'text-primary' : 'text-content-muted'
                    }`}
                  >
                    {parentPct}%
                  </span>
                );
              })()}
              <button
                onClick={() => togglePin(current.id)}
                className={`p-2 rounded-lg ${current.pinned ? 'text-primary bg-primary-soft' : 'text-content-secondary hover:text-primary'}`}
                title={current.pinned ? 'Unpin' : 'Pin to favorites'}
              >
                {current.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button onClick={() => onEditNode(current)} className="p-2 rounded-lg text-content-secondary hover:text-primary-glow hover:bg-primary-soft transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-content-secondary">
            <span className="shrink-0 whitespace-nowrap tabular-nums font-medium">
              {countCompletedDirectChildren(current)} of {countDirectChildren(current)}{' '}
              {current.children.length > 0
                ? current.children.every(isGoalEndpoint) ? 'tasks' : 'branches'
                : (current.steps?.length ?? 0) > 0 ? 'steps' : 'task'} complete
            </span>
            {(current.startDate || current.endDate) && (
              <span className="inline-flex items-center gap-1 tabular-nums text-content-muted">
                <CalendarDays size={11} />
                {formatGoalDateRange(current.startDate, current.endDate)}
              </span>
            )}
            {(() => {
              const timing = goalTimingLabel(current.startDate, current.endDate);
              if (!timing) return null;
              const colorClass = timing.status === 'overdue'
                ? 'text-error'
                : timing.status === 'due'
                  ? 'text-primary'
                  : 'text-secondary';
              return (
                <span className={`${colorClass} font-bold`}>
                  {timing.label}
                </span>
              );
            })()}
          </div>

          <div className="mt-2.5 h-1.5 rounded-full bg-border-subtle overflow-hidden">
            {(() => {
              const parentPct = rollupPct(current);
              const isParentDone = parentPct >= 100;
              return (
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${parentPct}%`,
                    background: isParentDone ? 'var(--secondary)' : 'var(--primary)',
                  }}
                />
              );
            })()}
          </div>

          {goals.some((g) => g.id === current.id) && <ExtraFocusLine goalId={current.id} />}

          {current.description && (
            <div className="mt-3 pt-3 border-t border-subtle">
              <p className={`text-[12px] leading-relaxed text-content-secondary whitespace-pre-wrap ${parentDescriptionExpanded ? '' : 'line-clamp-2'}`}>
                {current.description}
              </p>
              {current.description.length > 110 && (
                <button
                  type="button"
                  onClick={() => setParentDescriptionExpanded((value) => !value)}
                  className="mt-1.5 inline-flex items-center gap-1 text-[10.5px] font-semibold text-primary"
                >
                  {parentDescriptionExpanded ? <>Show less <ChevronUp size={12} /></> : <>Read more <ChevronDown size={12} /></>}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* First-use Studio invitation */}
      {goals.length === 0 && pathIds.length === 0 && (
        <section className="relative overflow-hidden rounded-[16px] border border-primary/20 bg-elevated p-3.5 shadow-card mb-3">
          <div className="absolute -right-8 -top-10 w-24 h-24 rounded-full bg-primary/10 blur-2xl pointer-events-none" />
          <button type="button" onClick={onOpenStudio} className="relative w-full min-h-[58px] flex items-center gap-3 text-left active:scale-[0.99]">
            <span className="w-10 h-10 rounded-[12px] grid place-items-center bg-primary-soft text-primary border border-primary/20 shrink-0">
              <Wand2 size={18} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-bold tracking-[-0.01em] text-content-primary">Build with Blueprint Studio</span>
              <span className="block mt-1 text-[11.5px] leading-snug text-content-secondary">Build several branches freely, then review and save once.</span>
            </span>
            <span className="w-8 h-8 rounded-full grid place-items-center bg-primary text-on-primary shrink-0">
              <ChevronRight size={15} />
            </span>
          </button>
        </section>
      )}

      {/* Children list */}
      {children.length > 0 && <div className="bg-surface rounded-[12px] border border-subtle overflow-hidden">
        {children.map((child, index) => {
          // Empty untouched items can still be opened and expanded. Once work exists,
          // the endpoint stays an executable item so scheduling/history remain clear.
          const canDrill = child.kind === 'goal' || child.children.length > 0 || !hasGoalExecutionState(child);
          const isEndpoint = child.children.length === 0;
          const isWorkItem = isEndpoint && child.kind !== 'goal';
          const hasSteps = !!child.steps && child.steps.length > 0;
          const stepDone = child.stepDone ?? [];
          const pct = isEndpoint && hasSteps ? Math.round((stepDone.filter(Boolean).length / child.steps!.length) * 100) : rollupPct(child);
          const isSelected = selected.has(child.id);
          const isDone = child.completed || pct === 100;
          const linkedTask = child.todayTaskId ? tasks.find((t) => t.id === child.todayTaskId) : null;
          const isBacklogged = linkedTask ? isBacklogTask(linkedTask) : false;
          // Completed today-slices stay on the calendar, but Goals should offer Schedule
          // for remaining micro-steps — not look like open work for today.
          const isActivelyScheduled = !!linkedTask && !isBacklogged && !isTaskComplete(linkedTask);
          const nextItem = isEndpoint ? null : nextOpenItem(child);
          const showActions = isWorkItem && !isDone && selected.size === 0;
          const locked = !!runningTask && goalBranchContainsTask(child, runningTask);
          const daysLeft = child.endDate ? daysBetweenLocalISO(todayISO(), child.endDate) : null;
          // Start-aware, like the header: a branch that hasn't started reads "X days to start".
          const timing = goalTimingLabel(child.startDate, child.endDate);
          const dueTone = daysLeft === null ? 'none' : timing?.status === 'upcoming' ? 'ok' : daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'soon' : 'ok';

          const isHighlighted = child.id === highlightNodeId;
          const isLast = index === children.length - 1;

          return (
            <div
              key={child.id}
              id={`goal-node-${child.id}`}
              role={canDrill || selected.size > 0 ? 'button' : undefined}
              tabIndex={canDrill || selected.size > 0 ? 0 : undefined}
              data-goal-row={child.id}
              draggable={!coarsePointer}
              onContextMenu={coarsePointer ? (e) => e.preventDefault() : undefined}
              onPointerDown={(e) => handleNodePointerDown(child.id, e)}
              onPointerMove={handleNodePointerMove}
              onPointerUp={handleNodePointerUp}
              onPointerCancel={handleNodePointerCancel}
              onDragStart={(e) => {
                clearLongPress();
                const idsToDrag = selected.has(child.id) ? Array.from(selected) : [child.id];
                e.dataTransfer.setData('text/plain', child.id);
                setDragIds(idsToDrag);
              }}
              onDragEnter={() => setOverId(child.id)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => {
                if (dragIds.length > 0 && overId && !dragIds.includes(overId)) {
                  reorderGoalNodes(current ? current.id : null, dragIds, overId);
                }
                setDragIds([]);
                setOverId(null);
              }}
              onClick={() => {
                if (isLongPressTriggeredRef.current || performance.now() < suppressClickUntilRef.current) {
                  isLongPressTriggeredRef.current = false;
                  suppressClickUntilRef.current = 0;
                  return;
                }
                if (selected.size > 0) {
                  toggleSelect(child.id);
                  return;
                }
                if (canDrill) drillInto(child);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  if (selected.size > 0) {
                    toggleSelect(child.id);
                  } else if (canDrill) {
                    drillInto(child);
                  }
                }
              }}
              className={`goal-row bg-surface select-none transition-transform duration-200 ease-out ${
                canDrill || selected.size > 0 ? 'cursor-pointer' : ''
              } ${
                pressingId === child.id ? 'transform scale-[0.97] bg-elevated' : ''
              } ${
                !isLast ? 'border-b border-[color:var(--separator)]' : ''
              } ${
                isHighlighted
                  ? 'bg-primary-soft'
                  : isSelected
                    ? 'is-selected'
                    : 'hover:bg-elevated'
              } ${overId === child.id && !dragIds.includes(child.id) ? 'ring-2 ring-primary z-10' : ''} ${
                dragIds.includes(child.id) ? 'opacity-60' : ''
              }`}
            >
              {selected.size > 0 && (
                <input
                  type="checkbox"
                  checked={isSelected}
                  onClick={(e) => e.stopPropagation()}
                  onChange={() => toggleSelect(child.id)}
                  className="mt-[9px] w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                  title="Select for batch operations"
                />
              )}

              {/* The leading mark says what the card is. A branch shows its
                  progress once, as the number in its ring. A task's circle is
                  its done button (like Reminders); the arc fills as steps
                  get done. */}
              {isWorkItem ? (
                <button
                  type="button"
                  className="goal-mark is-task"
                  data-state={isDone ? 'done' : pct > 0 ? 'active' : 'idle'}
                  disabled={locked || selected.size > 0}
                  aria-pressed={isDone}
                  aria-label={isDone ? `Mark ${child.title} as not done` : `Mark ${child.title} as done`}
                  title={locked ? 'Save progress from the running sitting first' : isDone ? 'Mark as not done' : 'Mark as done'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleNodeCompletion(child.id);
                  }}
                >
                  {isDone ? <Check size={17} strokeWidth={3} /> : <ActivityRing progress={pct} size={34} stroke={2.5} />}
                </button>
              ) : (
                <span className="goal-mark-col" role="img" aria-label={isDone ? 'Complete' : `${pct}% complete`}>
                  <span className="goal-mark is-branch" data-state={isDone ? 'done' : pct > 0 ? 'active' : 'idle'}>
                    {isDone ? (
                      <Check size={17} strokeWidth={3} />
                    ) : (
                      <>
                        <ActivityRing progress={pct} size={34} stroke={3} />
                        <Layers size={14} className="goal-mark-icon" />
                      </>
                    )}
                  </span>
                  {!isDone && <span className="goal-mark-pct">{pct}%</span>}
                </span>
              )}

              <div className="goal-row-body">
                <div className="goal-row-head">
                  <ClampedTitle className={`goal-row-title ${isDone ? 'is-done' : ''}`} text={child.title} onMore={showFullText(child)} />
                  {child.description && onOpenDescription && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDescription(child.title, child.description ?? '', stepsOf(child));
                      }}
                      className="goal-row-inline-icon hover:text-primary"
                      title="View description"
                      aria-label={`View description for ${child.title}`}
                    >
                      <FileText size={13} />
                    </button>
                  )}
                  {child.pinned && <Star size={13} className="goal-row-inline-icon fill-primary text-primary" aria-label="Pinned" />}
                  {showActions && (
                    <div className="goal-row-actions">
                      {isActivelyScheduled ? (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPushNode(child);
                            }}
                            className="goal-row-btn"
                            title="Replan"
                          >
                            Replan
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (child.todayTaskId) onUnplan(child.todayTaskId);
                            }}
                            className="goal-row-btn is-danger"
                            title="Unschedule"
                          >
                            Unplan
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onPushNode(child);
                          }}
                          className="goal-row-btn is-primary"
                          title={isBacklogged ? 'Plan this backlogged task' : 'Plan this task'}
                        >
                          Plan
                        </button>
                      )}
                    </div>
                  )}
                  {!isWorkItem && child.endDate && !isDone ? (
                    <span className="goal-row-status" data-tone={dueTone} title={`Due ${formatShortDate(child.endDate)}`}>
                      {timing?.label ?? deadlineDaysLabel(child.endDate)}
                    </span>
                  ) : null}
                  {canDrill && !showActions && (
                    <ChevronRight size={18} className="goal-row-chevron" aria-hidden />
                  )}
                </div>

                {!isWorkItem && (
                  <p className="goal-row-detail">
                    {isDone ? (
                      'All done'
                    ) : nextItem ? (
                      <>
                        <span className="text-content-muted">Next </span>
                        {nextItem.title}
                      </>
                    ) : isEndpoint ? (
                      'Empty · tap to add the first item'
                    ) : null}
                  </p>
                )}
                {isWorkItem && child.endDate && !isDone && (
                  <p className="goal-row-detail" data-tone={dueTone}>
                    Due {formatShortDate(child.endDate)} · {timing?.label ?? deadlineDaysLabel(child.endDate)}
                  </p>
                )}

                {isWorkItem && hasSteps && (
                  <div className="goal-row-line">
                    <div className="goal-row-steps">
                      {child.steps!.slice(0, expandedSteps.has(child.id) ? undefined : STEP_CHIPS_SHOWN).map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          disabled={selected.size > 0 || locked}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleGoalStep(child.id, i);
                          }}
                          className="goal-row-step"
                          data-done={Boolean(stepDone[i])}
                          title={locked ? 'Save progress from the running sitting first' : s}
                        >
                          {s}
                        </button>
                      ))}
                      {child.steps!.length > STEP_CHIPS_SHOWN && (
                        <button
                          type="button"
                          className="goal-row-step goal-row-step-more"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedSteps((prev) => {
                              const next = new Set(prev);
                              if (next.has(child.id)) next.delete(child.id); else next.add(child.id);
                              return next;
                            });
                          }}
                        >
                          {expandedSteps.has(child.id) ? 'Show less' : `+${child.steps!.length - STEP_CHIPS_SHOWN} more`}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {selected.size === 0 ? (
                  <div className="goal-row-footer">
                    <div className="goal-row-footer-main">
                      {!isWorkItem ? (
                        <span className="goal-row-meta">
                          {countCompletedDirectChildren(child)} of {countDirectChildren(child)} done
                        </span>
                      ) : isDone ? (
                        <span className="goal-row-meta" data-tone="done">Completed</span>
                      ) : (
                        <span className="goal-row-meta">
                          {isActivelyScheduled ? (
                            <span
                              data-tone="plan"
                              title={`Planned for ${linkedTask?.targetDate ? formatDDMMYYYY(linkedTask.targetDate) : ''}`}
                            >
                              {getScheduledDateLabel(linkedTask?.targetDate)} ·{' '}
                            </span>
                          ) : isBacklogged ? (
                            <span data-tone="backlog">Backlog · </span>
                          ) : null}
                          {hasSteps ? `${stepDone.filter(Boolean).length} of ${child.steps!.length} steps` : 'No steps'}
                        </span>
                      )}
                    </div>
                    <div className="goal-row-tools">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          togglePin(child.id);
                        }}
                        className={child.pinned ? 'is-on' : ''}
                        title={child.pinned ? 'Unpin' : 'Pin'}
                        aria-label={child.pinned ? 'Unpin' : 'Pin'}
                      >
                        <Pin size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditNode(child);
                        }}
                        title="Edit"
                        aria-label="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCopy(child.id);
                        }}
                        title="Copy"
                        aria-label="Copy"
                      >
                        <Copy size={15} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="goal-row-footer">
                    <span className={isSelected ? 'goal-row-meta text-primary font-semibold' : 'goal-row-meta'}>
                      {isSelected ? '✓ Selected' : 'Tap to select'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>}

      <button
        onClick={() => onAddChild(current?.id ?? null)}
        className={legacyStyle
          ? 'mt-4 w-full px-4 py-3 rounded-2xl text-sm font-medium text-content-secondary bg-surface border border-dashed border-subtle hover:border-content-muted hover:text-content-primary transition-colors flex items-center justify-center gap-1.5'
          : 'mt-4 w-full h-[50px] px-4 rounded-2xl text-[17px] font-semibold text-primary bg-surface shadow-card active:opacity-70 transition-opacity flex items-center justify-center gap-1.5'}
      >
        {legacyStyle ? <Plus size={15} className="shrink-0" /> : <Plus size={20} strokeWidth={2.4} className="shrink-0" />}
        <span className="min-w-0 truncate">{current ? `Add to ${current.title}` : 'Create Goal'}</span>
      </button>

    </div>
  );
}
