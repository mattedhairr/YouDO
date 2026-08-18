import { useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Copy,
  FileText,
  Flag,
  Layers,
  ListTree,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Star,
  Target,
  X,
} from 'lucide-react';
import type { GoalKind, GoalNode } from '../types';
import { countDirectChildren, countCompletedDirectChildren, findNode, formatDDMMYYYY, isBacklogTask, localISODate, rollupPct, useStore } from '../store';
import Overlay from './Overlay';

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
  onAddChild: (parentId: string | null, parentKind?: GoalKind) => void;
  onEditNode: (node: GoalNode) => void;
  onPushNode: (node: GoalNode) => void;
  onUnplan: (taskId: string) => void;
  onCopy: (nodeId: string) => void;
  onCopyMany: (nodeIds: string[]) => void;
  onDeleteMany: (nodeIds: string[]) => void;
  /** Called whenever selection changes — passes selected IDs and schedulable leaf IDs */
  onSelectionChange: (selectedIds: string[], leafIds: string[]) => void;
  /** Ref App provides — GoalView stores its clearSelection fn here so App can call it */
  clearSelectionRef: React.MutableRefObject<() => void>;
  /** Optional direct navigation handler for recording jump origin for 1-step back navigation */
  onNavigateToPath?: (pathIds: string[]) => void;
  onOpenDescription?: (title: string, description: string) => void;
}

const kindMeta: Record<GoalKind, { icon: typeof Target; tint: string; label: string }> = {
  goal:    { icon: Target,    tint: 'var(--primary)',        label: 'Goal' },
  phase:   { icon: Flag,      tint: 'var(--primary-glow)',   label: 'Phase' },
  section: { icon: Layers,    tint: 'var(--text-secondary)', label: 'Section' },
  task:    { icon: ListTree,  tint: 'var(--text-secondary)', label: 'Task' },
  sub:     { icon: CircleDot, tint: 'var(--text-muted)',     label: 'Sub' },
  leaf:    { icon: CircleDot, tint: 'var(--text-muted)',     label: 'Leaf' },
};

