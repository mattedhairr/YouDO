import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, Calendar, Check, ChevronLeft, Cloud, Pause, ShieldCheck, Smartphone, Sparkles, Target, TrendingUp, User, X, Zap } from 'lucide-react';
import Overlay from './Overlay';
import './helpCenter.css';

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
    after: 'If a day ends and a card is not done, YouDO moves it to Backlog by itself. Calendar still shows the original date and the stats.',
    mock: 'list' as const,
  },
  {
    icon: Target,
    name: 'Goals',
    role: 'Your full plan',
    oneLiner: 'The map of the work. Nested however you need. Not the daily list.',
    uses: [
      'Add a goal, then name the items inside it your way',
      'Open any branch, or pin and edit any item',
      'Schedule a task when it is ready to do',
    ],
    notFor: 'You do not “work the Goals list” each morning. Schedule a task onto a date, then work from Today.',
    after: 'Edits in Goals update the linked Today and Calendar cards. Delete a goal and it goes to Recently Deleted, not into thin air.',
    mock: 'goals' as const,
  },
  {
    icon: Calendar,
    name: 'Calendar',
    role: 'Any date',
    oneLiner: 'Swipe the date dial through your days; expand the month or statistics when needed.',
    uses: [
      'Pick a quick day, or expand the calendar for any date',
      'Check completed, missed, and backlog on that day',
      'See a compact summary; open Full stats for the details',
    ],
    notFor: 'Calendar is not a second Today list. It is the date-by-date record around Today.',
    after: 'If you scheduled a task for the 18th, it lives on the 18th in Calendar. It appears on Today only when that date is today.',
    mock: 'plan' as const,
  },
  {
    icon: TrendingUp,
    name: 'Board',
    role: 'Optional ranking',
    oneLiner: 'Top ten by net focus, plus your own position. Rankings unlock after ten aspirants join.',
    uses: [
      'Compare today, this week (Monday–today), or this month',
      'Opt in from Settings with a display name',
      'See your rank and nearby competitors without scrolling through everyone',
      'Use streak and bar as context — rank is hours only',
      'Give a top-three member kudos once per day; kudos never change rank',
      'Community opens chat; Admin opens moderation. Unread messages wait until you open them',
      'In a Private Hub chat, tap the goal button to share a goal; your friend can save a fresh copy',
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
    desc: 'Add a goal, then build the plan with your own labels. This is the map — not today’s list.',
    do: [
      'Open Goals and tap Create Goal, then add items inside it.',
      'Go as deep as needed. An item with children is a branch.',
      'Stop dividing when the work is small enough; that endpoint becomes a task you can schedule.',
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
      'That date’s work shows on Today when it arrives, and remains visible in Calendar.',
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
      'During a session, turn the phone sideways or tap Ambient for a big full-screen clock.',
      'Pick a focus sound in Settings → Focus and streak; it plays with the session.',
    ],
    mock: 'today' as const,
  },
  {
    icon: User,
    title: 'Keep your workspace safe',
    where: 'Settings',
    desc: 'Work offline on one device, or connect an account for protected cloud sync.',
    do: [
      'An offline workspace stays on this device. Export a JSON backup if the work matters.',
      'Connect an account in Settings when you want cloud backup and multi-device sync.',
      'Temporary internet loss is safe. When you reconnect, YouDO uploads only if the cloud copy has not changed elsewhere.',
      'If two devices changed, sync pauses and preserves both copies until you review or combine them in Settings.',
      'Before signing out or changing phones, wait for sync or export a JSON backup.',
      'Use Account security to change email or password after confirming your current password.',
      'For an email change, open the latest link in both inboxes, then return to YouDO to check the new address.',
    ],
    mock: 'sync' as const,
  },
];

/** Tips shown before "more tips". */
const TIPS_SHOWN = 3;

type SceneKind = (typeof USER_GUIDE_STEPS)[number]['mock'] | (typeof HOW_IT_WORKS_TABS)[number]['mock'];

/** Animation delay, in seconds, for one piece of a scene. */
const at = (seconds: number) => ({ '--d': `${seconds}s` }) as CSSProperties;

/**
 * A small scene of the app at work. It plays once each time it becomes live
 * (its step is showing); otherwise it rests on its last frame.
 */
function Scene({ kind, live }: { kind: SceneKind; live: boolean }) {
  return (
    <div className={`hc-stage${live ? ' is-live' : ''}`} aria-hidden>
      <SceneBody kind={kind} />
    </div>
  );
}

