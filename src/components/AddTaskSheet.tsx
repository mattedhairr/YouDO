import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Priority, Task } from '../types';
import { todayISO, tomorrowISO } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (task: Task) => void;
  initialDate?: string | null;
}

const priorities: { value: Priority; label: string; active: string }[] = [
  { value: 'high', label: 'High', active: 'bg-rose-500 text-white border-rose-500' },
  { value: 'medium', label: 'Medium', active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'low', label: 'Low', active: 'bg-emerald-500 text-white border-emerald-500' },
];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export default function AddTaskSheet({ open, onClose, onAdd, initialDate }: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [targetDate, setTargetDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTargetDate(initialDate ?? todayISO());
      setDeadline('');
      setSteps(['']);
      setTimeout(() => titleRef.current?.focus(), 150);
    }
  }, [open, initialDate]);

  if (!open) return null;

  const submit = () => {
    if (!title.trim()) return;
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);
    onAdd({
      id: uid(),
      title: title.trim(),
      description: description.trim(),
      priority,
      targetDate: targetDate || null,
      deadline: deadline ? new Date(deadline).toISOString() : null,
      steps: cleanSteps,
      progress: 0,
      createdAt: Date.now(),
      order: Date.now(),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 modal-backdrop animate-fade-in" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-[#14111F] card rounded-t-3xl p-5 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar shadow-2xl border-t border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">New Task</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Title</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="What needs doing?"
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

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Priority</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {priorities.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                    priority === p.value
                      ? p.active
                      : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Target date</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTargetDate(todayISO())}
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border transition-all ${
                      targetDate === todayISO()
                        ? 'bg-blue-500 text-white border-blue-500 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetDate(tomorrowISO())}
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border transition-all ${
                      targetDate === tomorrowISO()
                        ? 'bg-blue-500 text-white border-blue-500 shadow-2xs'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400'
                    }`}
                  >
                    Tom.
                  </button>
                </div>
              </div>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Hard deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Sub-steps</label>
              <span className="text-[10px] text-slate-300 dark:text-slate-500">{steps.length}/8</span>
            </div>
            <div className="mt-1.5 space-y-2">
              {steps.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={s}
                    onChange={(e) => {
                      const next = [...steps];
                      next[i] = e.target.value;
                      setSteps(next);
                    }}
                    placeholder={`Step ${i + 1}`}
                    className="flex-1 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl px-3.5 py-2 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none focus:border-blue-400 focus:bg-white dark:focus:bg-slate-600 transition-colors"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                      className="p-2 rounded-lg text-slate-300 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {steps.length < 8 && (
              <button
                type="button"
                onClick={() => setSteps([...steps, ''])}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-blue-600 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition-colors"
              >
                <Plus size={13} /> Add step
              </button>
            )}
          </div>

          <button
            onClick={submit}
            disabled={!title.trim()}
            className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Add Task
          </button>
        </div>
      </div>
    </div>
  );
}