export default function GoalView({ pathIds, setPathIds, highlightNodeId, onAddChild, onEditNode, onPushNode, onUnplan, onCopy, onSelectionChange, clearSelectionRef, onNavigateToPath, onOpenDescription }: Props) {
  const { goals, tasks, toggleGoalStep, togglePin, reorderGoalNodes, toggleNodeCompletion } = useStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [pathMapOpen, setPathMapOpen] = useState(false);

  // Register clearSelection so App can call it when batch actions complete
  useEffect(() => {
    clearSelectionRef.current = () => {
      setSelected(new Set());
      onSelectionChange([], []);
    };
  }, [clearSelectionRef, onSelectionChange]);

  useEffect(() => {
    setPathMapOpen(false);
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
      const leafIds = allIds.filter((lid) => {
        const n = findGoalInTree(lid, children);
        return n && n.children.length === 0 && !n.todayTaskId;
      });
      onSelectionChange(allIds, leafIds);
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
    setPathIds([...pathIds.slice(0, -1), node.id]);
    setSelected(new Set());
    onSelectionChange([], []);
  };

  const jumpToPinned = (p: { node: GoalNode; path: GoalNode[] }) => {
    // Generalized rule: If pinned item has children (Goal/Phase/Section/Task/Sub), drill INTO it to display its children.
    // If pinned item is a leaf node (0 children), open its parent level so the item is highlighted in context.
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
      <div className="sticky top-0 z-30 no-swipe -mt-4 mb-5 pt-1 pb-3 bg-base/95 space-y-2">
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
        </nav>

        {siblings.length > 1 && current && (
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar px-0.5">
            {siblings.map((node) => {
              const here = node.id === current.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => jumpToSibling(node)}
                  title={node.title}
                  className={`shrink-0 max-w-[9.5rem] h-7 px-2.5 rounded-full text-[11px] font-semibold truncate border transition-colors ${
                    here
                      ? 'bg-primary-soft text-primary border-primary/25'
                      : 'bg-surface text-content-secondary border-subtle hover:text-content-primary hover:bg-elevated'
                  }`}
                >
                  {node.title}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Overlay open={pathMapOpen} onClose={() => setPathMapOpen(false)} align="bottom">
        <div className="panel sheet-up p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Where you are</p>
              <h3 className="text-sm font-bold text-content-primary">Jump to a level</h3>
            </div>
            <button
              type="button"
              onClick={() => setPathMapOpen(false)}
              className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-elevated"
              aria-label="Close path map"
            >
              <X size={16} />
            </button>
          </div>
          <div className="bg-elevated rounded-[12px] border border-subtle overflow-hidden max-h-[55vh] overflow-y-auto no-scrollbar">
            <button
              type="button"
              onClick={() => jumpToPathIndex(-1)}
              className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface border-b border-subtle"
            >
              <Target size={14} className="text-primary shrink-0" />
              <span className="text-[13px] font-semibold text-content-primary">All Goals</span>
            </button>
            {path.map((n, i) => {
              const MetaIcon = kindMeta[n.kind].icon;
              const isHere = i === path.length - 1;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => jumpToPathIndex(i)}
                  className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface ${
                    i < path.length - 1 ? 'border-b border-subtle' : ''
                  } ${isHere ? 'bg-primary-soft' : ''}`}
                  style={{ paddingLeft: `${14 + Math.min(i, 5) * 12}px` }}
                >
                  <MetaIcon size={14} style={{ color: kindMeta[n.kind].tint }} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[13px] font-semibold truncate ${isHere ? 'text-primary' : 'text-content-primary'}`}>
                      {n.title}
                    </span>
                    <span className="block text-[10px] text-content-muted">{kindMeta[n.kind].label}</span>
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
                const meta = kindMeta[p.node.kind];
                const Icon = meta.icon;
                const pathLabel = p.path.slice(0, -1).map((n) => n.title).join(' / ') || 'Root goal';
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
                    <Icon size={15} style={{ color: meta.tint }} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13.5px] font-semibold text-content-primary truncate">{p.node.title}</div>
                      <div className="mt-0.5 text-[11px] text-content-muted truncate">{pathLabel}</div>
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
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {(() => {
                const Icon = kindMeta[current.kind].icon;
                return <Icon size={16} style={{ color: kindMeta[current.kind].tint }} className="shrink-0" />;
              })()}
              <h2 className="text-base font-bold text-content-primary truncate leading-snug">{current.title}</h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {(() => {
                const parentPct = rollupPct(current);
                const isParentDone = parentPct >= 100;
                return (
                  <span
                    className={`text-lg font-bold tabular-nums px-0.5 ${
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

          {current.description && (
            <p className="mt-2 text-[12px] text-content-secondary leading-relaxed">{current.description}</p>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-content-secondary">
            <span className="shrink-0 whitespace-nowrap font-medium" style={{ color: kindMeta[current.kind].tint }}>
              {kindMeta[current.kind].label}
            </span>
            <span className="shrink-0 whitespace-nowrap tabular-nums">
              {countCompletedDirectChildren(current)}/{countDirectChildren(current)} done
            </span>
            {(current.startDate || current.endDate) && (
              <span className="shrink-0 whitespace-nowrap tabular-nums text-content-muted">
                {current.startDate && fmtShort(current.startDate)}
                {current.startDate && current.endDate && ' → '}
                {current.endDate && fmtShort(current.endDate)}
              </span>
            )}
          </div>

          <div className="mt-3 h-2 rounded-full bg-border-subtle overflow-hidden">
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
        </div>
      )}

      {/* Children list */}
      <div className="bg-surface rounded-[12px] border border-subtle overflow-hidden">
        {children.map((child, index) => {
          const meta = kindMeta[child.kind];
          const Icon = meta.icon;
          // Any container node (goal, phase, section, task, sub) can be drilled into
          const canDrill = child.kind !== 'leaf';
          // Executable nodes that can be directly completed (task, sub, leaf)
          const isTaskKind = child.kind === 'task' || child.kind === 'sub' || child.kind === 'leaf';
          // Any childless node is considered leaf-like and can be dispatched to Today
          const isLeafLike = child.children.length === 0;
          const hasSteps = !!child.steps && child.steps.length > 0;
          const stepDone = child.stepDone ?? [];
          const pct = isLeafLike && hasSteps ? Math.round((stepDone.filter(Boolean).length / child.steps!.length) * 100) : rollupPct(child);
          const isSelected = selected.has(child.id);
          const isDone = child.completed || pct === 100;
          const linkedTask = child.todayTaskId ? tasks.find((t) => t.id === child.todayTaskId) : null;
          const isBacklogged = linkedTask ? isBacklogTask(linkedTask) : false;
          const isScheduled = linkedTask && !isBacklogged;

          const isHighlighted = child.id === highlightNodeId;
          const isLast = index === children.length - 1;

          return (
            <div
              key={child.id}
              id={`goal-node-${child.id}`}
              role={canDrill ? 'button' : undefined}
              tabIndex={canDrill ? 0 : undefined}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('text/plain', child.id);
                setDragId(child.id);
              }}
              onDragEnter={() => setOverId(child.id)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={() => {
                if (dragId && overId && dragId !== overId) {
                  reorderGoalNodes(current ? current.id : null, dragId, overId);
                }
                setDragId(null);
                setOverId(null);
              }}
              onClick={() => {
                if (canDrill) drillInto(child);
              }}
              onKeyDown={(e) => {
                if (!canDrill) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  drillInto(child);
                }
              }}
              className={`px-3.5 py-3.5 flex flex-col gap-3 bg-surface ${
                canDrill ? 'cursor-pointer' : ''
              } ${
                !isLast ? 'border-b border-subtle' : ''
              } ${
                isHighlighted
                  ? 'bg-primary-soft'
                  : isSelected
                    ? 'bg-primary/10'
                    : 'hover:bg-elevated'
              } ${overId === child.id && dragId !== child.id ? 'ring-2 ring-primary z-10' : ''}`}
            >
              <div className="flex items-center gap-2.5">
                {isTaskKind && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggleSelect(child.id)}
                    className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                    title="Select for batch operations"
                  />
                )}
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <Icon size={15} style={{ color: meta.tint }} className="shrink-0" />
                  <h3 className={`text-[14.5px] font-semibold leading-snug truncate ${isDone ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                    {child.title}
                  </h3>
                  {child.pinned && <Star size={12} className="fill-primary text-primary shrink-0" />}
                </div>
                <span className={`text-[13px] font-semibold tabular-nums shrink-0 ${isDone ? 'text-secondary' : pct > 0 ? 'text-primary' : 'text-content-muted'}`}>
                  {pct}%
                </span>
                {canDrill && (
                  <span className="p-1 -mr-1 rounded-lg text-content-muted" aria-hidden>
                    <ChevronRight size={16} />
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 min-w-0">
                <p className="flex-1 min-w-0 text-[11px] text-content-muted truncate">
                  {meta.label}
                  {!isLeafLike && ` · ${countCompletedDirectChildren(child)}/${countDirectChildren(child)} done`}
                  {isLeafLike && hasSteps && ` · ${stepDone.filter(Boolean).length}/${child.steps!.length} steps`}
                </p>
                {isScheduled && (
                  <span
                    className="shrink-0 text-[10px] font-semibold text-secondary bg-secondary-soft px-2 py-0.5 rounded-md"
                    title={`Scheduled for ${linkedTask?.targetDate ? formatDDMMYYYY(linkedTask.targetDate) : ''}`}
                  >
                    {getScheduledDateLabel(linkedTask?.targetDate)}
                  </span>
                )}
                {isBacklogged && (
                  <span className="shrink-0 text-[10px] font-semibold text-error bg-error-soft px-2 py-0.5 rounded-md">
                    Backlog
                  </span>
                )}
              </div>

              <div className="h-1 rounded-full bg-border-subtle overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: isDone ? 'var(--secondary)' : 'var(--primary)' }} />
              </div>

              {isLeafLike && hasSteps && (
                <div className="flex flex-wrap gap-1">
                  {child.steps!.map((s, i) => (
                    <button
                      key={i}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleGoalStep(child.id, i);
                      }}
                      className={`max-w-full text-[10px] font-medium leading-none px-1.5 py-1 rounded-md border truncate ${
                        stepDone[i]
                          ? 'bg-elevated border-subtle text-content-muted line-through'
                          : 'border-subtle text-content-secondary'
                      }`}
                      title={s}
                    >
                      {i + 1}. {s}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-1 pt-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePin(child.id);
                  }}
                  className={`p-2 rounded-[10px] ${child.pinned ? 'text-primary bg-primary-soft' : 'text-content-muted hover:text-content-primary hover:bg-elevated'}`}
                  title={child.pinned ? 'Unpin' : 'Pin'}
                >
                  {child.pinned ? <Star size={14} className="fill-primary" /> : <Pin size={14} />}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onEditNode(child);
                  }}
                  className="p-2 rounded-[10px] text-content-muted hover:text-content-primary hover:bg-elevated"
                  title="Edit"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopy(child.id);
                  }}
                  className="p-2 rounded-[10px] text-content-muted hover:text-content-primary hover:bg-elevated"
                  title="Copy"
                >
                  <Copy size={14} />
                </button>
                {child.description && onOpenDescription && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenDescription(child.title, child.description!);
                    }}
                    className="p-2 rounded-[10px] text-content-muted hover:text-content-primary hover:bg-elevated"
                    title="Description"
                  >
                    <FileText size={14} />
                  </button>
                )}

                <div className="flex-1" />

                {isTaskKind && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleNodeCompletion(child.id);
                    }}
                    className={`h-8 px-2.5 rounded-[10px] text-[11px] font-medium border ${
                      isDone
                        ? 'bg-secondary-soft text-secondary border-subtle'
                        : 'text-content-secondary border-subtle hover:text-content-primary'
                    }`}
                    title={isDone ? 'Mark as incomplete' : 'Mark as done'}
                  >
                    Done
                  </button>
                )}

                {isLeafLike && !child.completed && (
                  isScheduled ? (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPushNode(child);
                        }}
                        className="h-8 px-2.5 rounded-[10px] text-[11px] font-medium border border-subtle text-primary"
                        title="Replan"
                      >
                        Replan
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (child.todayTaskId) onUnplan(child.todayTaskId);
                        }}
                        className="h-8 px-2.5 rounded-[10px] text-[11px] font-medium bg-error-soft text-error border border-subtle"
                        title="Unschedule"
                      >
                        Unplan
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onPushNode(child);
                      }}
                      className="h-8 px-2.5 rounded-[10px] text-[11px] font-medium btn-primary"
                      title={isBacklogged ? 'Schedule backlogged task' : 'Schedule'}
                    >
                      Schedule
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button
        onClick={() => onAddChild(current?.id ?? null, current?.kind)}
        className="mt-4 w-full py-3 rounded-2xl text-sm font-medium text-content-secondary bg-surface border border-dashed border-subtle hover:border-content-muted hover:text-content-primary transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus size={15} />
        {current ? `Add to ${current.title}` : 'Create Goal'}
      </button>

      {/* Floating Batch Selection Bar */}
      {goals.length === 0 && (
        <div className="bg-surface border border-subtle rounded-2xl shadow-card p-10 text-center fade-in mt-4">
          <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-elevated animate-float">
            <Target size={26} className="text-content-secondary" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-content-primary">No goals yet</h3>
          <p className="mt-1 text-sm text-content-secondary ">Map your big ambitions into daily action.</p>
        </div>
      )}
    </div>
  );
}

function fmtShort(date: string): string {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
