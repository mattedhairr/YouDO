import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clipboard,
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
  X,
  Zap,
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
  accent: string;
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
  onPaste: (parentId: string | null) => void;
  onCancelPaste: () => void;
  clipboard: GoalNode[];
  /** Called whenever selection changes — passes selected IDs and schedulable leaf IDs */
  onSelectionChange: (selectedIds: string[], leafIds: string[]) => void;
  /** Ref App provides — GoalView stores its clearSelection fn here so App can call it */
  clearSelectionRef: React.MutableRefObject<() => void>;
  /** Optional direct navigation handler for recording jump origin for 1-step back navigation */
  onNavigateToPath?: (pathIds: string[]) => void;
  onOpenDescription?: (title: string, description: string) => void;
}

const kindMeta: Record<GoalKind, { icon: typeof Target; tint: string; label: string }> = {
  goal: { icon: Target, tint: '#3b82f6', label: 'Goal' },
  phase: { icon: Flag, tint: '#8b5cf6', label: 'Phase' },
  section: { icon: Layers, tint: '#06b6d4', label: 'Section' },
  task: { icon: ListTree, tint: '#10b981', label: 'Task' },
  sub: { icon: CircleDot, tint: '#f59e0b', label: 'Sub' },
  leaf: { icon: CircleDot, tint: '#f43f5e', label: 'Leaf' },
};

