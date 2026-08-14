import { useEffect, useRef, useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import type { Priority, Task } from '../types';
import { todayISO, tomorrowISO } from '../store';
import Overlay from './Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (task: Task) => void;
  initialDate?: string | null;
}

const priorities: { value: Priority; label: string; active: string }[] = [
  { value: 'high', label: 'High', active: 'bg-error text-white border-error' },
  { value: 'medium', label: 'Medium', active: 'bg-warning text-on-accent border-warning' },
  { value: 'low', label: 'Low', active: 'bg-secondary text-on-accent border-secondary' },
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
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel panel-sheet sheet-up p-5 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-content-primary">New Task</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-content-secondary hover:text-content-primary hover:bg-surface">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Title</label>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="What needs doing?"
              className="mt-1 w-full bg-surface border border-subtle rounded-xl px-3.5 py-2.5 text-sm text-content-primary placeholder-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={2}
              className="mt-1 w-full bg-surface border border-subtle rounded-xl px-3.5 py-2.5 text-sm text-content-primary placeholder-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors resize-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Priority</label>
            <div className="mt-1.5 grid grid-cols-3 gap-2">
              {priorities.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`py-2 rounded-xl text-xs font-medium border transition-all ${
                    priority === p.value
                      ? p.active
                      : 'bg-surface text-content-secondary border-subtle hover:bg-elevated'
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
                <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Target date</label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTargetDate(todayISO())}
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border transition-all ${
                      targetDate === todayISO()
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface text-content-secondary border-subtle hover:border-primary'
                    }`}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setTargetDate(tomorrowISO())}
                    className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded-md border transition-all ${
                      targetDate === tomorrowISO()
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-surface text-content-secondary border-subtle hover:border-primary'
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
                className="w-full bg-surface border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary focus:bg-elevated transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Hard deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-full bg-surface border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary outline-none focus:border-primary focus:bg-elevated transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium uppercase tracking-wide text-content-secondary">Sub-steps</label>
              <span className="text-[10px] text-content-muted">{steps.length}/8</span>
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
                    className="flex-1 bg-surface border border-subtle rounded-xl px-3.5 py-2 text-sm text-content-primary placeholder-content-muted outline-none focus:border-primary focus:bg-elevated transition-colors"
                  />
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSteps(steps.filter((_, idx) => idx !== i))}
                      className="p-2 rounded-lg text-content-muted hover:text-error hover:bg-error-soft transition-colors"
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
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-primary bg-primary-soft hover:bg-primary-soft border border-primary-soft hover:border-primary transition-colors"
              >
                <Plus size={13} /> Add step
              </button>
            )}
          </div>

          <button
            onClick={submit}
            disabled={!title.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold text-on-primary bg-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Add Task
          </button>
        </div>
      </div>
    </Overlay>
  );
}
