import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, ChevronDown, ChevronRight, Copy, Folder, LockKeyhole, Plus, Trash2 } from 'lucide-react';
import type { GoalNode } from '../../types';
import { findGoal, hasGoalExecutionState, isGoalEndpoint } from '../../lib/goalTree';
import { addBlueprintChildren, addBlueprintSteps, flattenBlueprint, makeBlueprintNode, normalizeBlueprintTitles, numberedBlueprintTitles } from '../../lib/blueprintStudio';
import { canMoveStudioItems, editStudioSteps, moveStudioItems, patchStudioItems, studioChangeDetails, studioItemPath, type StudioPatch, type StudioStepEdit } from '../../lib/studioWorkspace';
import { fieldClass, StudioButton, StudioField, StudioTabs, StudioTargets } from './StudioControls';

type Apply = (goals: GoalNode[], summary: string) => void;
type FormProps = { goals: GoalNode[]; ids: string[]; onApply: Apply; onDirty: (dirty: boolean) => void };
const getNodes = (goals: GoalNode[], ids: string[]) => ids.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));

export function StudioAddForm({ goals, ids, kind, onApply, onDirty }: FormProps & { kind: 'goal' | 'items' | 'steps' }) {
  const parents = useMemo(() => getNodes(goals, ids), [goals, ids]);
  const [mode, setMode] = useState<'one' | 'list' | 'numbered'>('one');
  const [text, setText] = useState('');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('1');
  const [count, setCount] = useState('5');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  useEffect(() => onDirty(Boolean(text.trim() || prefix.trim() || description.trim())), [text, prefix, description, onDirty]);
  const names = mode === 'numbered'
    ? prefix.trim() && start !== '' && count !== '' && Number.isInteger(Number(start)) && Number(start) >= 0 && Number.isInteger(Number(count)) && Number(count) > 0 && Number(count) <= 100
      ? numberedBlueprintTitles(prefix, Number(start), Number(count)) : []
    : normalizeBlueprintTitles(mode === 'list' ? text.split(/\r?\n/) : [text]);
  const blocked = kind === 'items' ? parents.filter((node) => node.kind !== 'goal' && isGoalEndpoint(node) && hasGoalExecutionState(node)) : [];
  const expected = kind === 'goal' ? names.length : parents.reduce((total, parent) => {
    const existing = new Set((kind === 'steps' ? parent.steps ?? [] : parent.children.map((child) => child.title)).map((title) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
    return total + names.filter((name) => !existing.has(name.toLocaleLowerCase())).length;
  }, 0);
  const noun = kind === 'steps' ? 'step' : kind === 'goal' ? 'goal' : 'item';
  const submit = () => {
    if (names.length === 0 || blocked.length > 0 || expected === 0) return;
    let next: GoalNode[]; let newIds: string[] = [];
    if (kind === 'goal') {
      const roots = names.map((title) => makeBlueprintNode('goal', title));
      next = [...goals, ...roots]; newIds = roots.map((node) => node.id);
    } else if (kind === 'steps') next = addBlueprintSteps(goals, ids, names).goals;
    else { const result = addBlueprintChildren(goals, ids, 'node', names); next = result.goals; newIds = result.createdIds; }
    if (description.trim() && newIds.length) next = patchStudioItems(next, Object.fromEntries(newIds.map((id) => [id, { description: description.trim() }])));
    if (JSON.stringify(next) === JSON.stringify(goals)) { setError('These names already exist here.'); return; }
    onApply(next, `Added ${expected} ${noun}${expected === 1 ? '' : 's'}${parents.length === 1 ? ` in ${parents[0].title}` : parents.length > 1 ? ` across ${parents.length} branches` : ''}`);
  };
  return <>
    <div className="studio-panel-body">
      <StudioTargets goals={goals} nodes={parents} />
      {parents.length > 1 && <p className="studio-context">Add the same {noun}s to each selected {kind === 'steps' ? 'task' : 'branch'}.</p>}
      <StudioTabs value={mode} onChange={(value) => { setMode(value); setError(''); }} options={[{ value: 'one', label: 'One' }, { value: 'list', label: 'List' }, { value: 'numbered', label: 'Numbered' }]} />
      {mode === 'numbered' ? <>
        <StudioField label="Name"><input className={fieldClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. Lecture" /></StudioField>
        <div className="studio-two-columns"><StudioField label="Start at"><input className={fieldClass} type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></StudioField><StudioField label="How many"><input className={fieldClass} type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} /></StudioField></div>
      </> : <StudioField label={mode === 'one' ? `${noun[0].toUpperCase()}${noun.slice(1)} name` : 'One name per line'}>
        {mode === 'one' ? <input className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'goal' ? 'e.g. GATE 2027' : kind === 'steps' ? 'e.g. Review notes' : 'e.g. Network Theory'} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
          : <textarea className={fieldClass} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'steps' ? 'Watch\nPractise\nReview' : 'Chapter 1\nChapter 2\nChapter 3'} />}
      </StudioField>}
      {kind !== 'steps' && <details className="studio-disclosure"><summary>Description <ChevronDown size={14} /></summary><StudioField label="Description (optional)"><textarea className={fieldClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Useful context for these items" /></StudioField></details>}
      {names.length > 0 && <div className="studio-add-preview"><span>{names.slice(0, 4).join(' · ')}{names.length > 4 ? ` · +${names.length - 4}` : ''}</span><strong>{expected} new {noun}{expected === 1 ? '' : 's'}</strong></div>}
      {blocked.length > 0 && <p role="alert" className="studio-error">{blocked.length} selected task{blocked.length === 1 ? '' : 's'} already contain steps or recorded work. Add checklist steps instead.</p>}
      {error && <p role="alert" className="studio-error">{error}</p>}
    </div>
    <footer className="studio-panel-footer"><StudioButton onClick={submit} disabled={expected === 0 || blocked.length > 0}><Plus size={15} /> Add {expected || ''} {noun}{expected === 1 ? '' : 's'}</StudioButton></footer>
  </>;
}

type Fields = { title: string; description: string; startDate: string; endDate: string; pinned: boolean };
const fieldsOf = (node: GoalNode): Fields => ({ title: node.title, description: node.description ?? '', startDate: node.startDate ?? '', endDate: node.endDate ?? '', pinned: Boolean(node.pinned) });
const fieldPatch = (fields: Fields): StudioPatch => ({ title: fields.title.trim(), description: fields.description.trim() || undefined, startDate: fields.startDate || undefined, endDate: fields.endDate || undefined, pinned: fields.pinned });

function ItemFields({ fields, onChange, compact = false }: { fields: Fields; onChange: (fields: Fields) => void; compact?: boolean }) {
  return <div className="studio-form-fields">
    <StudioField label="Name"><input className={fieldClass} value={fields.title} onChange={(e) => onChange({ ...fields, title: e.target.value })} /></StudioField>
    <StudioField label="Description"><textarea className={fieldClass} rows={2} value={fields.description} onChange={(e) => onChange({ ...fields, description: e.target.value })} placeholder="Optional" /></StudioField>
    <details className="studio-disclosure" open={!compact && Boolean(fields.startDate || fields.endDate)}><summary>Dates & pin <ChevronDown size={14} /></summary><div className="studio-two-columns">
      <StudioField label="Start date"><input className={fieldClass} type="date" value={fields.startDate} onChange={(e) => onChange({ ...fields, startDate: e.target.value })} /></StudioField>
      <StudioField label="Deadline"><input className={fieldClass} type="date" min={fields.startDate || undefined} value={fields.endDate} onChange={(e) => onChange({ ...fields, endDate: e.target.value })} /></StudioField>
    </div><label className="studio-check-label"><input type="checkbox" checked={fields.pinned} onChange={(e) => onChange({ ...fields, pinned: e.target.checked })} /> Pin for quick access</label></details>
  </div>;
}

export function StudioEditForm({ goals, ids, onApply, onDirty }: FormProps) {
  const nodes = useMemo(() => getNodes(goals, ids), [goals, ids]);
  const [mode, setMode] = useState<'together' | 'individual'>('together');
  const [modeNotice, setModeNotice] = useState(false);
  const [edits, setEdits] = useState<Record<string, Fields>>(() => Object.fromEntries(nodes.map((node) => [node.id, fieldsOf(node)])));
  const [enabled, setEnabled] = useState({ title: false, description: false, dates: false });
  const [shared, setShared] = useState<Fields>(() => ({ ...fieldsOf(nodes[0]), title: nodes.every((n) => n.title === nodes[0].title) ? nodes[0].title : '', description: nodes.every((n) => n.description === nodes[0].description) ? nodes[0].description ?? '' : '', startDate: '', endDate: '' }));
  const single = nodes.length === 1;
  const patches: Record<string, StudioPatch> = {};
  if (single || mode === 'individual') nodes.forEach((node) => { if (JSON.stringify(edits[node.id]) !== JSON.stringify(fieldsOf(node))) patches[node.id] = fieldPatch(edits[node.id]); });
  else nodes.forEach((node) => {
    const patch: StudioPatch = {};
    if (enabled.title) patch.title = shared.title.trim();
    if (enabled.description) patch.description = shared.description.trim() || undefined;
    if (enabled.dates) { patch.startDate = shared.startDate || undefined; patch.endDate = shared.endDate || undefined; }
    if (Object.keys(patch).some((key) => patch[key as keyof StudioPatch] !== node[key as keyof StudioPatch])) patches[node.id] = patch;
  });
  const dirty = Object.keys(patches).length > 0;
  const valid = Object.entries(patches).every(([id, patch]) => {
    const next = { ...findGoal(goals, id)!, ...patch };
    return next.title.trim() && !(next.startDate && next.endDate && next.endDate < next.startDate);
  });
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return <>
    <div className="studio-panel-body">
      <StudioTargets goals={goals} nodes={nodes} />
      {!single && <StudioTabs value={mode} onChange={(next) => { if (next === mode) return; if (dirty) setModeNotice(true); else { setMode(next); setModeNotice(false); } }} options={[{ value: 'together', label: 'Same edit for all' }, { value: 'individual', label: 'Individually' }]} />}
      {modeNotice && dirty && <p role="status" className="studio-context">Apply or cancel this edit before switching modes.</p>}
      {single ? <ItemFields fields={edits[nodes[0].id]} onChange={(value) => setEdits({ [nodes[0].id]: value })} /> : mode === 'individual' ? <div className="studio-individual-list">{nodes.map((node) => <details key={node.id}>
        <summary><span><strong>{edits[node.id].title || node.title}</strong><span>{studioItemPath(goals, node.id)}</span></span><ChevronDown size={15} /></summary>
        <ItemFields compact fields={edits[node.id]} onChange={(value) => setEdits((current) => ({ ...current, [node.id]: value }))} />
      </details>)}</div> : <div className="studio-bulk-fields">
        <label className="studio-check-label"><input type="checkbox" checked={enabled.title} onChange={(e) => setEnabled({ ...enabled, title: e.target.checked })} /> Change name</label>
        {enabled.title && <StudioField label="New name for all"><input className={fieldClass} value={shared.title} onChange={(e) => setShared({ ...shared, title: e.target.value })} placeholder="Leave different names unchanged by unchecking above" /></StudioField>}
        <label className="studio-check-label"><input type="checkbox" checked={enabled.description} onChange={(e) => setEnabled({ ...enabled, description: e.target.checked })} /> Change description</label>
        {enabled.description && <StudioField label="Description for all"><textarea className={fieldClass} rows={3} value={shared.description} onChange={(e) => setShared({ ...shared, description: e.target.value })} placeholder="Blank clears descriptions" /></StudioField>}
        <label className="studio-check-label"><input type="checkbox" checked={enabled.dates} onChange={(e) => setEnabled({ ...enabled, dates: e.target.checked })} /> Change dates</label>
        {enabled.dates && <div className="studio-two-columns"><StudioField label="Start date"><input className={fieldClass} type="date" value={shared.startDate} onChange={(e) => setShared({ ...shared, startDate: e.target.value })} /></StudioField><StudioField label="Deadline"><input className={fieldClass} type="date" min={shared.startDate || undefined} value={shared.endDate} onChange={(e) => setShared({ ...shared, endDate: e.target.value })} /></StudioField></div>}
        <p className="studio-context">Only checked fields change.</p>
      </div>}
      {!valid && <p role="alert" className="studio-error">Use a name and a deadline on or after the start date.</p>}
    </div>
    <footer className="studio-panel-footer"><StudioButton disabled={!dirty || !valid} onClick={() => onApply(patchStudioItems(goals, patches), `Edited ${Object.keys(patches).length} item${Object.keys(patches).length === 1 ? '' : 's'}`)}><Check size={15} /> Apply{single ? ' edit' : ` to ${Object.keys(patches).length} items`}</StudioButton></footer>
  </>;
}

export function StudioChecklistForm({ goals, ids, onApply, onDirty }: FormProps) {
  const nodes = useMemo(() => getNodes(goals, ids), [goals, ids]);
  const matches = useMemo(() => {
    const map = new Map<string, { title: string; entries: { nodeId: string; index: number; locked: boolean }[] }>();
    nodes.forEach((node) => (node.steps ?? []).forEach((title, index) => {
      const key = title.trim().toLocaleLowerCase(); const match = map.get(key) ?? { title, entries: [] };
      match.entries.push({ nodeId: node.id, index, locked: Boolean(node.todayTaskId || node.stepDone?.[index]) }); map.set(key, match);
    }));
    return [...map.entries()];
  }, [nodes]);
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [removals, setRemovals] = useState<string[]>([]);
  const edits: StudioStepEdit[] = matches.flatMap(([key, match]) => match.entries.flatMap((entry) => {
    if (removals.includes(key) && !entry.locked) return [{ nodeId: entry.nodeId, index: entry.index, title: null } as StudioStepEdit];
    if (renames[key] !== undefined && renames[key].trim() !== match.title) return [{ nodeId: entry.nodeId, index: entry.index, title: renames[key].trim() }];
    return [];
  }));
  const dirty = edits.length > 0;
  useEffect(() => onDirty(dirty), [dirty, onDirty]);
  return <>
    <div className="studio-panel-body"><StudioTargets goals={goals} nodes={nodes} />
      {matches.length === 0 ? <p className="studio-context">No checklist steps yet. Use Add steps to create some.</p> : <div className="studio-step-edits">{matches.map(([key, match]) => {
        const removed = removals.includes(key); const removable = match.entries.filter((entry) => !entry.locked).length;
        return <div key={key} className={removed ? 'is-removed' : ''}>
          <div className="studio-step-edit-row"><input aria-label={`Step name: ${match.title}`} className={fieldClass} value={renames[key] ?? match.title} disabled={removed} onChange={(e) => setRenames({ ...renames, [key]: e.target.value })} />
            <button type="button" className="studio-icon-button" disabled={removable === 0} aria-label={`${removed ? 'Keep' : 'Remove'} step: ${match.title}`} onClick={() => setRemovals((current) => removed ? current.filter((value) => value !== key) : [...current, key])}>{removable === 0 ? <LockKeyhole size={14} /> : removed ? <Plus size={15} /> : <Trash2 size={15} />}</button></div>
          <span>{match.entries.length} cop{match.entries.length === 1 ? 'y' : 'ies'}{removable < match.entries.length ? ` · ${match.entries.length - removable} completed or scheduled, kept on removal` : ''}</span>
        </div>;
      })}</div>}
    </div>
    <footer className="studio-panel-footer"><StudioButton disabled={!dirty || edits.some((edit) => edit.title !== null && !edit.title.trim())} onClick={() => onApply(editStudioSteps(goals, edits), `Edited ${edits.length} checklist step${edits.length === 1 ? '' : 's'}`)}><Check size={15} /> Apply checklist edits</StudioButton></footer>
  </>;
}

export function StudioMoveForm({ goals, ids, onApply }: Omit<FormProps, 'onDirty'>) {
  const [destinationId, setDestinationId] = useState<string | null | undefined>(undefined);
  const [filter, setFilter] = useState('');
  const destinations = flattenBlueprint(goals).filter((node) => canMoveStudioItems(goals, ids, node.id) && `${node.title} ${studioItemPath(goals, node.id)}`.toLocaleLowerCase().includes(filter.toLocaleLowerCase()));
  const valid = destinationId !== undefined && canMoveStudioItems(goals, ids, destinationId);
  return <>
    <div className="studio-panel-body"><StudioTargets goals={goals} nodes={getNodes(goals, ids)} /><StudioField label="Find destination"><input className={fieldClass} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search branches" /></StudioField>
      <div className="studio-destinations">
        {canMoveStudioItems(goals, ids, null) && <button type="button" aria-pressed={destinationId === null} onClick={() => setDestinationId(null)}><Folder size={16} /><span><strong>All goals</strong><span>Move to the top level</span></span>{destinationId === null && <Check size={15} />}</button>}
        {destinations.map((node) => <button type="button" key={node.id} aria-pressed={destinationId === node.id} onClick={() => setDestinationId(node.id)}><Folder size={16} /><span><strong>{node.title}</strong><span>{studioItemPath(goals, node.id)}</span></span>{destinationId === node.id && <Check size={15} />}</button>)}
      </div>
    </div>
    <footer className="studio-panel-footer"><StudioButton disabled={!valid} onClick={() => { if (destinationId !== undefined) onApply(moveStudioItems(goals, ids, destinationId), `Moved ${ids.length} item${ids.length === 1 ? '' : 's'} to ${destinationId ? findGoal(goals, destinationId)?.title : 'All goals'}`); }}><ArrowRight size={15} /> Move here</StudioButton></footer>
  </>;
}

export function StudioSelectionList({ goals, ids, onToggle }: { goals: GoalNode[]; ids: string[]; onToggle: (id: string) => void }) {
  return <div className="studio-panel-body"><div className="studio-source-list">{getNodes(goals, ids).map((node) => <button type="button" key={node.id} onClick={() => onToggle(node.id)} aria-label={`Deselect ${node.title} in ${studioItemPath(goals, node.id)}`}><Check size={16} /><span><strong>{node.title}</strong><span>{studioItemPath(goals, node.id)}</span></span></button>)}</div></div>;
}

export function StudioAction({ icon, label, detail, onClick, disabled = false, danger = false }: { icon: React.ReactNode; label: string; detail?: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button type="button" className={`studio-action ${danger ? 'is-danger' : ''}`} onClick={onClick} disabled={disabled}>{icon}<span><strong>{label}</strong>{detail && <span>{detail}</span>}</span><ChevronRight size={15} /></button>;
}

export function StudioReviewTree({ nodes }: { nodes: GoalNode[] }) {
  return <ul className="studio-review-tree">{nodes.map((node) => <li key={node.id}>{node.children.length > 0 ? <details><summary><ChevronRight size={13} /><strong>{node.title}</strong><span>{node.children.length}</span></summary><StudioReviewTree nodes={node.children} /></details> : <div><Copy size={12} /><span>{node.title}</span></div>}</li>)}</ul>;
}

export function StudioChangeReview({ before, after }: { before: GoalNode[]; after: GoalNode[] }) {
  const changes = useMemo(() => studioChangeDetails(before, after), [before, after]);
  const entry = (change: typeof changes[number]) => <li key={change.id}><strong>{change.title}</strong><span>{change.path}</span><p>{change.detail}</p></li>;
  return <div className="studio-change-details"><ul>{changes.slice(0, 6).map(entry)}</ul>{changes.length > 6 && <details className="studio-disclosure"><summary>{changes.length - 6} more changed items <ChevronDown size={14} /></summary><ul>{changes.slice(6).map(entry)}</ul></details>}</div>;
}
