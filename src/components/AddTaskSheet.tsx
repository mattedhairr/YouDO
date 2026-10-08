import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import type { Priority, Task } from '../types';
import { todayISO, tomorrowISO } from '../store';
import Overlay from './Overlay';
import StepListEditor, { MAX_STEPS } from './StepListEditor';

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
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS);
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
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] min-h-0 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex flex-col items-center shrink-0 -mt-1 mb-1">
          <div className="w-10 h-1 bg-border-subtle rounded-full opacity-70 mb-2" />
          <h2 className="text-[15px] font-bold text-content-primary">New Task</h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col [&>*]:shrink-0 gap-3.5">
          {/* Main Info Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="What needs doing?"
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

          {/* Priority Card */}
          <div className="bg-surface border border-subtle rounded-2xl p-3 shadow-sm flex flex-col gap-2">
            <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-content-muted">Priority</label>
            <div className="bg-elevated p-1 rounded-xl border border-subtle grid grid-cols-3 gap-1">
              {priorities.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                    priority === p.value
                      ? `${p.active} shadow-sm`
                      : 'text-content-secondary hover:text-content-primary'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dates Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="px-3.5 pt-3 pb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Target Date</label>
            </div>
            <div className="p-2 pt-0 grid grid-cols-3 gap-2 border-b border-subtle">
              <button
                type="button"
                onClick={() => setTargetDate(todayISO())}
                className={`py-2 rounded-xl text-[12px] font-bold transition-all ${
                  targetDate === todayISO()
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-elevated text-content-secondary hover:text-content-primary border border-subtle'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setTargetDate(tomorrowISO())}
                className={`py-2 rounded-xl text-[12px] font-bold transition-all ${
                  targetDate === tomorrowISO()
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-elevated text-content-secondary hover:text-content-primary border border-subtle'
                }`}
              >
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setTargetDate('')}
                className={`py-2 flex items-center justify-center rounded-xl text-[12px] font-bold transition-all ${
                  targetDate !== todayISO() && targetDate !== tomorrowISO()
                    ? 'bg-primary text-on-primary shadow-sm'
                    : 'bg-elevated text-content-secondary hover:text-content-primary border border-subtle'
                }`}
                aria-label="Custom Date"
              >
                <Calendar size={14} />
              </button>
            </div>
            {targetDate !== todayISO() && targetDate !== tomorrowISO() && (
              <div className="p-2 border-b border-subtle bg-elevated/30">
                 <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full h-10 px-3 bg-surface border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
                />
              </div>
            )}
            
            <div className="px-3.5 py-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted block mb-2">Hard deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full h-10 px-3 bg-elevated border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Steps */}
          <div className="bg-surface border border-subtle rounded-2xl p-3 shadow-sm">
            <StepListEditor label="Sub-steps" steps={steps} onChange={setSteps} />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-2 shrink-0">
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="w-full h-12 rounded-2xl text-[13px] font-bold bg-primary text-on-primary disabled:opacity-40 transition-opacity flex items-center justify-center shadow-sm"
          >
            Add Task
          </button>
        </div>
      </div>
    </Overlay>
  );
}
