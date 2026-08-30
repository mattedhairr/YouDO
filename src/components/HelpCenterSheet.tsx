import { useEffect, useRef, useState } from 'react';
import { Calendar, Check, Cloud, GripVertical, Link2, Pause, Sparkles, Target, TrendingUp, User, X, Zap } from 'lucide-react';
import Overlay from './Overlay';
import { hapticTap } from '../lib/haptics';

const HOW_IT_WORKS_TABS = [
  {
    icon: Check,
    name: 'Today',
    role: 'Work for this date',
    oneLiner: 'Only what you scheduled for today. This is the list you actually do.',
    uses: [
      'See today’s scheduled cards — nothing else',
      'Start a focus session to track time',
      'Finish a card or tap it to start a session and edit',
    ],
    notFor: 'Do not build your whole syllabus here. Build that in Goals, then schedule pieces onto a date.',
    after: 'If a day ends and a card is not done, YouDO moves it to Backlog by itself. Plan still shows the original date and the stats.',
    mock: 'today' as const,
  },
  {
    icon: Target,
    name: 'Goals',
    role: 'Your full plan',
    oneLiner: 'The map of the work. Nested however you need. Not the daily list.',
    uses: [
      'Add a goal, then phases, then tasks under it',
      'Tap a node to open it, pin it, or edit it',
      'Tap Schedule on a task and pick any date',
    ],
    notFor: 'You do not “work the Goals list” each morning. Schedule a task onto a date, then work from Today.',
    after: 'Edits in Goals update the linked Today and Plan cards. Delete a goal and it goes to Recently Deleted, not into thin air.',
    mock: 'goals' as const,
  },
  {
    icon: Calendar,
    name: 'Plan',
    role: 'Any date',
    oneLiner: 'The calendar. Past, today, and future — plus time stats for each day.',
    uses: [
      'Tap a date to see what was scheduled there',
      'Check completed, missed, and backlog on that day',
      'Read net focus and session stats for the date',
    ],
    notFor: 'Plan is not a second Today list. It is the calendar around Today.',
    after: 'If you scheduled a task for the 18th, it lives on the 18th in Plan. It appears on Today only when that date is today.',
    mock: 'plan' as const,
  },
  {
    icon: TrendingUp,
    name: 'Board',
    role: 'Optional ranking',
    oneLiner: 'Net focus hours among people who opted in. Rankings stay hidden until ten have joined.',
    uses: [
      'Compare today, this week (Monday–today), or this month',
      'Opt in from Settings with a display name',
      'See streak and bar as context — rank is hours only',
    ],
    notFor: 'The board does not verify hours. Padding time only cheats you.',
    after: 'Off by default. Turn it off and your public row is deleted.',
    mock: 'board' as const,
  },
];

const USER_GUIDE_STEPS = [
  {
    icon: Target,
    title: 'Create your plan',
    where: 'Goals tab',
    desc: 'Add a goal, then add phases or tasks under it. This is the map — not today’s list.',
    do: [
      'Open Goals and tap Create Goal (or Add under a node).',
      'Nest the work: goal → phase → tasks. As deep as you need.',
      'Leave it here until you are ready to put a piece on a date.',
    ],
    mock: 'goals' as const,
  },
  {
    icon: Calendar,
    title: 'Pick a day for a task',
    where: 'A task in Goals',
    desc: 'Tap Schedule and choose any date — today or later.',
    do: [
      'Open the task in Goals.',
      'Tap Schedule. Pick today, or any other day.',
      'That date’s work shows on Today when it arrives, and in Plan on the calendar.',
    ],
    mock: 'schedule' as const,
  },
  {
    icon: Sparkles,
    title: 'Split a big task if you need to',
    where: 'When a task has steps',
    desc: 'Send only some steps to a date. Leave the rest.',
    do: [
      'If the task has micro-steps, you do not have to take all of them.',
      'When you schedule, pick only the steps for that date.',
      'The other steps stay on the goal until you schedule them.',
    ],
    mock: 'steps' as const,
  },
  {
    icon: Zap,
    title: 'Do the work',
    where: 'Today tab',
    desc: 'Tap a card to start a session. Missed days move to Backlog on their own.',
    do: [
      'Today shows only what you scheduled for this date.',
      'Tap a card to start a timed focus session.',
      'If the day ends undone, YouDO moves it to Backlog. You do not move it yourself.',
    ],
    mock: 'today' as const,
  },
  {
    icon: User,
    title: 'Keep your data',
    where: 'Settings',
    desc: 'Sign in so another device sees the same plan. Deleted goals can come back.',
    do: [
      'Without an account, everything stays on this phone.',
      'Sign in to share goals, Today, and session stats.',
      'Deleted goals: Settings → Recently Deleted → Restore.',
    ],
    mock: 'sync' as const,
  },
];

