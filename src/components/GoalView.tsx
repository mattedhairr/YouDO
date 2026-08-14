import { useEffect, useMemo, useState } from 'react';
import {
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
  Clock,
} from 'lucide-react';
import type { GoalKind, GoalNode } from '../types';
import { countDirectChildren, countCompletedDirectChildren, collectDescendantIds, findNode, formatDDMMYYYY, isBacklogTask, rollupPct, useStore } from '../store';

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
  onViewStats?: (id: string, title: string) => void;
}

const kindMeta: Record<GoalKind, { icon: typeof Target; tint: string; label: string }> = {
  goal:    { icon: Target,    tint: 'var(--primary)',        label: 'Goal' },
  phase:   { icon: Flag,      tint: 'var(--primary-glow)',   label: 'Phase' },
  section: { icon: Layers,    tint: 'var(--text-secondary)', label: 'Section' },
  task:    { icon: ListTree,  tint: 'var(--text-secondary)', label: 'Task' },
  sub:     { icon: CircleDot, tint: 'var(--text-muted)',     label: 'Sub' },
  leaf:    { icon: CircleDot, tint: 'var(--text-muted)',     label: 'Leaf' },
};

export default function GoalView({ pathIds, setPathIds, highlightNodeId, onAddChild, onEditNode, onPushNode, onUnplan, onCopy, onSelectionChange, clearSelectionRef, onNavigateToPath, onOpenDescription, onViewStats }: Props) {
  const { goals, tasks, toggleGoalStep, togglePin, reorderGoalNodes, toggleNodeCompletion, sessionHistory } = useStore();
  const sessionNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const list of Object.values(sessionHistory)) {
      for (const s of list) if (s.goalNodeId) ids.add(s.goalNodeId);
    }
    return ids;
  }, [sessionHistory]);

  const nodeHasStats = (node: GoalNode) => collectDescendantIds(node).some((id) => sessionNodeIds.has(id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // Register clearSelection so App can call it when batch actions complete
  useEffect(() => {
    clearSelectionRef.current = () => {
      setSelected(new Set());
      onSelectionChange([], []);
    };
  }, [clearSelectionRef, onSelectionChange]);

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
      <div className="sticky top-0 z-30 no-swipe -mt-4 mb-5 pt-1 pb-3 bg-base/95">
        <nav
          aria-label="Goal location"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar rounded-[12px] border border-subtle bg-surface px-1.5 py-1.5"
        >
          <button
            onClick={goRoot}
            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12px] font-semibold transition-colors ${
              path.length === 0
                ? 'bg-primary-soft text-primary'
                : 'text-content-secondary hover:bg-elevated hover:text-content-primary'
            }`}
          >
            <Target size={13} strokeWidth={2.25} />
            Goals
          </button>
          {path.map((n, i) => {
            const MetaIcon = kindMeta[n.kind].icon;
            const isHere = i === path.length - 1;
            return (
              <div key={n.id} className="flex items-center gap-1 shrink-0 min-w-0">
                <ChevronRight size={14} className="text-content-muted shrink-0" />
                <button
                  onClick={() => goTo(i)}
                  title={n.title}
                  className={`inline-flex items-center gap-1.5 h-8 max-w-[168px] px-2.5 rounded-lg text-[12px] font-semibold truncate transition-colors ${
                    isHere
                      ? 'bg-primary-soft text-primary'
                      : 'text-content-secondary hover:bg-elevated hover:text-content-primary'
                  }`}
                >
                  <MetaIcon size={12} className="shrink-0" />
                  <span className="truncate">{n.title}</span>
                </button>
              </div>
            );
          })}
        </nav>
      </div>

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
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {(() => { const Icon = kindMeta[current.kind].icon; return <Icon size={16} style={{ color: kindMeta[current.kind].tint }} />; })()}
                <h2 className="text-base font-bold text-content-primary truncate">{current.title}</h2>
              </div>
              {current.description && <p className="mt-1 text-[12px] text-content-secondary">{current.description}</p>}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-content-secondary ">
                <span style={{ color: kindMeta[current.kind].tint }}>{kindMeta[current.kind].label}</span>
                <span>{countCompletedDirectChildren(current)}/{countDirectChildren(current)} done</span>
                {current.startDate && <span>· {fmtShort(current.startDate)}</span>}
                {current.endDate && <span>→ {fmtShort(current.endDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {onViewStats && nodeHasStats(current) && (
                <button onClick={() => onViewStats(current.id, current.title)} className="p-2 rounded-lg text-warning bg-warning/10 hover:bg-warning/20 transition-colors" title="Session Analytics">
                  <Clock size={14} />
                </button>
              )}
              <div className="text-right mr-1">
                {(() => {
                  const parentPct = rollupPct(current);
                  const isParentDone = parentPct >= 100;
                  return (
                    <div
                      className={`text-lg font-bold tabular-nums ${
                        isParentDone ? 'text-secondary' : parentPct > 0 ? 'text-primary' : 'text-content-muted'
                      }`}
                    >
                      {parentPct}%
                    </div>
                  );
                })()}
              </div>
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
          <div className="mt-3 h-2 rounded-full bg-border-subtle overflow-hidden">
            {(() => {
              const parentPct = rollupPct(current);
              const isParentDone = parentPct >= 100;
              return (
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${parentPct}%`,
                    background: isParentDone ? 'var(--secondary)' : 'var(--primary)'
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
                {onViewStats && nodeHasStats(child) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewStats(child.id, child.title);
                    }}
                    className="p-2 rounded-[10px] text-content-muted hover:text-content-primary hover:bg-elevated"
                    title="Stats"
                  >
                    <Clock size={14} />
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
