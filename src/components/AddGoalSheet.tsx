import { useEffect, useRef, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { GoalKind, GoalNode } from '../types';
import { uid } from '../store';

interface Props {
  open: boolean;
  parentId: string | null;
  parentKind?: GoalKind;
  editing?: GoalNode | null;
  onClose: () => void;
  onAddRoot: (node: GoalNode) => void;
  onAddChild: (parentId: string, node: GoalNode) => void;
  onUpdateNode: (id: string, patch: (n: GoalNode) => GoalNode) => void;
  onDeleteNode: (id: string) => void;
}

const kindOptions: { value: GoalKind; label: string }[] = [
  { value: 'phase', label: 'Phase' },
  { value: 'section', label: 'Section' },
  { value: 'task', label: 'Task' },
  { value: 'sub', label: 'Sub' },
  { value: 'leaf', label: 'Leaf' },
];

function getDefaultChildKind(parentKind?: GoalKind): GoalKind {
  if (parentKind === 'goal') return 'phase';
  if (parentKind === 'phase') return 'section';
  if (parentKind === 'section') return 'task';
  if (parentKind === 'task') return 'sub';
  if (parentKind === 'sub') return 'leaf';
  return 'phase';
}

export default function AddGoalSheet({
  open, parentId, parentKind, editing, onClose, onAddRoot, onAddChild, onUpdateNode, onDeleteNode,
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<GoalKind>('goal');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const titleRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editing;
  const isRootGoal = !editing && !parentId;

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTitle(editing.title);
      setDescription(editing.description ?? '');
      setKind(editing.kind);
      setStartDate(editing.startDate ?? '');
      setEndDate(editing.endDate ?? '');
      setSteps(editing.steps && editing.steps.length ? [...editing.steps] : ['']);
    } else {
      setTitle('');
      setDescription('');
      setKind(parentId ? getDefaultChildKind(parentKind) : 'goal');
      setStartDate('');
      setEndDate('');
      setSteps(['']);
    }
    setTimeout(() => titleRef.current?.focus(), 120);
  }, [open, parentId, parentKind, editing]);

  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    const finalKind = isEditing ? kind : (parentId ? kind : 'goal');

    if (isEditing && editing) {
      const prevStepDone = editing.stepDone ?? [];
      const newStepDone = cleanSteps.map((_, i) => prevStepDone[i] ?? false);
      onUpdateNode(editing.id, (n) => ({
        ...n,
        title: title.trim(),
        description: description.trim() || undefined,
        kind: finalKind,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        steps: finalKind === 'leaf' ? cleanSteps : n.steps,
        stepDone: finalKind === 'leaf' ? newStepDone : n.stepDone,
        completed: finalKind === 'leaf' && cleanSteps.length > 0 ? newStepDone.every(Boolean) : n.completed,
      }));
    } else {
      const node: GoalNode = {
        id: uid('goal'),
        kind: finalKind,
        title: title.trim(),
        description: description.trim() || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        steps: finalKind === 'leaf' ? cleanSteps : undefined,
        stepDone: finalKind === 'leaf' ? cleanSteps.map(() => false) : undefined,
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
    if (isEditing) return `Edit ${editing?.kind === 'goal' ? 'Goal' : 'Node'}`;
    if (isRootGoal) return 'New Goal';
    const currentKindLabel = kindOptions.find((k) => k.value === kind)?.label ?? 'Node';
    return `Add ${currentKindLabel}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 modal-backdrop animate-fade-in" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-[#14111F] card rounded-t-3xl p-5 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar shadow-2xl border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {getHeaderTitle()}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
              {isRootGoal ? 'Goal Title' : 'Title'}
            </label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={isRootGoal ? 'e.g. Competitive Exam Prep' : 'e.g. Core Syllabus Module'}
              className="mt-1 w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              className="mt-1 w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2.5 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors resize-none"
            />
          </div>

          {/* Node Type Selector: Only shown when adding a child or editing a child node */}
          {!isRootGoal && (editing?.kind !== 'goal') && (
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Node type</label>
              <div className="mt-1.5 grid grid-cols-5 gap-1.5">
                {kindOptions.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={`py-1.5 rounded-lg text-[10px] font-medium border transition-all ${
                      kind === k.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">End date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="mt-1 w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
              />
            </div>
          </div>

          {kind === 'leaf' && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Micro-progress steps</label>
                <span className="text-[10px] text-slate-300 dark:text-slate-500">{steps.length}/8</span>
              </div>
              <div className="mt-1.5 space-y-2">
                {steps.map((s, i) => (
                  <input
                    key={i}
                    value={s}
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = e.target.value;
                      setSteps(next);
                    }}
                    placeholder={`Step ${i + 1}`}
                    className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
                  />
                ))}
              </div>
              {steps.length < 8 && (
                <button
                  type="button"
                  onClick={() => setSteps([...steps, ''])}
                  className="mt-2 text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors"
                >
                  + Add step
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2">
            {isEditing && editing && (
              <button
                onClick={() => { onDeleteNode(editing.id); onClose(); }}
                className="px-4 py-3 rounded-2xl text-sm font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors inline-flex items-center gap-1.5"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={submit}
              disabled={!title.trim()}
              className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {isEditing ? 'Save' : parentId ? 'Add Node' : 'Create Goal'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
