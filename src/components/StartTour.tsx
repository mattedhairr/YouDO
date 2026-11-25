import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, Check, Flame, Pencil, Play, RotateCcw, Sparkles, Target, Users, X, type LucideIcon } from 'lucide-react';
import type { GoalNode, Task, View } from '../types';
import { buildStarterGoal, firstEndpoint, STARTER_CHOICES, type StarterExam } from '../lib/starterGoals';
import { todayISO } from '../lib/dates';
import { hapticSuccess, hapticTick } from '../lib/haptics';
import { ambientTipSeen } from '../lib/ambient';
import './startTour.css';

type Step = 'pick' | 'goals' | 'today' | 'focus' | 'done';
// 'focus' has no card of its own: the session's own ambient-clock tip speaks, and the recap follows it.
const STEP_NUMBER: Record<Step, number> = { pick: 1, goals: 2, today: 3, focus: 3, done: 4 };
const STEPS = 4;

/**
 * The first five minutes, shown once on a fresh install instead of the guide:
 * pick an exam (a starter goal is made), plan its first chapter for today,
 * start a focus session (its own ambient-clock tip shows), and a short recap. One tap per step; Skip ends it
 * anywhere and leaves whatever was made. The full guide stays in Settings.
 */
export default function StartTour({ tasks, sessionTaskId, onAddGoal, onPlanToday, onNavigate, onStartSession, onFinish }: {
  tasks: Task[];
  /** The task of the session running now, if any: starting one from its own sheet counts as the Today step. */
  sessionTaskId?: string;
  onAddGoal: (goal: GoalNode) => void;
  onPlanToday: (nodeId: string) => void;
  onNavigate: (view: View) => void;
  onStartSession: (taskId: string) => void;
  onFinish: () => void;
}) {
  const [step, setStep] = useState<Step>('pick');
  const [exam, setExam] = useState<StarterExam | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [goal, setGoal] = useState<GoalNode | null>(null);
  const [done, setDone] = useState({ planned: false, focused: false });
  const card = useRef<HTMLDivElement>(null);
  const chapter = goal ? firstEndpoint(goal) : null;
  const today = todayISO();
  const plannedTask = chapter ? tasks.find((task) => task.goalNodeId === chapter.id && task.targetDate === today) : undefined;

  const sheetOpen = useSheetOpen();
  useEffect(() => { if (!sheetOpen) card.current?.focus(); }, [step, sheetOpen]);
  // A session started any other way (the card's own sheet) does the Today step.
  useEffect(() => {
    if (step !== 'today' || !sessionTaskId) return;
    setDone((value) => ({ ...value, focused: true }));
    setStep('focus');
  }, [step, sessionTaskId]);
  // On Today, ring the card the tour just planned, so it's clear what to tap.
  useEffect(() => {
    if (step !== 'today' || !plannedTask || sheetOpen) return;
    const target = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(plannedTask.id)}"]`);
    target?.classList.add('start-tour-target');
    return () => target?.classList.remove('start-tour-target');
  }, [step, plannedTask, sheetOpen]);
  // The recap waits until the first session's ambient-clock tip is closed.
  useEffect(() => {
    if (step !== 'focus') return;
    const check = () => { if (ambientTipSeen()) setStep('done'); };
    check();
    const timer = window.setInterval(check, 400);
    return () => window.clearInterval(timer);
  }, [step]);

  const choose = () => {
    if (!exam) return;
    const next = buildStarterGoal(exam, customTitle);
    onAddGoal(next);
    setGoal(next);
    hapticSuccess();
    onNavigate('goals');
    setStep('goals');
  };

  const plan = () => {
    if (!chapter) return;
    onPlanToday(chapter.id);
    setDone((value) => ({ ...value, planned: true }));
    hapticTick();
    onNavigate('tasks');
    setStep('today');
  };

  const focus = () => {
    if (!plannedTask) { setStep('done'); return; }
    onStartSession(plannedTask.id);
    setDone((value) => ({ ...value, focused: true }));
    setStep('focus');
  };

  if (step === 'pick') {
    return (
      <div className="start-tour-screen" role="dialog" aria-modal="true" aria-labelledby="start-tour-title">
        <div ref={card} tabIndex={-1} className="start-tour-pick">
          <Progress step={step} />
          <h1 id="start-tour-title">What are you preparing for?</h1>
          <p className="start-tour-lead">We’ll set up a starter plan. You can change all of it later.</p>
          <div className="start-tour-exams">
            {STARTER_CHOICES.map((choice) => (
              <button key={choice.exam} type="button" aria-pressed={exam === choice.exam} onClick={() => setExam(choice.exam)}>
                <strong>{choice.label}</strong><span>{choice.subjects}</span>
              </button>
            ))}
            <button type="button" className="is-wide" aria-pressed={exam === 'Other'} onClick={() => setExam('Other')}>
              <strong>Something else</strong><span>Name your goal</span>
            </button>
          </div>
          {exam === 'Other' && (
            <input className="start-tour-input" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)}
              placeholder="e.g. SSC CGL 2027" maxLength={80} aria-label="Your goal" autoFocus />
          )}
          <button type="button" className="start-tour-primary" disabled={!exam} onClick={choose}>Continue <ArrowRight size={17} /></button>
          <button type="button" className="start-tour-skip" onClick={onFinish}>Skip, I’ll explore myself</button>
        </div>
      </div>
    );
  }

  if (step === 'focus') return null;

  const tips: Record<Exclude<Step, 'pick' | 'focus'>, { where: string; title: string; points: Point[]; action: string; onAction: () => void; waiting: string }> = {
    goals: {
      where: 'Goals',
      title: 'This is your plan',
      points: [
        { icon: Pencil, text: 'The pencil on your goal sets the exam date; the header then counts down to it.' },
        { icon: RotateCcw, text: 'Tap a row to rename it or add more; long-press to move it.' },
      ],
      action: chapter ? `Plan ${chapter.title} for today` : 'Next',
      onAction: chapter ? plan : () => setStep('done'),
      waiting: 'Close this to carry on with the tour',
    },
    today: {
      where: 'Today',
      title: 'Today shows only today’s work',
      points: [
        { icon: Play, text: 'Tap a card, then Start focus session. The timer keeps going with the screen off.' },
        { icon: Sparkles, text: 'Every focused minute lights a star in the header’s night sky; reach your daily bar and they join into a constellation.' },
        { icon: Flame, text: 'Reach the bar each day to grow your streak. You set the bar in Settings.' },
        { icon: RotateCcw, text: 'Anything unfinished moves to Backlog tonight. Tap Today again to see it.' },
      ],
      action: 'Start a focus session',
      onAction: focus,
      waiting: 'Tap Start focus session below',
    },
    done: {
      where: 'All set',
      title: 'You’re set up',
      points: [],
      action: 'Done',
      onAction: onFinish,
      waiting: 'Close this to finish the tour',
    },
  };
  const tip = tips[step];

  // A sheet is open (a card's details, say): step aside so its own buttons stay free.
  if (sheetOpen) {
    return (
      <div className="start-tour-coach" role="status">
        {STEP_NUMBER[step]} of {STEPS} · <b>{tip.waiting}</b>
      </div>
    );
  }

  return (
    <div ref={card} tabIndex={-1} className="start-tour-tip" role="dialog" aria-labelledby="start-tour-tip-title" aria-live="polite">
      <div className="start-tour-tip-head">
        <span>{STEP_NUMBER[step]} of {STEPS} · {tip.where}</span>
        {step !== 'done' && <button type="button" onClick={onFinish} aria-label="Skip the tour"><X size={16} /></button>}
      </div>
      <p id="start-tour-tip-title" className="start-tour-tip-title">{tip.title}</p>
      {step === 'goals' && goal && (
        <div className="start-tour-tree" aria-label="How a plan is built">
          <p><b>{goal.title}</b> · goal</p>
          {chapter && !goal.children.includes(chapter) && <p className="is-1">{goal.children.find((subject) => subject.children.includes(chapter))?.title ?? goal.children[0]?.title} · subject</p>}
          <p className={chapter && goal.children.includes(chapter) ? 'is-1' : 'is-2'}>{chapter?.title ?? 'A chapter'} · chapter</p>
          {chapter?.steps?.length ? <p className={goal.children.includes(chapter) ? 'is-2' : 'is-3'}>{chapter.steps.join(' · ')} · steps</p> : null}
        </div>
      )}
      {step === 'done' ? (
        <>
          <ul className="start-tour-checks">
            <li><Check size={13} aria-hidden />Made a plan{goal ? ` for ${goal.title}` : ''}</li>
            <li className={done.planned ? '' : 'is-todo'}>{done.planned ? <Check size={13} aria-hidden /> : <i>·</i>}Put the first piece on today</li>
            <li className={done.focused ? '' : 'is-todo'}>{done.focused ? <Check size={13} aria-hidden /> : <i>·</i>}Started a focus session</li>
          </ul>
          <div className="start-tour-map" aria-label="Where things are">
            {MAP.map(({ icon: Icon, tab, text }) => (
              <p key={tab}><Icon size={14} aria-hidden /><span><b>{tab}</b> {text}</span></p>
            ))}
          </div>
        </>
      ) : (
        <ul className="start-tour-points">
          {tip.points.map(({ icon: Icon, text }) => <li key={text}><i aria-hidden><Icon size={13} /></i><span>{text}</span></li>)}
        </ul>
      )}
      <div className="start-tour-tip-foot">
        {step === 'done' ? <span className="start-tour-tip-note">The full guide is in Settings.</span>
          : <button type="button" className="start-tour-tip-skip" onClick={step === 'today' ? () => setStep('done') : onFinish}>{step === 'today' ? 'Not now' : 'Skip tour'}</button>}
        <button type="button" className="start-tour-tip-action" onClick={tip.onAction}>{tip.action}</button>
      </div>
    </div>
  );
}

type Point = { icon: LucideIcon; text: string };

/** The recap's map: where each part of YouDO lives. */
const MAP: { icon: LucideIcon; tab: string; text: string }[] = [
  { icon: Play, tab: 'Today', text: 'today’s cards; tap Today again for Backlog' },
  { icon: Target, tab: 'Goals', text: 'the whole plan and exam dates' },
  { icon: CalendarDays, tab: 'Calendar', text: 'your days, sessions and streak' },
  { icon: Users, tab: 'Hub', text: 'study rooms with friends' },
];

/** True while a sheet or screen is open over the app (anything in #overlay-root). */
function useSheetOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const host = document.getElementById('overlay-root');
    if (!host) return;
    const check = () => setOpen(host.childElementCount > 0);
    check();
    const observer = new MutationObserver(check);
    observer.observe(host, { childList: true });
    return () => observer.disconnect();
  }, []);
  return open;
}

function Progress({ step }: { step: Step }) {
  return (
    <div className="start-tour-progress" aria-label={`Step ${STEP_NUMBER[step]} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, index) => index + 1).map((n) => <i key={n} className={n <= STEP_NUMBER[step] ? 'is-on' : ''} />)}
    </div>
  );
}