export default function GoalView({ accent, pathIds, setPathIds, highlightNodeId, onAddChild, onEditNode, onPushNode, onUnplan, onCopy, onPaste, onCancelPaste, clipboard, onSelectionChange, clearSelectionRef, onNavigateToPath, onOpenDescription }: Props) {
  const { goals, tasks, toggleGoalStep, togglePin, reorderGoalNodes, toggleNodeCompletion } = useStore();
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

  // Auto-scroll & center target node:
  // 1. If explicit highlightNodeId is active (jumping from Today or Calendar), scroll to it.
  // 2. Otherwise, auto-scroll to the FIRST UNSCHEDULED child task (!child.todayTaskId && !child.completed) so the user never has to scroll past scheduled tasks.
  useEffect(() => {
    let targetId = highlightNodeId;

    if (!targetId && children.length > 0) {
      const unscheduledChild = children.find((c) => !c.todayTaskId && !c.completed);
      if (unscheduledChild) {
        targetId = unscheduledChild.id;
      }
    }

    if (!targetId) return;

    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const el = document.getElementById(`goal-node-${targetId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        clearInterval(interval);
      } else if (attempts >= 15) {
        clearInterval(interval);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [highlightNodeId, pathIds, children]);


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
      <div className="sticky top-0 z-30 no-swipe rounded-2xl px-3 py-2 glass-header mb-3 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap shadow-xs">
        <button
          onClick={goRoot}
          className={`px-2.5 py-1 rounded-xl text-[12px] font-semibold transition-all shrink-0 ${
            path.length === 0
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          All Goals
        </button>
        {path.map((n, i) => (
          <div key={n.id} className="flex items-center gap-1 shrink-0">
            <ChevronRight size={13} className="text-slate-300 dark:text-slate-600" />
            <button
              onClick={() => goTo(i)}
              className={`px-2.5 py-1 rounded-xl text-[12px] font-semibold transition-all max-w-[150px] truncate ${
                i === path.length - 1
                  ? 'bg-blue-600 text-white shadow-xs font-bold'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
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
          <div className="mb-4 p-3 rounded-2xl bg-amber-500/5 dark:bg-amber-500/10 border border-amber-500/20 dark:border-amber-500/30 shadow-2xs">
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                <Star size={13} className="fill-amber-400 text-amber-400" />
                Pinned & Favorites
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300">
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
                    className="w-full card p-3 flex items-start gap-2.5 hover:ring-1 hover:ring-amber-400/50 transition-all fade-in bg-white dark:bg-slate-800"
                  >
                    <Icon size={16} style={{ color: meta.tint }} className="shrink-0 mt-0.5" />
                    <div className="flex-1 text-left min-w-0">
                      <div className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 leading-tight">{p.node.title}</div>
                      {(() => {
                        const ancestorTitles = p.path.slice(0, -1).map((n) => n.title);
                        if (ancestorTitles.length === 0) {
                          return <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">Root Goal</div>;
                        }
                        return (
                          <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px] font-medium leading-normal">
                            {ancestorTitles.map((title, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1">
                                <span className={idx === ancestorTitles.length - 1 ? 'font-semibold text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}>
                                  {title}
                                </span>
                                {idx < ancestorTitles.length - 1 && (
                                  <span className="text-slate-300 dark:text-slate-600">/</span>
                                )}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      <span className="text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">{rollupPct(p.node)}%</span>
                      <ChevronRight size={16} className="text-slate-300 dark:text-slate-600" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Partition Divider */}
          <div className="flex items-center gap-3 my-4">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700/80" />
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-500">
              All Goals
            </span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700/80" />
          </div>
        </>
      )}

      {/* Current node header card */}
      {current && (
        <div className="card p-4 mb-3.5 fade-in">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {(() => { const Icon = kindMeta[current.kind].icon; return <Icon size={16} style={{ color: kindMeta[current.kind].tint }} />; })()}
                <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 truncate">{current.title}</h2>
              </div>
              {current.description && <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">{current.description}</p>}
              <div className="mt-1.5 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-400">
                <span style={{ color: kindMeta[current.kind].tint }}>{kindMeta[current.kind].label}</span>
                <span>{countCompletedDirectChildren(current)}/{countDirectChildren(current)} done</span>
                {current.startDate && <span>· {fmtShort(current.startDate)}</span>}
                {current.endDate && <span>→ {fmtShort(current.endDate)}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="text-right mr-1">
                <div className="text-lg font-bold tabular-nums" style={{ color: accent }}>{rollupPct(current)}%</div>
              </div>
              <button
                onClick={() => togglePin(current.id)}
                className={`p-2 rounded-lg transition-colors ${current.pinned ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'}`}
                title={current.pinned ? 'Unpin' : 'Pin to favorites'}
              >
                {current.pinned ? <PinOff size={14} /> : <Pin size={14} />}
              </button>
              <button onClick={() => onEditNode(current)} className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="Edit">
                <Pencil size={14} />
              </button>
            </div>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rollupPct(current)}%`, background: accent }} />
          </div>
        </div>
      )}

      {/* Children list */}
      <div className="space-y-2.5">
        {children.map((child) => {
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
              className={`card p-3.5 transition-all fade-in cursor-grab active:cursor-grabbing ${
                isHighlighted
                  ? 'ring-4 ring-blue-500 dark:ring-blue-400 bg-blue-500/20 dark:bg-blue-900/40 scale-[1.03] shadow-xl shadow-blue-500/40 animate-pulse z-20'
                  : isSelected
                    ? 'ring-2 ring-blue-400 dark:ring-blue-500'
                    : ''
              } ${overId === child.id && dragId !== child.id ? 'ring-2 ring-indigo-400 dark:ring-indigo-500 scale-[1.01]' : ''} ${isDone && !isHighlighted ? 'opacity-70 ring-1 ring-emerald-500/30 dark:ring-emerald-400/30' : ''}`}
            >
              {/* Header Row */}
              <div className="flex items-start gap-2.5">
                {/* Batch select checkbox — Tasks, Sub-tasks & Leaves only */}
                {isTaskKind && (
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(child.id)}
                    className="mt-1 w-4 h-4 rounded accent-blue-500 cursor-pointer shrink-0"
                    title="Select for batch operations"
                  />
                )}

                {/* Title + meta */}
                <div
                  className={`flex-1 min-w-0 ${canDrill ? 'cursor-pointer' : ''}`}
                  onClick={() => canDrill && drillInto(child)}
                >
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Icon size={14} style={{ color: meta.tint }} className="shrink-0" />
                    <h3 className={`text-[14px] font-semibold leading-snug break-words ${isDone ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                      {child.title}
                    </h3>
                    {child.pinned && <Star size={12} className="fill-amber-400 text-amber-400 shrink-0" />}
                    {isScheduled && (
                      <span
                        className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 px-2 py-0.5 rounded-full shadow-2xs"
                        title={`Scheduled for ${linkedTask?.targetDate ? formatDDMMYYYY(linkedTask.targetDate) : ''}`}
                      >
                        <Zap size={9} className="fill-emerald-500 text-emerald-500" /> Scheduled ({getScheduledDateLabel(linkedTask?.targetDate)})
                      </span>
                    )}
                    {isBacklogged && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wider text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 px-2 py-0.5 rounded-full">
                        <AlertTriangle size={9} /> Backlog
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-400 flex-wrap">
                    <span style={{ color: meta.tint }} className="font-semibold">{meta.label}</span>
                    {!isLeafLike && <span>· {countCompletedDirectChildren(child)}/{countDirectChildren(child)} done</span>}
                    {isLeafLike && hasSteps && <span>· {stepDone.filter(Boolean).length}/{child.steps!.length} steps</span>}
                    {child.description && (
                      <>
                        <span>·</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onOpenDescription) {
                              onOpenDescription(child.title, child.description!);
                            }
                          }}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                          title="View full description"
                        >
                          <FileText size={11} className="text-blue-500 shrink-0" />
                          <span className="max-w-[130px] sm:max-w-[200px] truncate">{child.description}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Progress % + drill */}
                <div className="shrink-0 flex items-center gap-0.5">
                  <span className={`text-[13px] font-bold tabular-nums ${isDone ? 'text-emerald-500' : 'text-slate-600 dark:text-slate-300'}`}>{pct}%</span>
                  {canDrill && (
                    <button
                      onClick={() => drillInto(child)}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      title={`Open ${meta.label}`}
                    >
                      <ChevronRight size={18} />
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-2.5 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: isDone ? '#10b981' : meta.tint }} />
              </div>

              {/* Micro-step chips */}
              {isLeafLike && hasSteps && (
                <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                  {child.steps!.map((s, i) => (
                    <button
                      key={i}
                      onClick={(e) => { e.stopPropagation(); toggleGoalStep(child.id, i); }}
                      className={`text-[10.5px] font-medium px-2 py-1 rounded-lg border transition-all active:scale-95 ${
                        stepDone[i]
                          ? 'bg-slate-100 dark:bg-slate-700/60 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 line-through'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-blue-300 dark:hover:border-blue-500'
                      }`}
                    >
                      {stepDone[i] ? '✓' : `${i + 1}.`} {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Toolbar */}
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2">

                {/* Left: icon buttons */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => togglePin(child.id)}
                    className={`p-1.5 rounded-lg transition-colors ${child.pinned ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-slate-400 dark:text-slate-500 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                    title={child.pinned ? 'Unpin' : 'Pin'}
                  >
                    {child.pinned ? <Star size={14} className="fill-amber-400" /> : <Pin size={14} />}
                  </button>
                  <button
                    onClick={() => onEditNode(child)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => onCopy(child.id)}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-slate-500 hover:text-cyan-500 dark:hover:text-cyan-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                    title="Copy"
                  >
                    <Copy size={14} />
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
                          ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700'
                          : 'bg-transparent text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-600 hover:text-emerald-600 dark:hover:text-emerald-400'
                      }`}
                      title={isDone ? 'Mark as incomplete' : 'Mark as done'}
                    >
                      <CheckCircle2 size={12} className={isDone ? 'text-emerald-500' : 'text-slate-400 dark:text-slate-500'} />
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
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-all"
                            title="Replan"
                          >
                            <Zap size={12} /> Replan
                          </button>
                          <button
                            onClick={() => child.todayTaskId && onUnplan(child.todayTaskId)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30 hover:bg-rose-100 dark:hover:bg-rose-900/50 border border-rose-200 dark:border-rose-800 transition-all"
                            title="Unschedule"
                          >
                            <Unlink size={12} /> Unplan
                          </button>
                        </>
                      ) : isBacklogged ? (
                        <button
                          onClick={() => onPushNode(child)}
                          className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl text-white bg-rose-600 hover:bg-rose-700 shadow-sm shadow-rose-500/30 transition-all active:scale-95"
                          title="Schedule Backlogged Task"
                        >
                          <Zap size={12} className="fill-white" /> Schedule
                        </button>
                      ) : (
                        <button
                          onClick={() => onPushNode(child)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-xl text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all active:scale-95"
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
        className="mt-4 w-full py-3 rounded-2xl text-sm font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 border border-dashed border-slate-300 dark:border-slate-600 hover:border-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus size={15} />
        {current ? `Add to ${current.title}` : 'Create Goal'}
      </button>

      {/* Floating Batch Selection Bar */}
      {/* Floating Paste Bar */}
      {clipboard.length > 0 && (
        <div className="fixed bottom-20 inset-x-4 z-40 max-w-md mx-auto">
          <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-2xl glass-nav shadow-2xl border border-slate-200/80 dark:border-white/15">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-900/40 text-blue-500 shrink-0">
              <Clipboard size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-bold text-slate-800 dark:text-slate-100 truncate">
                {clipboard.length === 1 ? clipboard[0].title : `${clipboard.length} copied items`}
              </div>
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate">
                Paste into {current ? current.title : 'root level'}
              </div>
            </div>
            <button
              onClick={onCancelPaste}
              className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors shrink-0"
              title="Cancel paste"
            >
              <X size={16} />
            </button>
            <button
              onClick={() => onPaste(current?.id ?? null)}
              className="px-3.5 py-2 rounded-xl text-[12px] font-bold text-white shadow-md shadow-blue-500/25 transition-all active:scale-95 shrink-0"
              style={{ background: accent }}
            >
              Paste here
            </button>
          </div>
        </div>
      )}

      {goals.length === 0 && (
        <div className="card p-10 text-center fade-in mt-4">
          <div className="mx-auto w-14 h-14 grid place-items-center rounded-2xl bg-slate-100 dark:bg-slate-700/50 animate-float">
            <Target size={26} className="text-slate-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-700 dark:text-slate-200">No goals yet</h3>
          <p className="mt-1 text-sm text-slate-400 dark:text-slate-400">Map your big ambitions into daily action.</p>
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
