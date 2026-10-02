import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckSquare2, ChevronRight, Circle, Copy, FolderInput, FolderOpen, ListChecks, Pencil, Pin, Plus, Redo2, Search, Sparkles, Square, Target, Trash2, Undo2, Wand2, X } from 'lucide-react';
import type { GoalNode } from '../types';
import type { GoalTreeChangeResult } from '../store';
import { countBlueprintNodes, findBlueprintPath, removeBlueprintNodes } from '../lib/blueprintStudio';
import { findGoal, hasGoalExecutionState, isGoalEndpoint, recomputeCompleted } from '../lib/goalTree';
import { duplicateStudioItems, patchStudioItems, reorderStudioItems, studioItemPath, topStudioSelection } from '../lib/studioWorkspace';
import { StudioButton, StudioPanel, StudioTargets } from './studio/StudioControls';
import { StudioAddForm, StudioChangeReview, StudioChecklistForm, StudioDrillDownPicker, StudioEditForm, StudioReviewTree, StudioSelectionList } from './studio/StudioForms';
import AIPlanFlow from './studio/AIPlanFlow';
import Overlay from './Overlay';
import './studio/studio.css';

type Panel =
  | { type: 'add'; ids: string[]; kind: 'goal' | 'items' | 'steps' }
  | { type: 'edit' | 'checklist' | 'remove'; ids: string[] }
  | { type: 'selection' | 'review' | 'ai-plan' };
type DraftChange = { before: GoalNode[]; after: GoalNode[]; summary: string };
interface Props {
  open: boolean; goals: GoalNode[]; initialPathIds?: string[]; activeGoalNodeId?: string;
  onClose: () => void;
  onCommit: (baseGoals: GoalNode[], nextGoals: GoalNode[], summary: string) => GoalTreeChangeResult;
}
const nodesAt = (goals: GoalNode[], ids: string[]) => ids.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));
const itemIcon = (node: GoalNode) => node.kind === 'goal' ? <Target size={18} /> : node.children.length ? <Folder size={18} /> : <ListChecks size={18} />;
const canAddInside = (node: GoalNode) => node.kind === 'goal' || !isGoalEndpoint(node) || !hasGoalExecutionState(node);

