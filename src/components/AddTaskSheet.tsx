import { useEffect, useMemo, useRef, useState } from 'react';
import { TITLE_MAX, isTitleTooLong } from '../lib/titleLimit';
import TitleCounter from './TitleCounter';
import { BookOpen, Calendar, Clock, Repeat } from 'lucide-react';
import type { GoalNode, Priority, ReminderRepeat, Task } from '../types';
import { todayISO, tomorrowISO } from '../store';
import { repeatLabel } from '../lib/reminders';
import { requestNotificationPermission } from '../lib/notifications';
import Overlay from './Overlay';
import StepListEditor, { MAX_STEPS } from './StepListEditor';

interface Props {
  open: boolean;
  onClose: () => void;
  onAdd: (task: Task) => void;
  initialDate?: string | null;
  /** Top-level goals a study quick task can belong to. */
  goals?: GoalNode[];
}

const priorities: { value: Priority; label: string; active: string }[] = [
  { value: 'high', label: 'High', active: 'bg-error text-white border-error' },
  { value: 'medium', label: 'Medium', active: 'bg-warning text-on-accent border-warning' },
  { value: 'low', label: 'Low', active: 'bg-secondary text-on-accent border-secondary' },
];

type RepeatMode = 'once' | 'daily' | 'days' | 'weekly';
const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

const weekdayOf = (iso: string) => new Date((iso || todayISO()) + 'T12:00:00').getDay();

/** The goal a new study quick task starts on: the nearest deadline still ahead, else the first. */
function defaultGoal(goals: GoalNode[]): string {
  const today = todayISO();
  const open = goals.filter((g) => !g.completed);
  const dated = open.filter((g) => g.endDate && g.endDate >= today).sort((a, b) => (a.endDate! < b.endDate! ? -1 : 1));
  return (dated[0] ?? open[0] ?? goals[0])?.id ?? '';
}

const segClass = (on: boolean) =>
  `py-2 rounded-xl text-[12px] font-bold transition-all ${on ? 'bg-primary text-on-primary shadow-sm' : 'bg-elevated text-content-secondary hover:text-content-primary border border-subtle'}`;

