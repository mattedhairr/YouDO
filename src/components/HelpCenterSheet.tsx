import { Check, Target, Calendar, Sparkles, Zap, User, GripVertical, Link2, Pause, Cloud, X } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

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
    detail:
      'Nothing in Goals is due today until you schedule it. Think of this as a map you keep, not the list you work from each morning.',
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
    detail:
      'Choose today if you want it on the Today tab now. Choose another day if you want it later — it sits on that date in Plan until then. You can replan or unplan from the card later.',
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
    detail:
      'That way a large task does not flood Today. You can do steps 1 and 2 on Monday and save 3 and 4 for later.',
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
    detail:
      'You tap a card to start a session or edit it. Backlog is automatic. Plan still shows the original date and the stats.',
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
    detail:
      'Standalone Today tasks (not linked to a goal) are not kept in that trash. Goal deletes are.',
    mock: 'sync' as const,
  },
];

function GuideMock({ kind }: { kind: 'today' | 'goals' | 'plan' | 'schedule' | 'steps' | 'sync' }) {
  if (kind === 'goals') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3 space-y-2">
        {['UPSC', 'Phase 1', 'Polity notes'].map((label, i) => (
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
      <div className="space-y-2" aria-hidden>
        <div className="overflow-hidden relative rounded-[12px] border bg-surface shadow-card border-primary">
          <div className="bg-primary-soft border-b border-subtle px-3 py-1.5 flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span className="text-[11px] font-mono font-semibold text-primary">Focus · 12:40</span>
          </div>
          <div className="flex items-start gap-2 px-3 pt-3 pb-2.5">
            <GripVertical size={14} className="mt-1 text-content-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 text-[10px] font-semibold bg-base border border-subtle rounded-lg px-2 py-0.5 mb-1.5">
                <Link2 size={10} className="text-primary shrink-0" />
                <span className="text-primary">UPSC</span>
                <span className="text-content-muted">•</span>
                <span className="text-primary">Phase 1</span>
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
      </div>
    );
  }
  if (kind === 'plan') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3">
        <div className="grid grid-cols-7 gap-1">
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
  if (kind === 'schedule') {
    return (
      <div className="rounded-[12px] border border-subtle bg-base p-3">
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
      <div className="rounded-[12px] border border-subtle bg-base p-3 space-y-1.5">
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
    <div className="rounded-[12px] border border-subtle bg-base p-3 flex items-center gap-3">
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [activeGuideStep, setActiveGuideStep] = useState(0);

  useEffect(() => {
    if (open) {
      setTab('guide');
      setActiveGuideStep(0);
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTo({ left: 0 });
    }
  }, [open]);

  const handleScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollLeft, clientWidth } = scrollContainerRef.current;
    const index = Math.round(scrollLeft / clientWidth);
    setActiveGuideStep(index);
  };

  const scrollToStep = (index: number) => {
    if (!scrollContainerRef.current) return;
    const { clientWidth } = scrollContainerRef.current;
    scrollContainerRef.current.scrollTo({ left: index * clientWidth, behavior: 'smooth' });
    setActiveGuideStep(index);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col pointer-events-auto fade-in">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 bg-base rounded-t-[32px] shadow-sheet border-t border-subtle flex flex-col max-h-[90vh] overflow-hidden slide-up glass-panel">
        <div className="shrink-0 pt-4 pb-2 px-4 flex items-center justify-between border-b border-subtle/50">
          <div className="flex bg-surface rounded-[12px] p-1 border border-subtle">
            <button
              onClick={() => setTab('guide')}
              className={`px-4 py-1.5 rounded-[8px] text-[13px] font-semibold transition-all duration-200 ${
                tab === 'guide' ? 'bg-primary text-on-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              App Guide
            </button>
            <button
              onClick={() => setTab('info')}
              className={`px-4 py-1.5 rounded-[8px] text-[13px] font-semibold transition-all duration-200 ${
                tab === 'info' ? 'bg-primary text-on-primary shadow-sm' : 'text-content-secondary hover:text-content-primary'
              }`}
            >
              How It Works
            </button>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-surface border border-subtle text-content-secondary hover:text-content-primary hover:bg-elevated transition-colors active:scale-[0.98]">
            <X size={18} />
          </button>
        </div>

        {tab === 'guide' && (
          <div className="flex-1 min-h-0 flex flex-col bg-surface/50">
            <div className="px-5 pt-5 pb-2">
              <h2 className="text-xl font-bold tracking-tight text-content-primary">Getting Started</h2>
              <p className="text-[13px] text-content-secondary mt-1">Swipe to see how YouDO helps you focus.</p>
            </div>
            
            {/* Swipeable Carousel */}
            <div 
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-x-auto overflow-y-hidden snap-x snap-mandatory flex no-scrollbar pb-6 pt-2 items-center"
            >
              {USER_GUIDE_STEPS.map((step, idx) => (
                <div key={idx} className="w-full shrink-0 snap-center px-5 flex flex-col h-full justify-center">
                  <div className="bg-elevated border border-subtle rounded-[24px] p-5 shadow-sm h-full max-h-[400px] flex flex-col">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="size-12 rounded-[16px] bg-primary-soft text-primary grid place-items-center shrink-0">
                        <step.icon size={24} strokeWidth={2.2} />
                      </div>
                      <div>
                        <h3 className="text-[17px] font-bold text-content-primary leading-tight tracking-tight">{step.title}</h3>
                        <div className="text-[12px] font-semibold text-primary mt-0.5 uppercase tracking-wide">{step.where}</div>
                      </div>
                    </div>
                    
                    <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar space-y-4">
                      <p className="text-[14px] text-content-primary leading-relaxed font-medium">
                        {step.desc}
                      </p>
                      <div className="space-y-2.5 bg-surface rounded-[16px] p-4 border border-subtle">
                        {step.do.map((line, i) => (
                          <div key={i} className="flex gap-3 text-[13px] text-content-secondary leading-snug">
                            <span className="size-5 rounded-full bg-primary-soft text-primary font-bold text-[10px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Dots */}
            <div className="shrink-0 pb-8 flex items-center justify-center gap-2">
              {USER_GUIDE_STEPS.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => scrollToStep(idx)}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    idx === activeGuideStep ? 'w-6 bg-primary' : 'w-2 bg-border hover:bg-content-muted'
                  }`}
                  aria-label={`Go to step ${idx + 1}`}
                />
              ))}
            </div>
          </div>
        )}

        {tab === 'info' && (
          <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-5 pt-5 pb-10 bg-surface/50">
            <h2 className="text-xl font-bold tracking-tight text-content-primary mb-1">The Three Tabs</h2>
            <p className="text-[13px] text-content-secondary leading-relaxed mb-4">
              Tap a tab below to see what it is used for.
            </p>
            <div className="flex items-center gap-1 rounded-[16px] bg-elevated border border-subtle p-1 mb-5 shadow-sm">
              {HOW_IT_WORKS_TABS.map((t) => {
                const Icon = t.icon;
                const active = howTab === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setHowTab(t.name)}
                    className={`flex-1 h-10 rounded-[12px] flex items-center justify-center gap-2 text-[13px] transition-all duration-200 active:scale-[0.98] ${
                      active
                        ? 'bg-primary text-on-primary font-bold shadow-md'
                        : 'text-content-secondary font-medium hover:text-content-primary hover:bg-surface'
                    }`}
                  >
                    <Icon size={16} strokeWidth={active ? 2.5 : 2} />
                    {t.name}
                  </button>
                );
              })}
            </div>

            {(() => {
              const currentTab = HOW_IT_WORKS_TABS.find((t) => t.name === howTab) ?? HOW_IT_WORKS_TABS[0];
              const Icon = currentTab.icon;
              return (
                <div key={currentTab.name} className="space-y-4 fade-in">
                  <div className="rounded-[24px] border border-subtle bg-elevated p-5 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="size-14 rounded-[16px] bg-primary-soft text-primary grid place-items-center shrink-0">
                        <Icon size={26} strokeWidth={2.2} />
                      </div>
                      <div>
                        <div className="text-[20px] font-bold tracking-tight text-content-primary leading-tight">{currentTab.name}</div>
                        <div className="text-[12px] font-semibold text-primary mt-1 uppercase tracking-wider">{currentTab.role}</div>
                      </div>
                    </div>
                    <p className="mt-4 text-[14px] font-medium text-content-primary leading-relaxed">{currentTab.oneLiner}</p>
                  </div>

                  <div className="px-1">
                    <GuideMock kind={currentTab.mock} />
                  </div>

                  <div className="rounded-[20px] border border-subtle bg-elevated p-4 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-content-muted">You use it to</p>
                    {currentTab.uses.map((line) => (
                      <div key={line} className="flex gap-3 text-[14px] text-content-secondary leading-snug">
                        <Check size={16} className="text-primary shrink-0 mt-0.5" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-[20px] border border-subtle bg-surface p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <X size={16} className="text-error shrink-0 mt-0.5" />
                      <p className="text-[13px] text-content-secondary leading-relaxed">{currentTab.notFor}</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="size-4 rounded-full bg-content-muted flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] text-base font-bold">i</span>
                      </div>
                      <p className="text-[13px] text-content-secondary leading-relaxed">{currentTab.after}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