/** One draft workspace; operations always target explicit IDs, never matching names. */
export default function BlueprintStudio({ open, goals, initialPathIds = [], activeGoalNodeId, onClose, onCommit }: Props) {
  const [baseGoals] = useState(goals);
  const [draft, setDraft] = useState(goals);
  const [parentIds, setParentIds] = useState<string[]>(() => {
    const last = [...initialPathIds].reverse().find((id) => findGoal(goals, id));
    return last ? [last] : [];
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [query, setQuery] = useState('');
  const [exactMatch, setExactMatch] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [moveIds, setMoveIds] = useState<string[] | null>(null);
  const [confirmation, setConfirmation] = useState<'exit' | 'form' | null>(null);
  const [past, setPast] = useState<DraftChange[]>([]);
  const [future, setFuture] = useState<DraftChange[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const breadcrumbRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const restoreScroll = useRef<number | null>(null);
  const panelDirty = useRef(false);
  const backRef = useRef<() => void>(() => {});
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const parents = nodesAt(draft, parentIds);
  const current = parents.length === 1 ? parents[0] : null;
  const multi = parents.length > 1;
  const path = current ? findBlueprintPath(draft, current.id) : [];
  const selectedNodes = nodesAt(draft, selected);
  const changed = JSON.stringify(baseGoals) !== JSON.stringify(draft);
  const sections = parents.length ? parents.map((parent) => ({ parent, children: parent.children })) : [{ parent: null, children: draft }];
  const matching = (node: GoalNode) => {
    const title = node.title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    const term = query.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
    return !term || (exactMatch ? title === term : title.includes(term));
  };
  const visible = sections.flatMap((section) => section.children.filter(matching));
  const allVisibleSelected = visible.length > 0 && visible.every((node) => selected.includes(node.id));
  const activePath = activeGoalNodeId ? findBlueprintPath(draft, activeGoalNodeId).map((node) => node.id) : [];
  const panelIds = panel && 'ids' in panel ? panel.ids : [];
  const panelNodes = nodesAt(draft, panelIds);

  const markDirty = (dirty: boolean) => { panelDirty.current = dirty; };

  const openPanel = (next: Panel) => {
    if (activeGoalNodeId && 'ids' in next && next.ids.includes(activeGoalNodeId) && (next.type === 'edit' || next.type === 'checklist' || (next.type === 'add' && next.kind === 'steps'))) {
      const message = 'Finish the active focus session before editing that task.';
      setStatus(message); setError(message); return;
    }
    panelDirty.current = false; setError(''); setPanel(next);
  };
  const dismissPanel = () => {
    if (panelDirty.current) setConfirmation('form');
    else { setPanel(null); setError(''); }
  };
  const requestExit = () => {
    if (changed || panelDirty.current) setConfirmation('exit');
    else onClose();
  };
  const visit = (ids: string[]) => {
    setParentIds(ids); setQuery(''); setExactMatch(false);
    restoreScroll.current = 0;
  };
  const goBack = () => {
    if (confirmation) return;
    if (panel) { dismissPanel(); return; }
    if (!parentIds.length) { requestExit(); return; }

    const parentPaths = parents.map((parent) => findBlueprintPath(draft, parent.id));
    let commonPath = parentPaths[0] ?? [];
    for (const candidate of parentPaths.slice(1)) {
      const sharedLength = commonPath.findIndex((node, index) => candidate[index]?.id !== node.id);
      commonPath = sharedLength === -1
        ? commonPath.slice(0, Math.min(commonPath.length, candidate.length))
        : commonPath.slice(0, sharedLength);
    }
    const nextParent = multi
      ? commonPath[commonPath.length - 1]
      : path.length > 1 ? path[path.length - 2] : null;
    setParentIds(nextParent ? [nextParent.id] : []);
    setQuery(''); setExactMatch(false); restoreScroll.current = 0;
    // Selection is intentionally preserved — user may have navigated away to select more items.
  };
  backRef.current = goBack;
  useEffect(() => {
    const back = () => backRef.current();
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (changed || panelDirty.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('youdo:blueprint-back-request', back);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('youdo:blueprint-back-request', back);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [changed]);
  useEffect(() => {
    if (restoreScroll.current !== null && scrollRef.current) {
      scrollRef.current.scrollTop = restoreScroll.current; restoreScroll.current = null;
    }
  });
  useEffect(() => {
    if (breadcrumbRef.current) breadcrumbRef.current.scrollLeft = breadcrumbRef.current.scrollWidth;
  }, [parentIds]);
  useEffect(() => {
    if (panel || confirmation) workspaceRef.current?.setAttribute('inert', '');
    else workspaceRef.current?.removeAttribute('inert');
  }, [panel, confirmation]);
  useEffect(() => {
    const root = document.getElementById('root');
    const wasInert = root?.hasAttribute('inert');
    const previousHidden = root?.getAttribute('aria-hidden');
    const previous = document.activeElement as HTMLElement | null;
    root?.setAttribute('inert', '');
    root?.setAttribute('aria-hidden', 'true');
    workspaceRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      if (!wasInert) root?.removeAttribute('inert');
      if (previousHidden !== null && previousHidden !== undefined) root?.setAttribute('aria-hidden', previousHidden);
      else root?.removeAttribute('aria-hidden');
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  const apply = (next: GoalNode[], summary: string) => {
    next = next.map(recomputeCompleted);
    if (JSON.stringify(next) === JSON.stringify(draft)) { setError('Nothing to change for these items.'); return; }
    setPast((history) => [...history, { before: draft, after: next, summary }]); setFuture([]);
    setDraft(next); setSelected((ids) => ids.filter((id) => findGoal(next, id)));
    setParentIds((ids) => ids.filter((id) => findGoal(next, id)));
    setStatus(summary); setError(''); setPanel(null); panelDirty.current = false;
  };
  const undo = () => {
    const change = past[past.length - 1]; if (!change) return;
    setDraft(change.before); setPast(past.slice(0, -1)); setFuture([change, ...future]);
    setSelected(selected.filter((id) => findGoal(change.before, id)));
    setParentIds(parentIds.filter((id) => findGoal(change.before, id))); setStatus('Undone: ' + change.summary);
  };
  const redo = () => {
    const change = future[0]; if (!change) return;
    setDraft(change.after); setPast([...past, change]); setFuture(future.slice(1));
    setSelected(selected.filter((id) => findGoal(change.after, id)));
    setParentIds(parentIds.filter((id) => findGoal(change.after, id))); setStatus('Redone: ' + change.summary);
  };
  const save = () => {
    const result = onCommit(baseGoals, draft, 'Blueprint saved');
    if (!result.ok) {
      setError(result.error === 'active-session'
        ? 'The active focus task changed. Your draft is kept; finish that session before saving.'
        : result.error === 'unchanged'
          ? 'There are no changes to save.'
          : 'Goals changed outside Studio. Saving is blocked to avoid overwriting them. Your draft is still open; compare it with the latest plan before starting again.');
      return;
    }
    panelDirty.current = false; onClose();
  };
  const toggle = (id: string) => { setSelecting(true); setSelected((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]); };
  const stopSelecting = () => { setSelected([]); setSelecting(false); };
  const toggleVisible = () => {
    setSelecting(true);
    setSelected((ids) => allVisibleSelected ? ids.filter((id) => !visible.some((node) => node.id === id)) : [...new Set([...ids, ...visible.map((node) => node.id)])]);
  };
  const addHere = () => openPanel({ type: 'add', ids: parentIds, kind: parents.length ? 'items' : 'goal' });
  // Long-press-to-select: threshold 420ms; if pointer moves more than 6px it becomes a scroll/drag.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOrigin = useRef<{ x: number; y: number } | null>(null);
  const pressCancelled = useRef(false);
  const startPress = (id: string, x: number, y: number) => {
    pressCancelled.current = false;
    pressOrigin.current = { x, y };
    pressTimer.current = setTimeout(() => {
      if (!pressCancelled.current) toggle(id);
    }, 420);
  };
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null; } };
  const movePress = (x: number, y: number) => {
    if (pressOrigin.current && (Math.abs(x - pressOrigin.current.x) > 6 || Math.abs(y - pressOrigin.current.y) > 6)) {
      pressCancelled.current = true; cancelPress();
    }
  };
  const row = (node: GoalNode) => <div key={node.id} className={'studio-item' + (selected.includes(node.id) ? ' is-selected' : '')}
    onPointerDown={(e) => { if (!selecting) startPress(node.id, e.clientX, e.clientY); }}
    onPointerMove={(e) => movePress(e.clientX, e.clientY)}
    onPointerUp={cancelPress} onPointerCancel={cancelPress}>
    {selecting ? <button type="button" className="studio-icon-button studio-select-box" aria-label={`Select ${node.title}`} aria-pressed={selected.includes(node.id)} onClick={() => toggle(node.id)}>{selected.includes(node.id) ? <CheckSquare2 size={19} /> : <Square size={19} />}</button> : <span className="studio-item-icon">{itemIcon(node)}</span>}
    <button type="button" className="studio-item-label" onClick={() => selecting ? toggle(node.id) : visit([node.id])}><strong>{node.title}{node.pinned && <Pin size={11} />}</strong><span>{node.children.length ? `${node.children.length} items` : node.steps?.length ? `${node.steps.length} checklist steps` : 'No items inside'}{node.completed ? ' · Complete' : node.todayTaskId ? ' · Scheduled' : ''}</span></button>
    {!selecting && <button type="button" className="studio-icon-button" aria-label={`Edit ${node.title}`} onClick={() => openPanel({ type: 'edit', ids: [node.id] })}><Pencil size={15} /></button>}
    <button type="button" className="studio-icon-button" aria-label={`Open contents of ${node.title}`} onClick={() => visit([node.id])}><ChevronRight size={17} /></button>
  </div>;
  const panelTitle = panel?.type === 'add' ? panel.kind === 'steps' ? 'Add checklist steps' : panel.kind === 'goal' ? 'Add goals' : 'Add items'
    : panel?.type === 'edit' ? panelNodes.length === 1 ? 'Edit item' : `Edit ${panelNodes.length} items`
    : panel?.type === 'checklist' ? 'Edit checklist' : panel?.type === 'remove' ? 'Remove from blueprint?'
    : panel?.type === 'selection' ? `${selected.length} selected` : panel?.type === 'ai-plan' ? 'Plan with AI' : 'Review blueprint';
  const removeRoots = topStudioSelection(draft, panelIds);
  const removeCount = countBlueprintNodes(nodesAt(draft, removeRoots));
  const removeLocked = removeRoots.some((id) => activePath.includes(id));

  // Smart contextual action for selection bar
  const selectionRoots = topStudioSelection(draft, selected);
  const allEndpoints = selectedNodes.length > 0 && selectedNodes.every((node) => node.kind !== 'goal' && isGoalEndpoint(node));
  const canAddInsideSelection = selectedNodes.every((node) => canAddInside(node));

  return <Overlay open={open} onClose={goBack} align="full" scrim={false}>
    <div className="studio">
      <div ref={workspaceRef} className="studio-workspace" aria-hidden={Boolean(panel || confirmation) || undefined}>
        <header className="studio-header">
          <button type="button" className="studio-icon-button" aria-label="Back in Studio" onClick={goBack}><ArrowLeft size={20} /></button>
          <div className="studio-header-title"><Wand2 size={18} /><div><h1>Blueprint Studio</h1><span>{changed ? 'Unsaved draft' : 'Plan & organise'}</span></div></div>
          <button type="button" className="studio-save" disabled={!changed} onClick={() => openPanel({ type: 'review' })}>Review</button>
          <button type="button" className="studio-icon-button" aria-label="Exit Blueprint Studio" onClick={requestExit}><X size={19} /></button>
        </header>
        <nav ref={breadcrumbRef} className="studio-breadcrumb" aria-label="Blueprint location">
          <button type="button" onClick={() => visit([])}>All goals</button>
          {path.map((node) => <span key={node.id}><ChevronRight size={12} /><button type="button" aria-current={node.id === current?.id ? 'location' : undefined} onClick={() => visit([node.id])}>{node.title}</button></span>)}
          {multi && <span><ChevronRight size={12} /><strong>{parents.length} branches</strong></span>}
        </nav>
        <div ref={scrollRef} className="studio-scroll" onTouchStart={(event) => {
          if ((event.target as HTMLElement).closest('button, input, textarea, summary')) return;
          touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
        }} onTouchEnd={(event) => {
          const start = touchStart.current; touchStart.current = null;
          if (start && event.changedTouches[0].clientX - start.x > 70 && Math.abs(event.changedTouches[0].clientY - start.y) < 35) goBack();
        }}>
          <div className="studio-location-title"><div><span>{multi ? 'CONTENTS OF YOUR SELECTION' : current ? current.kind === 'goal' ? 'GOAL' : current.children.length ? 'BRANCH' : 'TASK' : 'YOUR BLUEPRINTS'}</span><h2>{multi ? `Inside ${parents.length} branches` : current?.title ?? 'All goals'}</h2></div>{current && <button type="button" className="studio-icon-button" aria-label="Edit current item" onClick={() => openPanel({ type: 'edit', ids: [current.id] })}><Pencil size={17} /></button>}</div>
          {current?.description && <p className="studio-parent-description">{current.description}</p>}
          <div className="studio-toolbar">
            <StudioButton onClick={addHere} disabled={parents.some((node) => !canAddInside(node))}><Plus size={16} />{multi ? `Add to ${parents.length} branches` : current ? 'Add item' : 'Add goal'}</StudioButton>
            {!current && !multi && <StudioButton quiet onClick={() => openPanel({ type: 'ai-plan' })}><Sparkles size={15} /> Plan with AI</StudioButton>}
          </div>
          {current && !canAddInside(current) && <p className="studio-context">This task has recorded work or checklist steps. Edit its checklist below.</p>}
          {(sections.reduce((sum, section) => sum + section.children.length, 0) > 7 || query || multi) && <label className="studio-search"><Search size={16} /><input aria-label="Find items in this view" placeholder="Find an item…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <button type="button" aria-label="Clear filter" onClick={() => setQuery('')}><X size={14} /></button>}</label>}
          {(selecting || query) && <div className="studio-selection-heading"><span>{visible.length} {query ? 'matches' : 'items'}</span>{query && <button type="button" className="studio-exact-toggle" aria-pressed={exactMatch} onClick={() => setExactMatch(!exactMatch)}>{exactMatch && <Check size={12} />} Exact name</button>}<button type="button" disabled={!visible.length} onClick={toggleVisible}>{allVisibleSelected ? 'Deselect visible' : query ? 'Select matches' : 'Select visible'}</button></div>}
          {sections.map(({ parent, children }) => {
            const shown = children.filter(matching);
            return <section key={parent?.id ?? 'roots'} className={'studio-branch-section' + (multi ? ' is-multi' : '')} aria-label={parent?.title ?? 'Goals'}>
              {multi && <header className="studio-source-heading"><span><span>{studioItemPath(draft, parent!.id)}</span><strong>{parent!.title}</strong></span><button type="button" className="studio-icon-button" aria-label={`Open branch ${parent!.title}`} onClick={() => visit([parent!.id])}><FolderOpen size={17} /></button></header>}
              {shown.length > 0 && <div className="studio-items">{shown.map(row)}</div>}
              {parent && parent.kind !== 'goal' && children.length === 0 && <div className="studio-checklist">
                <header><span><ListChecks size={16} /> Checklist <small>{parent.steps?.length ?? 0}</small></span>{Boolean(parent.steps?.length) && <button type="button" onClick={() => openPanel({ type: 'checklist', ids: [parent.id] })}>Edit steps</button>}</header>
                {(parent.steps ?? []).map((step, index) => <div key={index} className={parent.stepDone?.[index] ? 'is-done' : ''}>{parent.stepDone?.[index] ? <Check size={14} /> : <Circle size={13} />}<span>{step}</span></div>)}
                <button type="button" className="studio-inline-add" onClick={() => openPanel({ type: 'add', ids: [parent.id], kind: 'steps' })}><Plus size={15} /> Add steps</button>
              </div>}
              {children.length === 0 && (!parent || parent.kind === 'goal') && <div className="studio-empty"><FolderOpen size={26} /><h3>{parent ? 'Your goal starts here' : 'A clear plan starts here'}</h3><p>{parent ? 'Add the first item. Build deeper whenever you need.' : 'Create a goal, then add the items inside it.'}</p></div>}
              {children.length > 0 && shown.length === 0 && <p className="studio-context studio-no-matches">No matching items{multi ? ' in this branch' : ''}.</p>}
            </section>;
          })}
        </div>
        {selected.length > 0 && <div className="studio-selection-bar">
          <div className="studio-selection-bar-header">
            <button type="button" className="studio-selection-count" onClick={() => openPanel({ type: 'selection' })}>
              {selected.length} selected{(() => {
                const branches = new Set(selected.map((id) => {
                  const path = findBlueprintPath(draft, id);
                  return path.length > 1 ? path[path.length - 2]?.id ?? 'root' : 'root';
                }));
                return branches.size > 1 ? ` · ${branches.size} branches` : '';
              })()}
              <ChevronRight size={13} />
            </button>
            <button type="button" className="studio-selection-stop" onClick={stopSelecting}>Stop selecting</button>
          </div>
          <div className="studio-selection-actions">
            <button type="button" aria-label="Edit selected" onClick={() => openPanel({ type: 'edit', ids: selected })}><Pencil size={17} /><span>Edit</span></button>
            <button type="button" aria-label="Move selected" onClick={() => setMoveIds(selected)}><FolderInput size={17} /><span>Move</span></button>
            <button type="button" aria-label="Duplicate selected" onClick={() => { apply(duplicateStudioItems(draft, selected), `Duplicated ${selectionRoots.length} item${selectionRoots.length === 1 ? '' : 's'}`); stopSelecting(); }}><Copy size={17} /><span>Duplicate</span></button>
            <button type="button" aria-label="Reorder up" onClick={() => apply(reorderStudioItems(draft, selected, 'up'), 'Moved items up')}><ArrowUp size={17} /><span>Up</span></button>
            <button type="button" aria-label="Reorder down" onClick={() => apply(reorderStudioItems(draft, selected, 'down'), 'Moved items down')}><ArrowDown size={17} /><span>Down</span></button>
            <button type="button" aria-label="Pin / unpin selected" onClick={() => apply(patchStudioItems(draft, Object.fromEntries(selected.map((id) => [id, { pinned: !selectedNodes.every((n) => n.pinned) }]))), 'Changed pins')}><Pin size={17} /><span>{selectedNodes.every((n) => n.pinned) ? 'Unpin' : 'Pin'}</span></button>
            <button type="button" className="studio-selection-delete" aria-label="Remove selected" onClick={() => openPanel({ type: 'remove', ids: selected })}><Trash2 size={17} /><span>Delete</span></button>
          </div>
          {allEndpoints
            ? <button type="button" className="studio-selection-contextual" onClick={() => openPanel({ type: 'add', ids: selected, kind: 'steps' })}><ListChecks size={14} /> Add checklist steps to {selected.length} task{selected.length === 1 ? '' : 's'}</button>
            : canAddInsideSelection
              ? <button type="button" className="studio-selection-contextual" onClick={() => openPanel({ type: 'add', ids: selectionRoots, kind: 'items' })}><Plus size={14} /> Add items inside selection</button>
              : null}
        </div>}
        <footer className="studio-draft-footer"><span role="status">{status || 'Changes stay in this draft until you save.'}</span><div><button type="button" className="studio-icon-button" aria-label="Undo draft edit" disabled={!past.length} onClick={undo}><Undo2 size={17} /></button><button type="button" className="studio-icon-button" aria-label="Redo draft edit" disabled={!future.length} onClick={redo}><Redo2 size={17} /></button></div></footer>
      </div>
      {panel && <StudioPanel title={panelTitle} onClose={dismissPanel} inactive={Boolean(confirmation)}>
        {panel.type === 'add' && <StudioAddForm goals={draft} ids={panel.ids} kind={panel.kind} onApply={apply} onDirty={markDirty} />}
        {panel.type === 'edit' && <StudioEditForm goals={draft} ids={panel.ids} onApply={apply} onDirty={markDirty} />}
        {panel.type === 'checklist' && <StudioChecklistForm goals={draft} ids={panel.ids} onApply={apply} onDirty={markDirty} />}
        {panel.type === 'selection' && <StudioSelectionList goals={draft} ids={selected} onToggle={toggle} />}
        {panel.type === 'ai-plan' && <AIPlanFlow goals={draft} onApply={apply} onDirty={markDirty} />}
        {panel.type === 'remove' && <><div className="studio-panel-body"><StudioTargets goals={draft} nodes={nodesAt(draft, removeRoots)} /><p>Remove {removeCount} item{removeCount === 1 ? '' : 's'}, including anything inside? Undo stays available in this draft.</p><p className="studio-context">Linked current Today plans are removed too. Past focus history stays.</p>{removeLocked && <p role="alert" className="studio-error">One item contains your active focus task. Finish the session first.</p>}</div><footer className="studio-panel-footer"><StudioButton quiet onClick={dismissPanel}>Keep items</StudioButton><StudioButton danger disabled={removeLocked} onClick={() => { apply(removeBlueprintNodes(draft, removeRoots), `Removed ${removeCount} items`); stopSelecting(); }}>Remove {removeCount} items</StudioButton></footer></>}
        {panel.type === 'review' && <><div className="studio-panel-body"><p className="studio-context">{past.length} draft edit{past.length === 1 ? '' : 's'} · {countBlueprintNodes(draft)} total items</p><StudioChangeReview before={baseGoals} after={draft} /><details className="studio-disclosure"><summary>View full blueprint <ChevronRight size={14} /></summary><StudioReviewTree nodes={draft} /></details></div><footer className="studio-panel-footer"><StudioButton quiet onClick={dismissPanel}>Keep editing</StudioButton><StudioButton disabled={!changed} onClick={save}><Check size={16} /> Save blueprint</StudioButton></footer></>}
        {error && <p role="alert" className="studio-error studio-panel-error">{error}</p>}
      </StudioPanel>}
      {moveIds && <StudioDrillDownPicker
        goals={draft}
        ids={moveIds}
        onClose={() => setMoveIds(null)}
        onApply={(next, summary) => { apply(next, summary); setMoveIds(null); stopSelecting(); }}
      />}
      {confirmation && <StudioPanel title={confirmation === 'form' ? 'Discard this edit?' : 'Leave without saving?'} onClose={() => setConfirmation(null)}>
        <div className="studio-panel-body"><p>{confirmation === 'form' ? 'This edit has not been applied. Your other draft changes will stay.' : 'Your unsaved blueprint changes will be discarded.'}</p></div>
        <footer className="studio-panel-footer"><StudioButton quiet onClick={() => setConfirmation(null)}>Keep editing</StudioButton><StudioButton danger onClick={() => {
          panelDirty.current = false;
          if (confirmation === 'exit') onClose();
          else { setPanel(null); setConfirmation(null); }
        }}>Discard {confirmation === 'form' ? 'edit' : 'draft'}</StudioButton></footer>
      </StudioPanel>}
    </div>
  </Overlay>;
}
