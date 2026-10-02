import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Copy, Folder, FolderCheck, FolderInput, LockKeyhole, Plus, Search, Target, Trash2 } from 'lucide-react';
import type { GoalNode } from '../../types';
import { findGoal, hasGoalExecutionState, isGoalEndpoint } from '../../lib/goalTree';
import { addBlueprintChildren, addBlueprintSteps, findBlueprintPath, flattenBlueprint, makeBlueprintNode, normalizeBlueprintTitles, numberedBlueprintTitles } from '../../lib/blueprintStudio';
import { canMoveStudioItems, editStudioSteps, moveStudioItems, patchStudioItems, studioChangeDetails, studioItemPath, type StudioPatch, type StudioStepEdit } from '../../lib/studioWorkspace';
import { fieldClass, StudioButton, StudioField, StudioTabs, StudioTargets } from './StudioControls';

type Apply = (goals: GoalNode[], summary: string) => void;
type FormProps = { goals: GoalNode[]; ids: string[]; onApply: Apply; onDirty: (dirty: boolean) => void };
const getNodes = (goals: GoalNode[], ids: string[]) => ids.map((id) => findGoal(goals, id)).filter((node): node is GoalNode => Boolean(node));

export function StudioAddForm({ goals, ids, kind, onApply, onDirty }: FormProps & { kind: 'goal' | 'items' | 'steps' }) {
  const parents = useMemo(() => getNodes(goals, ids), [goals, ids]);
  const single = parents.length <= 1;
  const [scope, setScope] = useState<'together' | 'individual'>('together');

  // Shared / together state
  const [mode, setMode] = useState<'one' | 'list' | 'numbered'>('one');
  const [text, setText] = useState('');
  const [prefix, setPrefix] = useState('');
  const [start, setStart] = useState('1');
  const [count, setCount] = useState('5');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  // Individual state (per-parent entry configuration)
  type IndivConfig = {
    mode: 'one' | 'list' | 'numbered';
    text: string;
    prefix: string;
    start: string;
    count: string;
  };
  const [indivConfigs, setIndivConfigs] = useState<Record<string, IndivConfig>>(() =>
    Object.fromEntries(parents.map((p) => [p.id, { mode: 'one', text: '', prefix: '', start: '1', count: '5' }]))
  );

  const noun = kind === 'steps' ? 'step' : kind === 'goal' ? 'goal' : 'item';
  const blocked = kind === 'items' ? parents.filter((node) => node.kind !== 'goal' && isGoalEndpoint(node) && hasGoalExecutionState(node)) : [];

  const sharedNames = mode === 'numbered'
    ? prefix.trim() && start !== '' && count !== '' && Number.isInteger(Number(start)) && Number(start) >= 0 && Number.isInteger(Number(count)) && Number(count) > 0 && Number(count) <= 100
      ? numberedBlueprintTitles(prefix, Number(start), Number(count)) : []
    : normalizeBlueprintTitles(mode === 'list' ? text.split(/\r?\n/) : [text]);

  const sharedExpected = kind === 'goal' ? sharedNames.length : parents.reduce((total, parent) => {
    const existing = new Set((kind === 'steps' ? parent.steps ?? [] : parent.children.map((child) => child.title)).map((title) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
    return total + sharedNames.filter((name) => !existing.has(name.toLocaleLowerCase())).length;
  }, 0);

  // Individual names calculation per parent
  const getNamesForConfig = (cfg: IndivConfig): string[] => {
    if (cfg.mode === 'numbered') {
      return cfg.prefix.trim() && cfg.start !== '' && cfg.count !== '' && Number.isInteger(Number(cfg.start)) && Number(cfg.start) >= 0 && Number.isInteger(Number(cfg.count)) && Number(cfg.count) > 0 && Number(cfg.count) <= 100
        ? numberedBlueprintTitles(cfg.prefix, Number(cfg.start), Number(cfg.count))
        : [];
    }
    return normalizeBlueprintTitles(cfg.mode === 'list' ? cfg.text.split(/\r?\n/) : [cfg.text]);
  };

  const individualEntries = useMemo(() => {
    if (scope !== 'individual') return [];
    return parents.map((parent) => {
      const cfg = indivConfigs[parent.id] ?? { mode: 'one', text: '', prefix: '', start: '1', count: '5' };
      const names = getNamesForConfig(cfg);
      const existing = new Set((kind === 'steps' ? parent.steps ?? [] : parent.children.map((child) => child.title)).map((title) => title.trim().replace(/\s+/g, ' ').toLocaleLowerCase()));
      const validNames = names.filter((name) => !existing.has(name.toLocaleLowerCase()));
      return { parent, validNames, cfg };
    });
  }, [indivConfigs, kind, parents, scope]);

  const individualExpected = individualEntries.reduce((sum, entry) => sum + entry.validNames.length, 0);

  const isDirty = scope === 'together'
    ? Boolean(text.trim() || prefix.trim() || description.trim())
    : Object.values(indivConfigs).some((c) => c.text.trim() || c.prefix.trim());

  useEffect(() => onDirty(isDirty), [isDirty, onDirty]);

  const submitTogether = () => {
    if (sharedNames.length === 0 || blocked.length > 0 || sharedExpected === 0) return;
    let next: GoalNode[]; let newIds: string[] = [];
    if (kind === 'goal') {
      const roots = sharedNames.map((title) => makeBlueprintNode('goal', title));
      next = [...goals, ...roots]; newIds = roots.map((node) => node.id);
    } else if (kind === 'steps') {
      next = addBlueprintSteps(goals, ids, sharedNames).goals;
    } else {
      const result = addBlueprintChildren(goals, ids, 'node', sharedNames);
      next = result.goals; newIds = result.createdIds;
    }
    if (description.trim() && newIds.length) {
      next = patchStudioItems(next, Object.fromEntries(newIds.map((id) => [id, { description: description.trim() }])));
    }
    if (JSON.stringify(next) === JSON.stringify(goals)) { setError('These names already exist here.'); return; }
    onApply(next, `Added ${sharedExpected} ${noun}${sharedExpected === 1 ? '' : 's'}${parents.length === 1 ? ` in ${parents[0].title}` : ` across ${parents.length} branches`}`);
  };

  const submitIndividual = () => {
    if (individualExpected === 0 || blocked.length > 0) return;
    let next: GoalNode[] = goals;
    let totalAdded = 0;
    for (const { parent, validNames } of individualEntries) {
      if (validNames.length === 0) continue;
      if (kind === 'steps') {
        const res = addBlueprintSteps(next, [parent.id], validNames);
        next = res.goals;
        totalAdded += res.added;
      } else {
        const res = addBlueprintChildren(next, [parent.id], 'node', validNames);
        next = res.goals;
        totalAdded += res.added;
      }
    }
    if (totalAdded === 0 || JSON.stringify(next) === JSON.stringify(goals)) {
      setError('These names already exist in their respective tasks.');
      return;
    }
    onApply(next, `Added ${totalAdded} ${noun}${totalAdded === 1 ? '' : 's'} across ${parents.length} branches`);
  };

  const submit = scope === 'together' ? submitTogether : submitIndividual;
  const expectedCount = scope === 'together' ? sharedExpected : individualExpected;

  const updateIndiv = (parentId: string, patch: Partial<IndivConfig>) => {
    setIndivConfigs((prev) => ({
      ...prev,
      [parentId]: { ...(prev[parentId] ?? { mode: 'one', text: '', prefix: '', start: '1', count: '5' }), ...patch },
    }));
  };

  return <>
    <div className="studio-panel-body">
      <StudioTargets goals={goals} nodes={parents} />

      {!single && (
        <StudioTabs
          value={scope}
          onChange={(val) => { setScope(val); setError(''); }}
          options={[
            { value: 'together', label: 'Same for all' },
            { value: 'individual', label: 'Individually' },
          ]}
        />
      )}

      {scope === 'together' ? (
        <>
          {parents.length > 1 && <p className="studio-context">Add the same {noun}s to each of the {parents.length} selected items.</p>}
          <StudioTabs value={mode} onChange={(value) => { setMode(value); setError(''); }} options={[{ value: 'one', label: 'One' }, { value: 'list', label: 'List' }, { value: 'numbered', label: 'Numbered' }]} />
          {mode === 'numbered' ? <>
            <StudioField label="Name"><input className={fieldClass} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. Topic or Lecture" /></StudioField>
            <div className="studio-two-columns"><StudioField label="Start at"><input className={fieldClass} type="number" min={0} value={start} onChange={(e) => setStart(e.target.value)} /></StudioField><StudioField label="How many"><input className={fieldClass} type="number" min={1} max={100} value={count} onChange={(e) => setCount(e.target.value)} /></StudioField></div>
          </> : <StudioField label={mode === 'one' ? `${noun[0].toUpperCase()}${noun.slice(1)} name` : 'One name per line'}>
            {mode === 'one' ? <input className={fieldClass} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'goal' ? 'Name your goal' : kind === 'steps' ? 'e.g. Review notes' : 'Name this topic or milestone'} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
              : <textarea className={fieldClass} rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'steps' ? 'Watch\nPractise\nReview' : 'Chapter 1\nChapter 2\nChapter 3'} />}
          </StudioField>}
          {kind !== 'steps' && <details className="studio-disclosure"><summary>Description <ChevronDown size={14} /></summary><StudioField label="Description (optional)"><textarea className={fieldClass} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Useful context for these items" /></StudioField></details>}
          {sharedNames.length > 0 && <div className="studio-add-preview"><span>{sharedNames.slice(0, 4).join(' · ')}{sharedNames.length > 4 ? ` · +${sharedNames.length - 4}` : ''}</span><strong>{sharedExpected} new {noun}{sharedExpected === 1 ? '' : 's'}</strong></div>}
        </>
      ) : (
        <div className="studio-individual-list">
          <p className="studio-context" style={{ padding: '8px 12px 4px' }}>
            Configure items for each selected task:
          </p>
          {parents.map((parent) => {
            const cfg = indivConfigs[parent.id] ?? { mode: 'one', text: '', prefix: '', start: '1', count: '5' };
            const countForThis = getNamesForConfig(cfg).length;
            return (
              <details key={parent.id} open={parents.length <= 4}>
                <summary>
                  <span>
                    <strong>{parent.title}</strong>
                    <span>{studioItemPath(goals, parent.id)}{countForThis > 0 ? ` · ${countForThis} ${noun}${countForThis === 1 ? '' : 's'} planned` : ''}</span>
                  </span>
                  <ChevronDown size={15} />
                </summary>
                <div style={{ padding: '12px 14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <StudioTabs
                    value={cfg.mode}
                    onChange={(m) => updateIndiv(parent.id, { mode: m })}
                    options={[
                      { value: 'one', label: 'One' },
                      { value: 'list', label: 'List' },
                      { value: 'numbered', label: 'Numbered' },
                    ]}
                  />
                  {cfg.mode === 'numbered' ? (
                    <>
                      <StudioField label="Name">
                        <input
                          className={fieldClass}
                          value={cfg.prefix}
                          onChange={(e) => updateIndiv(parent.id, { prefix: e.target.value })}
                          placeholder="e.g. Topic or Lecture"
                        />
                      </StudioField>
                      <div className="studio-two-columns">
                        <StudioField label="Start at">
                          <input
                            className={fieldClass}
                            type="number"
                            min={0}
                            value={cfg.start}
                            onChange={(e) => updateIndiv(parent.id, { start: e.target.value })}
                          />
                        </StudioField>
                        <StudioField label="How many">
                          <input
                            className={fieldClass}
                            type="number"
                            min={1}
                            max={100}
                            value={cfg.count}
                            onChange={(e) => updateIndiv(parent.id, { count: e.target.value })}
                          />
                        </StudioField>
                      </div>
                    </>
                  ) : (
                    <StudioField label={cfg.mode === 'one' ? `${noun[0].toUpperCase()}${noun.slice(1)} name` : 'One name per line'}>
                      {cfg.mode === 'one' ? (
                        <input
                          className={fieldClass}
                          value={cfg.text}
                          onChange={(e) => updateIndiv(parent.id, { text: e.target.value })}
                          placeholder={kind === 'steps' ? 'e.g. Review notes' : 'Name this topic or milestone'}
                          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
                        />
                      ) : (
                        <textarea
                          className={fieldClass}
                          rows={3}
                          value={cfg.text}
                          onChange={(e) => updateIndiv(parent.id, { text: e.target.value })}
                          placeholder={kind === 'steps' ? 'Watch\nPractise\nReview' : 'Subtopic 1\nSubtopic 2\nSubtopic 3'}
                        />
                      )}
                    </StudioField>
                  )}
                </div>
              </details>
            );
          })}
        </div>
      )}

      {blocked.length > 0 && <p role="alert" className="studio-error">{blocked.length} selected task{blocked.length === 1 ? '' : 's'} already contain steps or recorded work. Add checklist steps instead.</p>}
      {error && <p role="alert" className="studio-error">{error}</p>}
    </div>
    <footer className="studio-panel-footer">
      <StudioButton onClick={submit} disabled={expectedCount === 0 || blocked.length > 0}>
        <Plus size={15} /> Add {expectedCount || ''} {noun}{expectedCount === 1 ? '' : 's'}
      </StudioButton>
    </footer>
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

/** Hierarchical drill-down destination picker — replaces StudioMoveForm for Move actions. */
export function StudioDrillDownPicker({ goals, ids, onClose, onApply }: {
  goals: GoalNode[];
  ids: string[];
  onClose: () => void;
  onApply: (next: GoalNode[], summary: string) => void;
}) {
  const [pathIds, setPathIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');

  const currentId = pathIds.length > 0 ? pathIds[pathIds.length - 1] : null;
  const current = currentId ? findGoal(goals, currentId) : null;

  // Breadcrumb path for current level
  const breadcrumb = useMemo(() => currentId ? findBlueprintPath(goals, currentId) : [], [goals, currentId]);

  // Direct children at current level to show as drill-down targets
  const levelChildren = useMemo(() => {
    const rawList = current ? current.children : goals;
    return rawList.filter((node) => {
      // Cannot enter an endpoint that has execution state (it won't accept children)
      if (node.kind !== 'goal' && isGoalEndpoint(node) && hasGoalExecutionState(node)) return false;
      return true;
    });
  }, [current, goals]);

  // Flat search results (only shown when searching)
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const results: { node: GoalNode; path: GoalNode[] }[] = [];
    const walk = (node: GoalNode, path: GoalNode[]) => {
      const cur = [...path, node];
      if (node.title.toLowerCase().includes(q) && !(node.kind !== 'goal' && isGoalEndpoint(node) && hasGoalExecutionState(node))) {
        results.push({ node, path: cur });
      }
      node.children.forEach((child) => walk(child, cur));
    };
    goals.forEach((root) => walk(root, []));
    return results;
  }, [goals, query]);

  const canMove = canMoveStudioItems(goals, ids, currentId);
  const count = ids.length;

  const handleConfirm = () => {
    if (!canMove) return;
    const next = moveStudioItems(goals, ids, currentId);
    const destName = current ? current.title : 'All goals';
    onApply(next, `Moved ${count} item${count === 1 ? '' : 's'} to ${destName}`);
  };

  const drill = (id: string) => { setQuery(''); setPathIds((prev) => [...prev, id]); };
  const goUp = () => setPathIds((prev) => prev.slice(0, -1));
  const jumpTo = (index: number) => { if (index < 0) setPathIds([]); else setPathIds(pathIds.slice(0, index + 1)); };

  return (
    <div className="studio-panel-scrim" role="dialog" aria-modal="true" aria-label="Move items">
      <div className="studio-panel studio-drilldown-panel">
        {/* Header */}
        <div className="studio-panel-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FolderInput size={17} style={{ color: 'var(--primary)', flexShrink: 0 }} />
              <h2>Move {count} item{count === 1 ? '' : 's'}</h2>
            </div>
            <p>Choose the destination branch</p>
          </div>
          <button type="button" className="studio-icon-button" aria-label="Close" onClick={onClose}><ChevronDown size={18} /></button>
        </div>

        {/* Search */}
        <div className="studio-drilldown-search">
          <Search size={14} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for a destination…"
            className={fieldClass}
            aria-label="Search destination"
          />
          {query && <button type="button" aria-label="Clear search" onClick={() => setQuery('')} style={{ color: 'var(--text-muted)', padding: '0 6px' }}>×</button>}
        </div>

        {/* Breadcrumb nav (hidden when searching) */}
        {!query && (
          <div className="studio-drilldown-breadcrumb">
            <button type="button" className="studio-icon-button" onClick={goUp} disabled={pathIds.length === 0} aria-label="Go up one level" style={{ width: 32, height: 32 }}>
              <ArrowLeft size={15} />
            </button>
            <button type="button" className={`studio-drilldown-crumb${currentId === null ? ' is-current' : ''}`} onClick={() => jumpTo(-1)}>All goals</button>
            {breadcrumb.map((node, i) => (
              <span key={node.id} style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <ChevronRight size={11} style={{ color: 'var(--text-muted)' }} />
                <button type="button" className={`studio-drilldown-crumb${i === breadcrumb.length - 1 ? ' is-current' : ''}`} onClick={() => jumpTo(i)}>
                  {node.title}
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Destination highlight */}
        {!query && (
          <div className="studio-drilldown-target">
            <FolderCheck size={16} />
            <div>
              <strong>Moving into:</strong>
              <span>{current ? current.title : 'All goals (top level)'}</span>
            </div>
            {canMove ? <Check size={14} style={{ color: 'var(--secondary)', marginLeft: 'auto', flexShrink: 0 }} /> : null}
          </div>
        )}

        {/* Panel body — level list or search results */}
        <div className="studio-panel-body studio-drilldown-body">
          {query && searchResults ? (
            searchResults.length === 0
              ? <p className="studio-context" style={{ textAlign: 'center', padding: '24px 0' }}>No matching branches</p>
              : searchResults.map(({ node, path }) => {
                  const isInvalid = !canMoveStudioItems(goals, ids, node.id);
                  const bc = path.slice(0, -1).map((n) => n.title).join(' › ');
                  return (
                    <button key={node.id} type="button" disabled={isInvalid} onClick={() => { setPathIds(path.map((n) => n.id)); setQuery(''); }}
                      className={`studio-drilldown-row${isInvalid ? ' is-invalid' : ''}`}>
                      <Folder size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                      <span>
                        <strong>{node.title}</strong>
                        {bc && <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{bc}</span>}
                      </span>
                      {!isInvalid && <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} />}
                    </button>
                  );
                })
          ) : (
            levelChildren.length === 0
              ? <div className="studio-empty" style={{ border: 'none', padding: '16px 0' }}>
                  <p style={{ fontSize: 12 }}>No sub-branches here. Items will land in <strong>{current?.title ?? 'All goals'}</strong>.</p>
                </div>
              : levelChildren.map((child) => {
                  const isInvalid = !canMoveStudioItems(goals, ids, child.id);
                  const isGoal = child.kind === 'goal';
                  return (
                    <button key={child.id} type="button" disabled={isInvalid} onClick={() => drill(child.id)}
                      className={`studio-drilldown-row${isInvalid ? ' is-invalid' : ''}`}>
                      {isGoal ? <Target size={15} style={{ color: 'var(--primary)', flexShrink: 0 }} /> : <Folder size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />}
                      <span>
                        <strong>{child.title}</strong>
                        <span style={{ display: 'block', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {isInvalid ? 'Cannot move here' : `${child.children.length} sub-item${child.children.length === 1 ? '' : 's'}`}
                        </span>
                      </span>
                      {!isInvalid && <ChevronRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} />}
                    </button>
                  );
                })
          )}
        </div>

        {/* Footer */}
        <footer className="studio-panel-footer">
          <StudioButton quiet onClick={onClose}>Cancel</StudioButton>
          <StudioButton disabled={!canMove} onClick={handleConfirm}><FolderInput size={15} /> Move here</StudioButton>
        </footer>
      </div>
    </div>
  );
}

