import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
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
  Unlink,
  Zap,
  Clock,
} from 'lucide-react';
import type { GoalKind, GoalNode } from '../types';
import { countDirectChildren, countCompletedDirectChildren, findNode, formatDDMMYYYY, isBacklogTask, rollupPct, useStore } from '../store';

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
      {/* Sticky Top Glass Breadcrumb Header */}
      <div className="sticky top-0 z-30 no-swipe rounded-b-2xl -mt-4 mb-5 mx-0 px-4 py-3.5 glass-header flex items-center gap-2 overflow-x-auto no-scrollbar whitespace-nowrap shadow-sm border-b border-subtle">
        <button
          onClick={goRoot}
          className={`text-[13px] font-bold transition-all shrink-0 ${
            path.length === 0
              ? 'text-content-primary'
              : 'text-content-secondary hover:text-primary  '
          }`}
        >
          All Goals
        </button>
        {path.map((n, i) => (
          <div key={n.id} className="flex items-center gap-2 shrink-0">
            <span className="text-content-muted font-light text-[13px]">/</span>
            <button
              onClick={() => goTo(i)}
              className={`text-[13px] font-bold transition-all max-w-[160px] truncate ${
                i === path.length - 1
                  ? 'text-primary'
                  : 'text-content-secondary hover:text-primary  '
              }`}
            >
              {n.title}
            </button>
          </div>
        ))}
      </div>

      {/* Pinned/Favorites section */}
      {pinned.length > 0 && pathIds.length === 0 && (
        <>
          <div className="mb-4 p-3 rounded-2xl bg-warning/10 border border-warning/20 shadow-2xs">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-warning">
                <Star size={13} className="fill-warning text-warning" />
                Pinned & Favorites
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-warning/15 text-warning">
                {pinned.length}
              </span>
            </div>
            <div className="space-y-1.5">
              {pinned.map((p) => {
                const meta = kindMeta[p.node.kind];
                const Icon = meta.icon;
                return (
                  <button
                    key={p.node.id}
                    onClick={() => jumpToPinned(p)}
                    className="w-full card p-3 flex items-start gap-2.5 hover:ring-1 hover:ring-warning/50 transition-all fade-in bg-surface"
                  >
                    <Icon size={16} style={{ color: meta.tint }} className="shrink-0 mt-0.5" />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-[13.5px] font-semibold text-content-primary leading-tight">{p.node.title}</div>
                      {(() => {
                        const ancestorTitles = p.path.slice(0, -1).map((n) => n.title);
                        if (ancestorTitles.length === 0) {
                          return <div className="text-[10px] text-content-secondary font-medium mt-0.5">Root Goal</div>;
                        }
                        return (
                          <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px] font-medium leading-normal">
                            {ancestorTitles.map((title, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1">
                                <span className={idx === ancestorTitles.length - 1 ? 'font-semibold text-content-muted' : 'text-content-secondary'}>
                                  {title}
                                </span>
                                {idx < ancestorTitles.length - 1 && (
                                  <span className="text-content-muted">/</span>
                                )}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {(() => {
                        const pPct = rollupPct(p.node);
                        return (
                          <span
                            className={`text-[11px] font-semibold tabular-nums ${
                              pPct >= 100 ? 'text-secondary' : pPct > 0 ? 'text-primary' : 'text-content-muted'
                            }`}
                          >
                            {pPct}%
                          </span>
                        );
                      })()}
                      <ChevronRight size={16} className="text-content-muted" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Partition Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-subtle" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-content-secondary">
              All Goals
            </span>
            <div className="h-px flex-1 bg-subtle" />
          </div>
        </>
      )}

      {/* Current node header card */}
      {current && (
        <div className="bg-surface border border-subtle rounded-2xl shadow-card p-4 mb-3.5 fade-in">
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
              {onViewStats && Object.values(sessionHistory).flat().some(s => s.goalNodeId === current.id) && (
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
                className={`p-2 rounded-lg transition-colors ${current.pinned ? 'text-warning bg-warning/10' : 'text-content-secondary hover:text-warning hover:bg-warning-soft dark:hover:bg-warning/20'}`}
                title={current.pinned ? 'Unpin' : 'Pin to favorites'}
              >
                {current.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button onClick={() => onEditNode(current)} className="p-2 rounded-lg text-content-secondary hover:text-primary-glow hover:bg-primary-soft transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-elevated overflow-hidden">
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
      <div className="bg-surface/60 rounded-3xl shadow-sm border border-subtle overflow-hidden backdrop-blur-xl">
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
              className={`p-4 transition-all flex flex-col bg-surface ${
                !isLast ? 'border-b border-subtle' : ''
              } ${
                isHighlighted
                  ? 'bg-primary-soft'
                  : isSelected
                    ? 'bg-primary/10'
                    : 'hover:bg-elevated'
              } ${overId === child.id && dragId !== child.id ? 'ring-2 ring-primary scale-[1.01] z-10 rounded-xl' : ''} ${isDone && !isHighlighted ? '' : ''}`}
            >
              {/* Top Row: Checkbox, Title, Drill */}
              <div className="flex items-start gap-3">
                {/* Batch select checkbox */}
                {isTaskKind && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(child.id)}
                    className="mt-[3px] w-4 h-4 rounded accent-primary cursor-pointer shrink-0"
                    title="Select for batch operations"
                  />
                )}

                {/* Title + Icon */}
                <div
                  className={`flex-1 min-w-0 flex items-start gap-2 ${canDrill ? 'cursor-pointer' : ''}`}
                  onClick={() => canDrill && drillInto(child)}
                >
                  <Icon size={16} style={{ color: meta.tint }} className="shrink-0 mt-[3px]" />
                  <h3 className={`text-[15px] font-bold leading-snug break-words ${isDone ? 'line-through text-content-muted' : 'text-content-primary'}`}>
                    {child.title}
                  </h3>
                </div>

                {/* Progress % + drill */}
                <div className="shrink-0 flex items-center gap-1">
                  <span className={`text-[13px] font-bold tabular-nums ${isDone ? 'text-secondary' : pct > 0 ? 'text-primary' : 'text-content-muted'}`}>{pct}%</span>
                  {canDrill && (
                    <button
                      onClick={() => drillInto(child)}
                      className="p-1 rounded-lg text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors"
                      title={`Open ${meta.label}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Meta Row */}
              <div className={`mt-1.5 flex flex-wrap items-center gap-2 ${isTaskKind ? 'pl-[28px]' : 'pl-[24px]'}`}>
                {child.pinned && <Star size={11} className="fill-warning text-warning shrink-0" />}
                {isScheduled && (
                  <span
                    className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-secondary bg-secondary/10 border border-secondary/20 px-2 py-0.5 rounded-full shadow-2xs"
                    title={`Scheduled for ${linkedTask?.targetDate ? formatDDMMYYYY(linkedTask.targetDate) : ''}`}
                  >
                    <Zap size={9} className="fill-secondary text-secondary" /> Scheduled ({getScheduledDateLabel(linkedTask?.targetDate)})
                  </span>
                )}
                {isBacklogged && (
                  <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-error bg-error-soft border border-error/20 px-2 py-0.5 rounded-full">
                    <AlertTriangle size={9} /> Backlog
                  </span>
                )}
                {onViewStats && Object.values(sessionHistory).flat().some(s => s.goalNodeId === child.id) && (
                  <button onClick={(e) => { e.stopPropagation(); onViewStats(child.id, child.title); }} className="flex items-center gap-1 text-[11px] text-warning/80 hover:text-warning font-medium" title="View Session Stats">
                    <Clock size={11} /> Stats
                  </button>
                )}
                <span style={{ color: meta.tint }} className="text-[11px] font-semibold">{meta.label}</span>
                {!isLeafLike && <span className="text-[11px] text-content-secondary">· {countCompletedDirectChildren(child)}/{countDirectChildren(child)} done</span>}
                {isLeafLike && hasSteps && <span className="text-[11px] text-content-secondary">· {stepDone.filter(Boolean).length}/{child.steps!.length} steps</span>}
                {child.description && (
                  <>
                    <span className="text-[11px] text-content-secondary">·</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenDescription) {
                          onOpenDescription(child.title, child.description!);
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-content-secondary hover:text-primary  transition-colors"
                      title="View full description"
                    >
                      <FileText size={11} className="text-primary shrink-0" />
                      <span className="max-w-[130px] sm:max-w-[200px] truncate">{child.description}</span>
                    </button>
                  </>
                )}
              </div>

              {/* Progress Bar */}
              <div className={`mt-2.5 h-1.5 rounded-full bg-elevated overflow-hidden ${isTaskKind ? 'ml-[28px]' : 'ml-[24px]'}`}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isDone ? 'var(--secondary)' : 'var(--primary)' }} />
              </div>

              {/* Micro-step chips */}
              {isLeafLike && hasSteps && (
                <div className={`mt-2.5 flex items-center gap-1.5 flex-wrap ${isTaskKind ? 'ml-[28px]' : 'ml-[24px]'}`}>
                  {child.steps!.map((s, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); toggleGoalStep(child.id, i); }}
                      className={`text-[10.5px] font-medium px-2 py-1 rounded-lg border transition-all active:scale-95 ${
                        stepDone[i]
                          ? 'bg-elevated border-subtle text-content-muted line-through'
                          : 'bg-surface border-subtle text-content-secondary hover:border-primary/30'
                      }`}
                    >
                      {stepDone[i] ? '✓' : `${i + 1}.`} {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className={`mt-3 pt-2.5 border-t border-subtle flex items-center justify-between gap-2 ${isTaskKind ? 'ml-[28px]' : 'ml-[24px]'}`}>

                {/* Left: icon buttons */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => togglePin(child.id)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-colors ${
                      child.pinned
                        ? 'text-warning hover:bg-warning/20'
                        : 'text-content-secondary hover:text-content-primary hover:bg-elevated'
                    }`}
                  >
                    {child.pinned ? <Star size={15} className="fill-warning" /> : <Pin size={15} />}
                    <span className="text-[11px] font-semibold">{child.pinned ? 'Unpin' : 'Pin'}</span>
                  </button>
                  <button
                    onClick={() => onEditNode(child)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors"
                  >
                    <Pencil size={15} />
                    <span className="text-[11px] font-semibold">Edit</span>
                  </button>
                  <button
                    onClick={() => onCopy(child.id)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors"
                  >
                    <Copy size={15} />
                    <span className="text-[11px] font-semibold">Copy</span>
                  </button>
                </div>

                {/* Right: action pills */}
                <div className="flex items-center gap-1.5">
                  {/* Done pill — Task / Sub-task / Leaf only */}
                  {isTaskKind && (
                    <button
                      onClick={() => toggleNodeCompletion(child.id)}
                      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl border transition-all active:scale-95 ${
                        isDone
                          ? 'bg-secondary/10 text-secondary border-secondary/20'
                          : 'bg-transparent text-content-secondary border-subtle hover:border-secondary hover:text-secondary'
                      }`}
                      title={isDone ? 'Mark as incomplete' : 'Mark as done'}
                    >
                      <CheckCircle2 size={12} className={isDone ? 'text-secondary' : 'text-content-secondary'} />
                      Done
                    </button>
                  )}

                  {/* Schedule / Replan / Unplan — leaf-like & not completed */}
                  {isLeafLike && !child.completed && (
                    <>
                      {isScheduled ? (
                        <>
                          <button
                            onClick={() => onPushNode(child)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-primary bg-primary-soft hover:bg-primary/30 border border-primary/20 transition-all"
                            title="Replan"
                          >
                            <Zap size={12} /> Replan
                          </button>
                          <button
                            onClick={() => child.todayTaskId && onUnplan(child.todayTaskId)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-error bg-error-soft hover:bg-error/30 border border-error/20 transition-all"
                            title="Unschedule"
                          >
                            <Unlink size={12} /> Unplan
                          </button>
                        </>
                      ) : isBacklogged ? (
                        <button
                          onClick={() => onPushNode(child)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl text-white bg-error hover:bg-error-soft shadow-sm shadow-sm transition-all active:scale-95"
                          title="Schedule Backlogged Task"
                        >
                          <Zap size={12} className="fill-white" /> Schedule
                        </button>
                      ) : (
                        <button
                          onClick={() => onPushNode(child)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-white bg-primary hover:bg-primary-glow shadow-sm transition-all active:scale-95"
                        >
                          <Zap size={12} /> Schedule
                        </button>
                      )}
                    </>
                  )}
                </div>
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
