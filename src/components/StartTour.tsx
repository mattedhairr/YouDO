import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, X } from 'lucide-react';
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
export default function StartTour({ tasks, onAddGoal, onPlanToday, onNavigate, onStartSession, onFinish }: {
  tasks: Task[];
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

  useEffect(() => { card.current?.focus(); }, [step]);
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

  const tips: Record<Exclude<Step, 'pick' | 'focus'>, { where: string; title: string; text: string; action: string; onAction: () => void }> = {
    goals: {
      where: 'Goals',
      title: 'This is your plan',
      text: `${goal?.title ?? 'Your goal'}: subjects hold chapters, chapters hold steps. Rename, add or remove anything; the pencil sets your exam date.`,
      action: chapter ? `Plan ${chapter.title} for today` : 'Next',
      onAction: chapter ? plan : () => setStep('done'),
    },
    today: {
      where: 'Today',
      title: 'Today shows only today’s work',
      text: 'Tap a card to start a focus session; every focused minute lights a star in your night sky. Anything left undone moves to Backlog by itself.',
      action: 'Start a focus session',
      onAction: focus,
    },
    done: {
      where: 'All set',
      title: 'You’re set up',
      text: '',
      action: 'Done',
      onAction: onFinish,
    },
  };
  const tip = tips[step];

  return (
    <div ref={card} tabIndex={-1} className="start-tour-tip" role="dialog" aria-labelledby="start-tour-tip-title" aria-live="polite">
      <div className="start-tour-tip-head">
        <span>{STEP_NUMBER[step]} of {STEPS} · {tip.where}</span>
        {step !== 'done' && <button type="button" onClick={onFinish} aria-label="Skip the tour"><X size={16} /></button>}
      </div>
      <p id="start-tour-tip-title" className="start-tour-tip-title">{tip.title}</p>
      {step === 'done' ? (
        <ul className="start-tour-checks">
          <li><Check size={13} aria-hidden />Made a plan{goal ? ` for ${goal.title}` : ''}</li>
          <li className={done.planned ? '' : 'is-todo'}>{done.planned ? <Check size={13} aria-hidden /> : <i>·</i>}Put the first piece on today</li>
          <li className={done.focused ? '' : 'is-todo'}>{done.focused ? <Check size={13} aria-hidden /> : <i>·</i>}Started a focus session</li>
          <li className="is-todo"><i>·</i>Later: study with friends in the Hub</li>
          <li className="is-todo"><i>·</i>Later: set your exam date for a countdown</li>
        </ul>
      ) : <p className="start-tour-tip-text">{tip.text}</p>}
      <div className="start-tour-tip-foot">
        {step === 'done' ? <span className="start-tour-tip-note">The full guide is in Settings.</span>
          : <button type="button" className="start-tour-tip-skip" onClick={step === 'today' ? () => setStep('done') : onFinish}>{step === 'today' ? 'Not now' : 'Skip tour'}</button>}
        <button type="button" className="start-tour-tip-action" onClick={tip.onAction}>{tip.action}</button>
      </div>
    </div>
  );
}

function Progress({ step }: { step: Step }) {
  return (
    <div className="start-tour-progress" aria-label={`Step ${STEP_NUMBER[step]} of ${STEPS}`}>
      {Array.from({ length: STEPS }, (_, index) => index + 1).map((n) => <i key={n} className={n <= STEP_NUMBER[step] ? 'is-on' : ''} />)}
    </div>
  );
}