function SceneBody({ kind }: { kind: SceneKind }) {
  if (kind === 'goals') {
    return (
      <div className="hc-tree">
        {['Learn Spanish', 'Unit 3 · Past tense', 'Irregular verbs', 'Drill 20 verbs'].map((label, i) => (
          <div key={label} className={`hc-node hc-in${i === 3 ? ' is-leaf' : ''}`} style={{ ...at(0.1 + i * 0.35), marginLeft: i * 22 }}>
            <i />
            {label}
            {i === 3 && <b className="hc-tag hc-in" style={at(1.5)}>TASK</b>}
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'schedule') {
    return (
      <div className="hc-schedule">
        <div className="hc-node is-leaf hc-fly"><i />Drill 20 verbs</div>
        <div className="hc-days">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d, i) => (
            <div key={d} className={`hc-day${i === 2 ? ' is-picked' : ''}`}>
              <span>{d}</span>
              <b>{15 + i}</b>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (kind === 'steps') {
    return (
      <div className="hc-steps">
        {['Read the chapter', 'Make notes', 'Revise', 'Practice questions'].map((s, i) => (
          <div key={s} className={`hc-step${i < 2 ? ' is-taken' : ' is-later'}`} style={at(0.3 + i * 0.3)}>
            <span className="hc-box"><Check size={11} strokeWidth={3} /></span>
            <span className="hc-step-name">{s}</span>
            <em>{i < 2 ? 'This date' : 'Later'}</em>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'today') {
    return (
      <div className="hc-focus">
        <svg className="hc-ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="52" className="hc-ring-track" />
          <circle cx="60" cy="60" r="52" className="hc-ring-fill" pathLength={100} />
        </svg>
        <div className="hc-time">12<span>:</span>40<small>FOCUS</small></div>
        <div className="hc-card hc-in" style={at(0.4)}>
          <div><b>Drill 20 verbs</b><em>Learn Spanish · Unit 3</em></div>
          <span><Pause size={12} className="fill-current" /></span>
        </div>
      </div>
    );
  }
  if (kind === 'plan') {
    return (
      <div className="hc-week">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <div key={`${d}-${i}`} className={`hc-cell${i === 3 ? ' is-picked' : ''}`}>
            <span>{d}</span>
            <b>{12 + i}</b>
            {i < 3 && <i className="hc-dot hc-in" style={at(0.3 + i * 0.15)} />}
          </div>
        ))}
        <p className="hc-in" style={at(1)}>15th: scheduled, done, and that day’s stats.</p>
      </div>
    );
  }
  if (kind === 'board') {
    return (
      <div className="hc-board">
        <div className="hc-periods"><b>Today</b><span>Week</span><span>Month</span></div>
        {[['Asha', '3h 10m'], ['Rohan', '2h 40m'], ['You', '2h 05m']].map(([name, time], i) => (
          <div key={name} className={`hc-rank hc-in${i === 2 ? ' is-you' : ''}`} style={at(0.2 + i * 0.25)}>
            <span>{i + 1}</span>
            <b>{name}</b>
            <em>{time}</em>
          </div>
        ))}
      </div>
    );
  }
  if (kind === 'sync') {
    return (
      <div className="hc-sync">
        <span className="hc-end"><Smartphone size={26} /></span>
        <span className="hc-wire">
          {[0, 1, 2].map((i) => <i key={i} style={at(i * 0.5)} />)}
        </span>
        <span className="hc-end"><Cloud size={26} /></span>
        <span className="hc-shield hc-in" style={at(1.2)}><ShieldCheck size={18} /> Both copies kept safe</span>
      </div>
    );
  }
  // list: today's cards.
  return (
    <div className="hc-today">
      {['Read chapter 4', 'Drill 20 verbs', 'Write 5 sentences'].map((t, i) => (
        <div key={t} className={`hc-tc hc-in${i === 0 ? ' is-done' : i === 1 ? ' is-now' : ''}`} style={at(0.15 + i * 0.2)}>
          <i>{i === 0 && <Check size={11} strokeWidth={3} />}</i>
          {t}
        </div>
      ))}
    </div>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function HelpCenterSheet({ open, onClose }: Props) {
  const [tab, setTab] = useState<'guide' | 'tabs'>('guide');
  const [step, setStep] = useState(0);
  const [allTips, setAllTips] = useState(false);
  const [openTab, setOpenTab] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = USER_GUIDE_STEPS.length - 1;

  useEffect(() => {
    if (!open) return;
    setTab('guide');
    setStep(0);
    setAllTips(false);
    setOpenTab(null);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ left: 0 }));
  }, [open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    // Only once the swipe settles, so a step does not replay its entrance mid-swipe.
    if (Math.abs(el.scrollLeft - next * el.clientWidth) > 2) return;
    if (next !== step) {
      setStep(next);
      setAllTips(false);
    }
  };

  const goTo = (index: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: index * el.clientWidth, behavior: 'smooth' });
    setStep(index);
    setAllTips(false);
  };

  const current = HOW_IT_WORKS_TABS.find((t) => t.name === openTab);

  return (
    <Overlay open={open} onClose={onClose} align="full">
      <div className="hc-page">
        <div className="hc-glow" aria-hidden />

        <div className="hc-top">
          {tab === 'guide' ? (
            <div className="hc-progress">
              {USER_GUIDE_STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => goTo(i)}
                  className={i < step ? 'is-done' : i === step ? 'is-now' : ''}
                  aria-label={`Go to ${s.title}`}
                >
                  <i />
                </button>
              ))}
            </div>
          ) : current ? (
            <button type="button" className="hc-crumb" onClick={() => setOpenTab(null)}>
              <ChevronLeft size={16} /> The tabs
            </button>
          ) : (
            <div className="flex-1" />
          )}
          <button type="button" onClick={onClose} className="hc-close" aria-label="Close help">
            <X size={17} />
          </button>
        </div>

        {!current && (
          <div className="hc-switch">
            {(['guide', 'tabs'] as const).map((id) => (
              <button key={id} type="button" onClick={() => setTab(id)} className={tab === id ? 'is-on' : ''}>
                {id === 'guide' ? 'Guide' : 'The tabs'}
              </button>
            ))}
          </div>
        )}

        {tab === 'guide' && (
          <>
            <div ref={scrollRef} onScroll={handleScroll} className="hc-track no-scrollbar">
              {USER_GUIDE_STEPS.map((s, idx) => {
                const active = idx === step;
                const tips = active && allTips ? s.do : s.do.slice(0, TIPS_SHOWN);
                return (
                  <div key={s.title} className={`hc-slide no-scrollbar${active ? ' is-active' : ''}`}>
                    <Scene kind={s.mock} live={active} />
                    <div className="hc-text">
                      <div className="hc-eyebrow">Step {idx + 1} · {s.where}</div>
                      <h2>{s.title}</h2>
                      <p className="hc-lead">{s.desc}</p>
                      <ol className="hc-tips">
                        {tips.map((line, i) => (
                          <li key={line} style={at(0.15 + i * 0.06)}>
                            <span>{i + 1}</span>
                            {line}
                          </li>
                        ))}
                      </ol>
                      {s.do.length > TIPS_SHOWN && !(active && allTips) && (
                        <button type="button" className="hc-more" onClick={() => setAllTips(true)}>
                          + {s.do.length - TIPS_SHOWN} more {s.do.length - TIPS_SHOWN === 1 ? 'tip' : 'tips'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="hc-bottom">
              <button
                type="button"
                className="hc-back"
                onClick={() => goTo(step - 1)}
                disabled={step === 0}
                aria-label="Previous step"
              >
                <ChevronLeft size={22} />
              </button>
              <button type="button" className="hc-next" onClick={() => (step === last ? onClose() : goTo(step + 1))}>
                {step === last ? 'Start planning' : 'Next'}
                <ArrowRight size={17} strokeWidth={2.4} />
              </button>
            </div>
          </>
        )}

        {tab === 'tabs' && !current && (
          <div className="hc-scroll no-scrollbar">
            <div className="hc-text is-plain">
              <h2>Four tabs, four jobs</h2>
              <p className="hc-lead">Tap one to see what it is for — and what it is not.</p>
            </div>
            <div className="hc-tiles">
              {HOW_IT_WORKS_TABS.map((t, i) => (
                <button key={t.name} type="button" className="hc-tile" style={at(i * 0.06)} onClick={() => setOpenTab(t.name)}>
                  <span className="hc-tile-icon"><t.icon size={18} strokeWidth={2.4} /></span>
                  <span>
                    <b>{t.name}</b>
                    <em>{t.role}</em>
                  </span>
                </button>
              ))}
            </div>
            <p className="hc-hint">
              Not sure where something goes? Plan it in <b>Goals</b>, do it in <b>Today</b>.
            </p>
          </div>
        )}

        {tab === 'tabs' && current && (
          <div key={current.name} className="hc-scroll hc-detail no-scrollbar">
            <Scene kind={current.mock} live />
            <div className="hc-text is-plain">
              <div className="hc-eyebrow">{current.name} · {current.role}</div>
              <h2>{current.name}</h2>
              <p className="hc-lead">{current.oneLiner}</p>
              <div className="hc-uses">
                {current.uses.map((line) => (
                  <span key={line}><Check size={13} strokeWidth={3} />{line}</span>
                ))}
              </div>
              <div className="hc-not">
                <b>Not for</b>
                {current.notFor}
              </div>
              <p className="hc-after">{current.after}</p>
            </div>
          </div>
        )}
      </div>
    </Overlay>
  );
}