export default function AddTaskSheet({ open, onClose, onAdd, initialDate, goals = [] }: Props) {
  const [kind, setKind] = useState<'study' | 'general'>('study');
  const [goalId, setGoalId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [targetDate, setTargetDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [steps, setSteps] = useState<string[]>(['']);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('once');
  const [days, setDays] = useState<number[]>([]);
  const [remindAt, setRemindAt] = useState('');
  const titleRef = useRef<HTMLInputElement>(null);
  const roots = useMemo(() => goals.filter((g) => g.kind === 'goal' || !g.kind), [goals]);

  useEffect(() => {
    if (open) {
      setKind(roots.length ? 'study' : 'general');
      setGoalId(defaultGoal(roots));
      setTitle('');
      setDescription('');
      setPriority('medium');
      setTargetDate(initialDate ?? todayISO());
      setDeadline('');
      setSteps(['']);
      setRepeatMode('once');
      setDays([weekdayOf(initialDate ?? todayISO())]);
      setRemindAt('');
      setTimeout(() => titleRef.current?.focus(), 150);
    }
  }, [open, initialDate, roots]);

  if (!open) return null;

  const general = kind === 'general';
  const repeat: ReminderRepeat | undefined = !general || repeatMode === 'once'
    ? undefined
    : repeatMode === 'daily'
      ? { every: 'daily' }
      : { every: 'days', days: repeatMode === 'weekly' ? [weekdayOf(targetDate)] : days };
  const canAdd = Boolean(title.trim()) && !isTitleTooLong(title)
    && (general ? repeatMode !== 'days' || days.length > 0 : Boolean(goalId));

  const submit = () => {
    if (!canAdd) return;
    const cleanSteps = general ? [] : steps.map((s) => s.trim()).filter(Boolean).slice(0, MAX_STEPS);
    onAdd({
      id: uid(),
      title: title.trim(),
      description: description.trim(),
      priority: general ? 'medium' : priority,
      targetDate: targetDate || (general ? todayISO() : null),
      deadline: !general && deadline ? new Date(deadline).toISOString() : null,
      steps: cleanSteps,
      progress: 0,
      createdAt: Date.now(),
      order: Date.now(),
      ...(general
        ? { kind: 'general' as const, ...(repeat ? { repeat } : {}), ...(remindAt ? { remindAt } : {}) }
        : { goalId }),
    });
    // A reminder time needs notifications; Android asks once.
    if (general && remindAt) void requestNotificationPermission();
    onClose();
  };

  const toggleDay = (d: number) => setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  const kindCard = (value: 'study' | 'general', name: string, line: string, disabled = false) => (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setKind(value)}
      aria-pressed={kind === value}
      className={`flex-1 text-left rounded-xl px-3 py-2.5 border transition-colors disabled:opacity-40 ${
        kind === value ? 'border-primary bg-primary-soft' : 'border-subtle bg-elevated'
      }`}
    >
      <span className={`block text-[13px] font-bold ${kind === value ? 'text-primary' : 'text-content-primary'}`}>{name}</span>
      <span className="block text-[11px] leading-snug text-content-muted mt-0.5">{line}</span>
    </button>
  );

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="ios-sheet sheet-up w-full max-w-md mx-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom,0px))] min-h-0 flex flex-col gap-3.5">
        {/* Header */}
        <div className="flex flex-col items-center shrink-0 -mt-1 mb-1">
          <div className="w-10 h-1 bg-border-subtle rounded-full opacity-70 mb-2" />
          <h2 className="text-[15px] font-bold text-content-primary">New Quick Task</h2>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col [&>*]:shrink-0 gap-3.5">
          {/* Study or General */}
          <div className="bg-surface border border-subtle rounded-2xl p-2 shadow-sm">
            <div className="flex gap-2">
              {kindCard('study', 'Study', roots.length ? 'Part of a goal. Focus counts.' : 'Make a goal first.', roots.length === 0)}
              {kindCard('general', 'General', 'A reminder or life task.')}
            </div>
          </div>

          {/* Main Info Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="relative">
            <input
              ref={titleRef}
              value={title}
              maxLength={Math.max(TITLE_MAX, title.length)}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder={general ? 'e.g. Pay hostel fees' : 'e.g. Polity · 30 PYQs'}
              className="w-full h-12 px-3.5 bg-transparent text-[14px] font-semibold text-content-primary placeholder:text-content-muted outline-none border-b border-subtle pr-14"
            />
            <TitleCounter value={title} className="absolute right-3.5 top-1/2 -translate-y-1/2" />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Details (optional). Keep the name short and put the rest here…"
              rows={2}
              className="w-full bg-transparent px-3.5 py-2.5 text-[13px] font-medium text-content-primary placeholder:text-content-muted outline-none resize-none"
            />
          </div>

          {!general && (
            <div className="bg-surface border border-subtle rounded-2xl p-3 shadow-sm flex flex-col gap-2">
              <div className="flex justify-between px-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted">Goal</label>
                <span className="text-[10px] font-semibold text-content-muted">required</span>
              </div>
              <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Goal">
                {roots.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    role="radio"
                    aria-checked={goalId === g.id}
                    onClick={() => setGoalId(g.id)}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-[13px] font-semibold border transition-colors ${
                      goalId === g.id ? 'border-primary bg-primary-soft text-content-primary' : 'border-subtle bg-elevated text-content-secondary'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${goalId === g.id ? 'border-primary bg-primary shadow-[inset_0_0_0_2px_var(--bg-elevated)]' : 'border-content-muted'}`} />
                    <span className="truncate">{g.title}</span>
                  </button>
                ))}
              </div>
              <p className="px-1 flex gap-1.5 text-[11.5px] leading-snug text-content-secondary">
                <BookOpen size={13} className="shrink-0 mt-px text-primary" />
                <span>Focus on it counts as study and shows on the goal as <b className="text-primary font-semibold">Extra focus</b>. The goal’s % stays the same.</span>
              </p>
            </div>
          )}

          {general && (
            <div className="bg-surface border border-subtle rounded-2xl p-3 shadow-sm flex flex-col gap-2">
              <label className="px-1 text-[10px] font-bold uppercase tracking-wider text-content-muted">Repeat</label>
              <div className="bg-elevated p-1 rounded-xl border border-subtle grid grid-cols-4 gap-1">
                {(['once', 'daily', 'days', 'weekly'] as RepeatMode[]).map((m) => (
                  <button key={m} type="button" onClick={() => setRepeatMode(m)}
                    className={`py-1.5 rounded-lg text-[12px] font-bold transition-all ${repeatMode === m ? 'bg-primary text-on-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'}`}>
                    {m === 'once' ? 'Once' : m === 'daily' ? 'Daily' : m === 'days' ? 'Days' : 'Weekly'}
                  </button>
                ))}
              </div>
              {repeatMode === 'days' && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
                  {WEEK_ORDER.map((d) => (
                    <button key={d} type="button" aria-pressed={days.includes(d)} onClick={() => toggleDay(d)}
                      className={`px-2.5 py-1.5 rounded-full text-[12px] font-semibold transition-colors ${days.includes(d) ? 'bg-primary text-on-primary' : 'bg-elevated text-content-secondary border border-subtle'}`}>
                      {DAY_LETTERS[d]}
                    </button>
                  ))}
                </div>
              )}
              <p className="px-1 flex gap-1.5 text-[11.5px] leading-snug text-content-secondary">
                <Repeat size={13} className="shrink-0 mt-px text-primary" />
                <span>
                  {repeat ? `${repeatLabel(repeat)}. ` : ''}Shows under <b className="text-primary font-semibold">Reminders</b> on Today. Tick it when done. Never counts as study.
                </span>
              </p>
            </div>
          )}

          {/* Priority Card */}
          {!general && (
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
          )}

          {/* Dates Card */}
          <div className="bg-surface border border-subtle rounded-2xl overflow-hidden shadow-sm">
            <div className="px-3.5 pt-3 pb-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted">{general ? 'Starts' : 'Target Date'}</label>
            </div>
            <div className="p-2 pt-0 grid grid-cols-3 gap-2 border-b border-subtle">
              <button type="button" onClick={() => setTargetDate(todayISO())} className={segClass(targetDate === todayISO())}>
                Today
              </button>
              <button type="button" onClick={() => setTargetDate(tomorrowISO())} className={segClass(targetDate === tomorrowISO())}>
                Tomorrow
              </button>
              <button
                type="button"
                onClick={() => setTargetDate('')}
                className={`${segClass(targetDate !== todayISO() && targetDate !== tomorrowISO())} flex items-center justify-center`}
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

            {general ? (
              <div className="px-3.5 py-3">
                <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted flex justify-between mb-2">
                  Remind me <span className="normal-case tracking-normal font-semibold">optional</span>
                </label>
                <div className="flex items-center gap-2">
                  <Clock size={15} className="text-content-muted shrink-0" />
                  <input
                    type="time"
                    value={remindAt}
                    onChange={(e) => setRemindAt(e.target.value)}
                    aria-label="Reminder time"
                    className="flex-1 h-10 px-3 bg-elevated border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
                  />
                  {remindAt && (
                    <button type="button" onClick={() => setRemindAt('')} className="px-2.5 h-10 rounded-xl text-[12px] font-semibold text-content-secondary bg-elevated border border-subtle">
                      No time
                    </button>
                  )}
                </div>
              </div>
            ) : (
            <div className="px-3.5 py-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-content-muted block mb-2">Hard deadline</label>
              <input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full h-10 px-3 bg-elevated border border-subtle rounded-xl text-[13px] font-medium text-content-primary outline-none focus:border-primary transition-colors"
              />
            </div>
            )}
          </div>

          {/* Steps */}
          {!general && (
          <div className="bg-surface border border-subtle rounded-2xl p-3 shadow-sm">
            <StepListEditor label="Sub-steps" steps={steps} onChange={setSteps} />
          </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col gap-2 mt-2 shrink-0">
          <button
            onClick={submit}
            disabled={!canAdd}
            className="w-full h-12 rounded-2xl text-[13px] font-bold bg-primary text-on-primary disabled:opacity-40 transition-opacity flex items-center justify-center shadow-sm"
          >
            {general ? 'Add Reminder' : 'Add Task'}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
