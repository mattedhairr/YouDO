import { useEffect, useRef, useState } from 'react';
import { ListPlus, Trash2 } from 'lucide-react';
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
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] max-h-[90vh] flex flex-col gap-4">
        {/* Header */}
        <div className="flex flex-col items-center shrink-0 -mt-1 mb-2">
          <div className="w-10 h-1 bg-border-subtle rounded-full opacity-70 mb-3" />
          <h2 className="text-[16px] font-bold text-content-primary">{getHeaderTitle()}</h2>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4">
          {/* Main Info Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={isRootGoal ? 'Name the outcome you want' : 'Name this part of your plan'}
              className="w-full h-12 px-3.5 bg-transparent text-[14px] font-semibold text-content-primary placeholder:text-content-muted outline-none border-b border-subtle"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              className="w-full bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-content-primary placeholder:text-content-muted outline-none resize-none"
            />
          </div>

          {/* Dates Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm flex divide-x divide-subtle">
            <div className="flex-1 p-2">
              <label className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted block mb-1.5">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-10 px-2.5 bg-elevated border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            <div className="flex-1 p-2">
              <label className="px-1.5 text-[10px] font-bold uppercase tracking-wider text-content-muted block mb-1.5">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full h-10 px-2.5 bg-elevated border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Checklist */}
          {isWorkItem && (
            <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
              {showChecklist ? (
                <div className="p-3">
                  <div className="mb-2 flex items-center justify-between gap-3 px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Optional checklist</span>
                    {(editing?.steps?.length ?? 0) === 0 && (
                      <button type="button" onClick={() => { setShowChecklist(false); setSteps(['']); }} className="text-[10px] font-bold uppercase text-content-secondary hover:text-content-primary">
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
                  className="w-full flex items-center justify-between px-4 h-12 text-left hover:bg-elevated transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ListPlus size={16} className="text-primary" />
                    <span className="text-[13px] font-semibold text-content-primary">Add checklist</span>
                  </div>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-2 shrink-0">
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="w-full h-12 rounded-2xl text-[13px] font-bold bg-primary text-on-primary disabled:opacity-40 transition-opacity flex items-center justify-center shadow-sm"
          >
            {isEditing ? 'Save changes' : parentId ? 'Add item' : 'Create goal'}
          </button>
          {isEditing && editing && (
            <button
              onClick={() => { onDeleteNode(editing.id); onClose(); }}
              className="w-full h-12 rounded-2xl text-[13px] font-bold text-error hover:bg-error-soft/50 transition-colors flex items-center justify-center gap-2"
            >
              <Trash2 size={15} /> Delete node
            </button>
          )}
          <button
            onClick={onClose}
            className="w-full h-12 rounded-2xl bg-surface border border-subtle text-[13px] font-bold text-content-secondary hover:text-content-primary hover:bg-elevated transition-all shadow-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    </Overlay>
  );
}