function GuideMock({ kind }: { kind: (typeof USER_GUIDE_STEPS)[number]['mock'] | (typeof HOW_IT_WORKS_TABS)[number]['mock'] }) {
  if (kind === 'goals') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3 space-y-2" aria-hidden>
        {['Target exam', 'Foundation phase', 'Core subject notes'].map((label, i) => (
          <div key={label} className="flex items-center gap-2" style={{ paddingLeft: i * 14 }}>
            <div className={`size-1.5 rounded-full ${i === 2 ? 'bg-primary' : 'bg-border'}`} />
            <div className={`h-7 flex-1 rounded-[8px] border border-subtle px-2.5 flex items-center text-[11px] font-medium ${i === 2 ? 'bg-primary-soft text-primary' : 'bg-elevated text-content-secondary'}`}>
              {label}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'today') {
    return (
      <div className="overflow-hidden relative rounded-[12px] border bg-surface shadow-card border-primary" aria-hidden>
        <div className="bg-primary-soft border-b border-subtle px-3 py-1.5 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-primary" />
          <span className="text-[11px] font-mono font-semibold text-primary">Focus · 12:40</span>
        </div>
        <div className="flex items-start gap-2 px-3 pt-3 pb-2.5">
          <GripVertical size={14} className="mt-1 text-content-muted shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1 text-[10px] font-semibold bg-base border border-subtle rounded-lg px-2 py-0.5 mb-1.5">
              <Link2 size={10} className="text-primary shrink-0" />
              <span className="text-primary">Target exam</span>
              <span className="text-content-muted">•</span>
              <span className="text-primary">Foundation</span>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                <h3 className="text-[14px] font-semibold text-content-primary leading-snug">Essay draft</h3>
              </div>
              <div className="size-7 rounded-full bg-primary-soft text-primary grid place-items-center shrink-0">
                <Pause size={12} className="fill-current" />
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[11px] text-content-secondary font-medium ml-3.5">
              <Calendar size={11} className="text-content-muted" /> Today
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'plan') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3" aria-hidden>
        <div className="grid grid-cols-7 gap-1 grid-fixed">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[9px] font-semibold text-content-muted py-0.5">{d}</div>
          ))}
          {Array.from({ length: 7 }, (_, i) => (
            <div
              key={i}
              className={`h-8 rounded-[8px] grid place-items-center text-[11px] font-semibold tabular-nums ${
                i === 3 ? 'bg-primary text-on-primary' : 'bg-elevated text-content-secondary border border-subtle'
              }`}
            >
              {12 + i}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-content-secondary">15th selected — scheduled, done, and stats for that day.</p>
      </div>
    );
  }
  if (kind === 'board') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3 space-y-2" aria-hidden>
        <div className="flex gap-1">
          {['Today', 'Week', 'Month'].map((d, i) => (
            <div
              key={d}
              className={`flex-1 h-7 rounded-[8px] grid place-items-center text-[10px] font-semibold ${
                i === 0 ? 'bg-primary-soft text-primary' : 'text-content-muted'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        {['Asha · 3h 10m', 'Rohan · 2h 40m'].map((line, i) => (
          <div key={line} className="flex items-center justify-between rounded-[10px] border border-subtle bg-elevated px-2.5 py-2">
            <span className="text-[11px] font-medium text-content-primary">{i + 1}. {line.split(' · ')[0]}</span>
            <span className="text-[11px] font-semibold tabular-nums text-content-secondary">{line.split(' · ')[1]}</span>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'schedule') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3" aria-hidden>
        <div className="text-[11px] font-semibold text-content-primary mb-2">Schedule · pick a date</div>
        <div className="flex gap-1.5">
          {['Today', '16', '17', '18'].map((d, i) => (
            <div
              key={d}
              className={`flex-1 h-9 rounded-[10px] grid place-items-center text-[11px] font-semibold ${
                i === 2 ? 'bg-primary text-on-primary' : 'bg-elevated border border-subtle text-content-secondary'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-content-secondary">17th is not today — it will sit in Plan until then.</p>
      </div>
    );
  }
  if (kind === 'steps') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3 space-y-1.5" aria-hidden>
        {['Read chapter', 'Make notes', 'Revise', 'MCQs'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`size-4 rounded border grid place-items-center ${i < 2 ? 'bg-primary border-primary' : 'border-subtle bg-elevated'}`}>
              {i < 2 && <Check size={10} className="text-on-primary" />}
            </div>
            <span className={`text-[12px] ${i < 2 ? 'text-content-primary font-medium' : 'text-content-muted'}`}>{s}</span>
            <span className="ml-auto text-[10px] text-content-muted">{i < 2 ? 'This date' : 'Later'}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="rounded-[12px] border border-subtle bg-base p-3 flex items-center gap-3" aria-hidden>
      <div className="size-10 rounded-[12px] bg-primary-soft grid place-items-center text-primary">
        <Cloud size={18} />
      </div>
      <div>
        <div className="text-[12px] font-semibold text-content-primary">This phone ↔ other devices</div>
        <div className="text-[11px] text-content-secondary mt-0.5">Sign in to copy goals, Today, and stats.</div>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HelpCenterSheet({ open, onClose }: Props) {
  const [tab, setTab] = useState<'guide' | 'info'>('guide');
  const [howTab, setHowTab] = useState(HOW_IT_WORKS_TABS[0].name);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [guideStep, setGuideStep] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTab('guide');
    setGuideStep(0);
    setHowTab(HOW_IT_WORKS_TABS[0].name);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0 }));
  }, [open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    setGuideStep(Math.round(el.scrollLeft / el.clientWidth));
  };

  const scrollToStep = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    setGuideStep(index);
    hapticTap();
  };

  return (
    <Overlay open={open} onClose={onClose} align="bottom">
      <div className="panel panel-sheet sheet-up max-h-[88vh] flex flex-col overflow-hidden">
        <div className="shrink-0 pt-3 pb-2 px-4 flex items-center justify-between border-b border-subtle">
          <div className="flex bg-surface rounded-[12px] p-1 border border-subtle">
            {(['guide', 'info'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  hapticTap();
                }}
                className={`px-3.5 py-1.5 rounded-[8px] text-[13px] font-semibold transition-colors ${
                  tab === id ? 'bg-primary text-on-primary' : 'text-content-secondary'
                }`}
              >
                {id === 'guide' ? 'Getting started' : 'The tabs'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-surface border border-subtle text-content-secondary hover:text-content-primary"
            aria-label="Close help"
          >
            <X size={18} />
          </button>
        </div>

        {tab === 'guide' && (
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-5 pt-4 pb-1">
              <p className="text-[13px] text-content-secondary">Swipe through how YouDO is meant to be used.</p>
            </div>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex no-scrollbar"
            >
              {USER_GUIDE_STEPS.map((step, idx) => (
                <div key={step.title} className="w-full shrink-0 snap-center px-5 py-3 flex flex-col">
                  <div className="bg-elevated border border-subtle rounded-[16px] p-4 shadow-card flex flex-col gap-3 max-h-[58vh] overflow-y-auto no-scrollbar">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-[12px] bg-primary-soft text-primary grid place-items-center shrink-0">
                        <step.icon size={22} strokeWidth={2.2} />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-primary uppercase tracking-wider">{idx + 1} / {USER_GUIDE_STEPS.length} · {step.where}</div>
                        <h3 className="text-[16px] font-semibold text-content-primary leading-tight">{step.title}</h3>
                      </div>
                    </div>
                    <p className="text-[13px] text-content-primary leading-relaxed">{step.desc}</p>
                    <GuideMock kind={step.mock} />
                    <div className="space-y-2 bg-surface rounded-[12px] p-3 border border-subtle">
                      {step.do.map((line, i) => (
                        <div key={line} className="flex gap-2.5 text-[13px] text-content-secondary leading-snug">
                          <span className="size-5 rounded-full bg-primary-soft text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                          <span>{line}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="shrink-0 pb-5 pt-2 flex flex-col items-center gap-3">
              <div className="flex items-center justify-center gap-2">
                {USER_GUIDE_STEPS.map((step, idx) => (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => scrollToStep(idx)}
                    className={`h-2 rounded-full transition-all ${idx === guideStep ? 'w-6 bg-primary' : 'w-2 bg-border'}`}
                    aria-label={`Go to ${step.title}`}
                  />
                ))}
              </div>
              {guideStep === USER_GUIDE_STEPS.length - 1 ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold"
                >
                  Got it
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => scrollToStep(guideStep + 1)}
                  className="px-5 py-2 rounded-[12px] bg-surface border border-subtle text-[13px] font-semibold text-content-primary"
                >
                  Next
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-5 pt-4 pb-8 space-y-4">
            <p className="text-[13px] text-content-secondary leading-relaxed">
              Tap a tab to see what it is for — and what it is not.
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-elevated border border-subtle p-1">
              {HOW_IT_WORKS_TABS.map((t) => {
                const Icon = t.icon;
                const active = howTab === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      setHowTab(t.name);
                      hapticTap();
                    }}
                    className={`flex-1 h-10 rounded-[10px] flex items-center justify-center gap-1.5 text-[13px] ${
                      active ? 'bg-primary text-on-primary font-semibold' : 'text-content-secondary font-medium'
                    }`}
                  >
                    <Icon size={15} strokeWidth={active ? 2.5 : 2} />
                    {t.name}
                  </button>
                );
              })}
            </div>

            {(() => {
              const current = HOW_IT_WORKS_TABS.find((t) => t.name === howTab) ?? HOW_IT_WORKS_TABS[0];
              const Icon = current.icon;
              return (
                <div key={current.name} className="space-y-3 fade-in">
                  <div className="rounded-[16px] border border-subtle bg-elevated p-4">
                    <div className="flex items-center gap-3">
                      <div className="size-12 rounded-[12px] bg-primary-soft text-primary grid place-items-center shrink-0">
                        <Icon size={22} strokeWidth={2.2} />
                      </div>
                      <div>
                        <div className="text-[18px] font-semibold tracking-tight text-content-primary">{current.name}</div>
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">{current.role}</div>
                      </div>
                    </div>
                    <p className="mt-3 text-[14px] text-content-primary leading-relaxed">{current.oneLiner}</p>
                  </div>
                  <GuideMock kind={current.mock} />
                  <div className="rounded-[12px] border border-subtle bg-elevated p-3.5 space-y-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">You use it to</p>
                    {current.uses.map((line) => (
                      <div key={line} className="flex gap-2.5 text-[13px] text-content-secondary leading-snug">
                        <Check size={15} className="text-primary shrink-0 mt-0.5" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-[12px] border border-subtle bg-surface p-3.5 space-y-2.5">
                    <div className="flex items-start gap-2.5">
                      <X size={15} className="text-error shrink-0 mt-0.5" />
                      <p className="text-[13px] text-content-secondary leading-relaxed">{current.notFor}</p>
                    </div>
                    <p className="text-[13px] text-content-secondary leading-relaxed pl-[26px]">{current.after}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </Overlay>
  );
}
