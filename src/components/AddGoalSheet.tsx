import { useEffect, useRef, useState } from 'react';
import { ListPlus, Trash2, X } from 'lucide-react';
import type { GoalNode } from '../types';
import { uid } from '../store';
import Overlay from './Overlay';
import StepListEditor, { MAX_STEPS } from './StepListEditor';

interface Props {
  open: boolean;
  parentId: string | null;
  editing?: GoalNode | null;
  onClose: () => void;
  onAddRoot: (node: GoalNode) => void;
  onAddChild: (parentId: string, node: GoalNode) => void;
  onUpdateNode: (id: string, patch: (n: GoalNode) => GoalNode) => void;
  onDeleteNode: (id: string) => void;
}

export default function AddGoalSheet({
  open, parentId, editing, onClose, onAddRoot, onAddChild, onUpdateNode, onDeleteNode,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [showChecklist, setShowChecklist] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editing;
  const isRootGoal = !editing && !parentId;
  const isWorkItem = Boolean(parentId && !editing) || Boolean(editing && editing.kind !== 'goal' && editing.children.length === 0);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setStartDate(editing.startDate ?? '');
      setEndDate(editing.endDate ?? '');
      setSteps(editing.steps && editing.steps.length ? [...editing.steps] : ['']);
      setShowChecklist(Boolean(editing.steps?.length));
    } else {
      setTitle('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setSteps(['']);
      setShowChecklist(false);
    }
    setTimeout(() => titleRef.current?.focus(), 120);
  }, [open, parentId, editing]);

  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS);
    if (isEditing && editing) {
      const prevStepDone = editing.stepDone ?? [];
      const newStepDone = cleanSteps.map((_, i) => prevStepDone[i] ?? false);
      onUpdateNode(editing.id, (n) => ({
        ...n,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        steps: isWorkItem ? cleanSteps : n.steps,
        stepDone: isWorkItem ? newStepDone : n.stepDone,
        completed: isWorkItem && cleanSteps.length > 0 ? newStepDone.every(Boolean) : n.completed,
      }));
    } else {
      const node: GoalNode = {
        id: uid('goal'),
        kind: parentId ? 'node' : 'goal',
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        steps: parentId ? cleanSteps : undefined,
        stepDone: parentId ? cleanSteps.map(() => false) : undefined,
        completed: false,
        createdAt: Date.now(),
        children: [],
      };
      if (parentId) onAddChild(parentId, node);
      else onAddRoot(node);
    }
    onClose();
  };

  const getHeaderTitle = () => {
    if (isEditing) return `Edit ${editing?.kind === 'goal' ? 'goal' : 'item'}`;
    if (isRootGoal) return 'New Goal';
    return 'Add item';
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel panel-sheet sheet-up p-5 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-content-primary">
            {getHeaderTitle()}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary dark:hover:text-content-primary hover:bg-elevated">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">
              {isRootGoal ? 'Goal Title' : 'Title'}
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={isRootGoal ? 'Name the outcome you want' : 'Name this part of your plan'}
              className="mt-1 w-full bg-surface border border-subtle rounded-xl px-3.5 py-2.5 text-sm text-content-primary placeholder:text-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              className="mt-1 w-full bg-surface border border-subtle rounded-xl px-3.5 py-2.5 text-sm text-content-primary placeholder:text-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors resize-none"
            />
          </div>

          <div className="grid grid-cols-1 cq-grid-2 gap-3">
            <div className="min-w-0">
              <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full min-w-0 max-w-full bg-surface border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary focus:bg-elevated transition-colors"
              />
            </div>
            <div className="min-w-0">
              <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full min-w-0 max-w-full bg-surface border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary focus:bg-elevated transition-colors"
              />
            </div>
          </div>

          {isWorkItem && (showChecklist ? (
            <div className="rounded-xl border border-subtle bg-surface p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Optional checklist</span>
                {(editing?.steps?.length ?? 0) === 0 && (
                  <button type="button" onClick={() => { setShowChecklist(false); setSteps(['']); }} className="text-[11px] font-semibold text-content-muted">
                    Remove
                  </button>
                )}
              </div>
              <StepListEditor label="Steps" steps={steps} onChange={setSteps} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowChecklist(true)}
              className="w-full min-h-11 rounded-xl border border-dashed border-subtle bg-surface px-3.5 text-left text-[13px] font-semibold text-content-secondary inline-flex items-center gap-2 hover:border-primary/40 hover:text-primary"
            >
              <ListPlus size={16} /> Add an optional checklist
            </button>
          ))}

          <div className="flex gap-2">
            {isEditing && editing && (
              <button
                onClick={() => { onDeleteNode(editing.id); onClose(); }}
                className="px-4 py-3 rounded-2xl text-sm font-medium text-error bg-error-soft hover:bg-error/20 border border-error/20 transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={submit}
              disabled={!title.trim()}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-on-primary bg-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isEditing ? 'Save changes' : parentId ? 'Add item' : 'Create goal'}
            </button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}
