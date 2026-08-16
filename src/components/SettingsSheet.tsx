import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Download,
  Edit2,
  GripVertical,
  History,
  Link2,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Sparkles,
  Sun,
  Target,
  Trash2,
  Upload,
  User,
  UserPlus,
  Zap,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import Overlay from './Overlay';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { visitSnapshotLabel } from '../lib/cloudBackup';
import { formatBackupStamp } from '../lib/format';
import { useStore } from '../store';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenAuth?: (mode: 'signin' | 'signup') => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-content-muted mb-2 px-1">
      {children}
    </h2>
  );
}

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
        <div className="overflow-hidden relative rounded-[12px] border bg-surface shadow-card border-subtle">
          <div className="flex items-start gap-2 px-3 pt-3 pb-2.5">
            <GripVertical size={14} className="mt-1 text-content-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="inline-flex items-center gap-1 text-[10px] font-semibold bg-base border border-subtle rounded-lg px-2 py-0.5 mb-1.5">
                <Link2 size={10} className="text-primary shrink-0" />
                <span className="text-primary">UPSC</span>
                <span className="text-content-muted">•</span>
                <span className="text-primary">Phase 1</span>
              </div>
              <div className="flex items-start gap-2 min-w-0">
                  <span className="mt-[6px] w-1.5 h-1.5 rounded-full bg-secondary shrink-0" />
                  <h3 className="text-[14px] font-semibold text-content-primary leading-snug">MCQ set B</h3>
                </div>
              <div className="mt-2 flex items-center gap-1 text-[11px] text-content-secondary font-medium ml-3.5">
                <Calendar size={11} className="text-content-muted" /> Today
              </div>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5">
            <div className="h-full bg-secondary opacity-80 w-1/3" />
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

export default function SettingsSheet({ open, onClose, onOpenAuth }: Props) {
  const {
    exportBackup,
    importBackup,
    syncToCloud,
    restoreFromCloud,
    restoreFromVisitSnapshot,
    listCloudRestorePoints,
    recentlyDeletedGoals,
    restoreDeletedGoal,
    clearTrash,
    tasks,
    goals,
  } = useStore();
  const { user, signOut, updateProfile } = useAuth();
  const [theme, setTheme] = useTheme();

  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [restorePoints, setRestorePoints] = useState<{
    live: { updatedAt: string } | null;
    visits: { id: string; createdAt: string }[];
  } | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<
    { kind: 'live' } | { kind: 'visit'; id: string; label: string; when: string } | null
  >(null);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [confirmWipeCloud, setConfirmWipeCloud] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState(user?.user_metadata?.full_name || '');
  const [editAvatar, setEditAvatar] = useState(user?.user_metadata?.avatar_url || '🎓');
  const [howOpen, setHowOpen] = useState(false);
  const [howTab, setHowTab] = useState(HOW_IT_WORKS_TABS[0].name);
  const [exportOpen, setExportOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const [hapticsEnabled, setHapticsEnabled] = useState(() => {
    try {
      const val = localStorage.getItem('youdo_haptics_enabled');
      return val === null ? true : JSON.parse(val) === true;
    } catch {
      return true;
    }
  });

  const toggleHaptics = () => {
    const next = !hapticsEnabled;
    setHapticsEnabled(next);
    localStorage.setItem('youdo_haptics_enabled', JSON.stringify(next));
  };

  const [guideStep, setGuideStep] = useState(0);
  const [guideMore, setGuideMore] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setHowOpen(false);
      setHowTab(HOW_IT_WORKS_TABS[0].name);
      setTrashOpen(false);
      setGuideOpen(false);
      setGuideStep(0);
      setGuideMore(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !user || !restoreOpen) return;
    let cancelled = false;
    setRestoreLoading(true);
    void listCloudRestorePoints()
      .then((points) => {
        if (cancelled) return;
        setRestorePoints(points);
        setRestoreLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setRestorePoints({ live: null, visits: [] });
        setRestoreLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, user, restoreOpen, listCloudRestorePoints]);

  if (!open) return null;

  const handleExport = async () => {
    try {
      const status = await exportBackup();
      setMsg({ text: status });
    } catch {
      setMsg({ text: 'Failed to export backup.', error: true });
    }
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    setConfirmImport(false);
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importBackup(reader.result as string);
      if (ok && user) syncToCloud();
      setMsg(
        ok
          ? { text: '✓ Backup restored & synced to cloud!' }
          : { text: '✗ Invalid or corrupted backup file.', error: true },
      );
    };
    reader.readAsText(file);
  };

  return (
    <Overlay open={open} onClose={onClose} align="full">
    <div
      className="app-frame h-full w-full max-w-md mx-auto bg-base page-slide-in flex flex-col overflow-hidden border-x border-subtle"
    >
      {/* ── 1. Clean Top Bar ── */}
      <div
        className="flex items-center gap-3 px-4 border-b border-subtle shrink-0 bg-elevated"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}
      >
        <button
          onClick={
            howOpen
              ? () => setHowOpen(false)
              : guideOpen
                ? () => {
                    setGuideOpen(false);
                    setGuideStep(0);
                    setGuideMore(false);
                  }
                : trashOpen
                  ? () => setTrashOpen(false)
                  : onClose
          }
          className="p-2 -ml-1.5 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition-colors active:scale-95 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[16px] font-semibold text-content-primary leading-tight">
          {howOpen
            ? 'The three tabs'
            : guideOpen
              ? 'Getting started'
              : trashOpen
                ? 'Recently Deleted'
                : 'Settings'}
        </h1>
      </div>

      {howOpen ? (
      <div key="how-tabs-no-taps" className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-4 pt-4 pb-10">
        <p className="text-[12px] text-content-secondary leading-relaxed mb-3">
          Tap a tab. The rest of this page is what that tab is for.
        </p>
        <div className="flex items-center gap-0.5 rounded-[16px] bg-surface border border-subtle p-1 mb-4 shadow-elevated">
          {HOW_IT_WORKS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = howTab === tab.name;
            return (
              <button
                key={tab.name}
                type="button"
                onClick={() => setHowTab(tab.name)}
                aria-pressed={active}
                className={`flex-1 h-10 rounded-[12px] flex items-center justify-center gap-1.5 text-[12px] transition-colors ${
                  active
                    ? 'bg-primary text-on-primary font-semibold'
                    : 'text-content-muted font-medium hover:text-content-primary'
                }`}
              >
                <Icon size={15} strokeWidth={active ? 2.4 : 2} />
                {tab.name}
              </button>
            );
          })}
        </div>

        {(() => {
          const tab = HOW_IT_WORKS_TABS.find((t) => t.name === howTab) ?? HOW_IT_WORKS_TABS[0];
          const Icon = tab.icon;
          return (
            <div key={tab.name} className="space-y-3 fade-in">
              <div className="rounded-2xl border border-subtle bg-elevated p-4">
                <div className="flex items-center gap-3">
                  <div className="size-10 grid place-items-center rounded-[12px] bg-primary-soft text-primary shrink-0">
                    <Icon size={18} strokeWidth={2.2} />
                  </div>
                  <div>
                    <div className="text-[16px] font-semibold text-content-primary leading-tight">{tab.name}</div>
                    <div className="text-[11px] font-medium text-primary mt-0.5">{tab.role}</div>
                  </div>
                </div>
                <p className="mt-3 text-[13px] text-content-primary leading-relaxed">{tab.oneLiner}</p>
              </div>

              <GuideMock kind={tab.mock} />

              <div className="rounded-2xl border border-subtle bg-elevated p-3.5 space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">You use it to</p>
                {tab.uses.map((line) => (
                  <div key={line} className="flex gap-2.5 text-[13px] text-content-secondary leading-snug">
                    <Check size={14} className="text-primary shrink-0 mt-0.5" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-subtle bg-surface p-3.5 space-y-2">
                <p className="text-[13px] text-content-secondary leading-relaxed">{tab.notFor}</p>
                <p className="text-[13px] text-content-secondary leading-relaxed">{tab.after}</p>
              </div>
            </div>
          );
        })()}

        <div className="mt-4 rounded-2xl border border-primary/25 bg-primary-soft p-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary mb-1.5">How they connect</p>
          <p className="text-[13px] text-content-primary leading-relaxed">
            Goals holds the map. Schedule puts a task on any date. If that date is today, it shows on Today. If not, it shows in Plan until that day comes. Focus sessions run from Today cards.
          </p>
        </div>
      </div>
      ) : guideOpen ? (
      <div className="flex-1 flex flex-col min-h-0">
        {(() => {
          const step = USER_GUIDE_STEPS[guideStep] ?? USER_GUIDE_STEPS[0];
          const Icon = step.icon;
          const last = guideStep === USER_GUIDE_STEPS.length - 1;
          return (
            <>
              <div className="px-4 pt-3 pb-2 shrink-0">
                <div className="flex gap-1">
                  {USER_GUIDE_STEPS.map((s, i) => (
                    <button
                      key={s.title}
                      type="button"
                      onClick={() => {
                        setGuideMore(false);
                        setGuideStep(i);
                      }}
                      className={`flex-1 h-8 rounded-[10px] text-[11px] font-semibold tabular-nums ${
                        i === guideStep
                          ? 'bg-primary text-on-primary'
                          : i < guideStep
                            ? 'bg-primary-soft text-primary'
                            : 'bg-elevated border border-subtle text-content-muted'
                      }`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              </div>
              <div key={guideStep} className="flex-1 min-h-0 overflow-y-auto overscroll-contain no-scrollbar px-4 pb-3 fade-in">
                <div className="flex items-center gap-3 mb-3">
                  <div className="size-10 shrink-0 grid place-items-center rounded-[12px] bg-primary-soft text-primary">
                    <Icon size={18} strokeWidth={2.1} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-content-primary leading-snug">{step.title}</h2>
                    <p className="text-[11px] font-medium text-primary mt-0.5">{step.where}</p>
                  </div>
                </div>
                <p className="text-[14px] text-content-primary leading-relaxed mb-3">{step.desc}</p>
                <GuideMock kind={step.mock} />
                <div className="mt-3 rounded-2xl border border-subtle bg-elevated p-3.5 space-y-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-content-muted">Do this</p>
                  {step.do.map((line, i) => (
                    <div key={line} className="flex gap-2.5">
                      <span className="size-5 shrink-0 rounded-full bg-primary-soft text-primary text-[10px] font-semibold grid place-items-center tabular-nums mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-[13px] text-content-secondary leading-snug">{line}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setGuideMore((v) => !v)}
                  className="mt-3 w-full flex items-center justify-between gap-2 rounded-[12px] border border-subtle bg-surface px-3 py-2.5 text-left"
                >
                  <span className="text-[12px] font-semibold text-primary">
                    {guideMore ? 'Hide extra detail' : 'Need more detail?'}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-primary shrink-0 transition-transform ${guideMore ? 'rotate-180' : ''}`}
                  />
                </button>
                {guideMore && (
                  <p className="mt-2.5 text-[13px] text-content-secondary leading-relaxed fade-in">{step.detail}</p>
                )}
              </div>
              <div className="shrink-0 px-4 pb-5 pt-2 flex items-center gap-2 border-t border-subtle bg-base">
                <button
                  type="button"
                  disabled={guideStep === 0}
                  onClick={() => {
                    setGuideMore(false);
                    setGuideStep((s) => Math.max(0, s - 1));
                  }}
                  className="h-11 px-4 rounded-[12px] text-[13px] font-medium border border-subtle text-content-secondary disabled:opacity-30"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (last) {
                      setGuideOpen(false);
                      setGuideStep(0);
                      setGuideMore(false);
                    } else {
                      setGuideMore(false);
                      setGuideStep((s) => s + 1);
                    }
                  }}
                  className="flex-1 h-11 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold"
                >
                  {last ? 'Done' : 'Next'}
                </button>
              </div>
            </>
          );
        })()}
      </div>
      ) : trashOpen ? (
      <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-4 pt-4 pb-12">
        <p className="text-[12px] text-content-secondary leading-relaxed px-0.5 mb-4">
          Deleted goal nodes and their linked tasks are kept here (up to 20). Restore brings them back. Standalone Today tasks are not stored.
        </p>
        {recentlyDeletedGoals.length === 0 ? (
          <div className="bg-elevated rounded-2xl border border-subtle p-8 text-center">
            <div className="mx-auto w-12 h-12 grid place-items-center rounded-2xl bg-surface">
              <Trash2 size={20} className="text-content-muted" />
            </div>
            <p className="mt-3 text-[13px] font-semibold text-content-primary">Trash is empty</p>
            <p className="mt-1 text-[12px] text-content-secondary">Deleted goals will appear here for recovery.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2 px-0.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-content-muted">
                {recentlyDeletedGoals.length} {recentlyDeletedGoals.length === 1 ? 'item' : 'items'}
              </span>
              <button
                type="button"
                onClick={clearTrash}
                className="text-[11px] font-semibold text-error"
              >
                Empty trash
              </button>
            </div>
            <div className="bg-elevated rounded-2xl border border-subtle overflow-hidden divide-y divide-white/5">
              {recentlyDeletedGoals.map((rec) => (
                <div key={rec.id} className="p-3.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-semibold text-content-primary truncate">{rec.node.title}</div>
                    <div className="mt-0.5 text-[11px] text-content-muted">
                      {new Date(rec.deletedAt).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {rec.tasks.length > 0
                        ? ` · ${rec.tasks.length} linked ${rec.tasks.length === 1 ? 'task' : 'tasks'}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => restoreDeletedGoal(rec.id)}
                    className="shrink-0 h-8 px-2.5 rounded-[10px] text-[11px] font-semibold bg-primary-soft text-primary"
                  >
                    Restore
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      ) : (
      <div className="flex-1 overflow-y-auto overscroll-contain no-scrollbar px-4 pt-4 pb-12 space-y-4">
        {/* Status Messages */}
        {msg && (
          <div
            className={`p-3 rounded-2xl text-xs font-bold flex items-center justify-between animate-fade-in ${
              msg.error
                ? 'bg-error-soft border border-error/20 text-error'
                : 'bg-secondary/10 border border-secondary/20 text-secondary'
            }`}
          >
            <span>{msg.text}</span>
            <button onClick={() => setMsg(null)} className="text-xs opacity-70 hover:opacity-100">
              ✕
            </button>
          </div>
        )}

        {/* ── SECTION 1: ACCOUNT & SYNC ── */}
        <section>
          <SectionLabel>ACCOUNT &amp; SYNC</SectionLabel>
          <div className="bg-elevated rounded-2xl border border-subtle overflow-hidden shadow-lg">
            {user ? (
              <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute -top-16 right-[-36px] w-52 h-52 rounded-full bg-secondary/20 blur-3xl ambient-orb" />
                <div className="pointer-events-none absolute -bottom-20 left-[-40px] w-44 h-44 rounded-full bg-primary/18 blur-3xl ambient-orb ambient-orb-delay" />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(110% 70% at 12% -10%, rgba(134, 165, 136, 0.22), transparent 52%), radial-gradient(120% 80% at 92% 8%, rgba(196, 165, 116, 0.18), transparent 56%)',
                  }}
                />
                <div className="relative p-5">
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      <div className="size-[3.35rem] rounded-[16px] bg-primary-soft border border-primary/35 grid place-items-center text-[26px] shadow-elevated">
                        {user.user_metadata?.avatar_url && /^https?:/.test(String(user.user_metadata.avatar_url)) ? (
                          <img
                            src={user.user_metadata.avatar_url}
                            alt=""
                            className="size-full rounded-[16px] object-cover"
                          />
                        ) : (
                          user.user_metadata?.avatar_url || '🎓'
                        )}
                      </div>
                      <span className="absolute -bottom-1 -right-1 size-5 rounded-full bg-secondary-soft border border-secondary/40 grid place-items-center">
                        <ShieldCheck size={11} className="text-secondary" strokeWidth={2.4} />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-secondary">Live on every device</p>
                      <h3 className="text-[17px] font-semibold text-content-primary leading-tight mt-0.5 truncate">
                        {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Aspirant'}
                      </h3>
                      <p className="text-[12px] text-content-secondary truncate mt-0.5">{user.email}</p>
                    </div>
                  </div>

                  <p className="mt-4 text-[13px] text-content-secondary leading-relaxed">
                    This plan is yours — goals, Today, and focus time stay in sync when you open YouDO on another phone.
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-semibold tracking-wide text-secondary bg-secondary-soft border border-secondary/25 px-2.5 py-1 rounded-full">
                      Cloud live
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide text-primary bg-primary-soft border border-primary/20 px-2.5 py-1 rounded-full">
                      {goals.length} {goals.length === 1 ? 'goal' : 'goals'}
                    </span>
                    <span className="text-[10px] font-semibold tracking-wide text-primary bg-primary-soft border border-primary/20 px-2.5 py-1 rounded-full">
                      {tasks.length} {tasks.length === 1 ? 'card' : 'cards'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const res = await syncToCloud();
                      setMsg(
                        res.ok
                          ? { text: '✓ Cloud backup synced.' }
                          : { text: `✗ ${res.error || 'Failed to sync.'}`, error: true },
                      );
                    }}
                    className="mt-5 w-full h-11 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <Upload size={15} strokeWidth={2.25} />
                    Sync now
                  </button>

                  {tasks.length === 0 && goals.length === 0 && (
                    confirmWipeCloud ? (
                      <div className="mt-2 rounded-[12px] border border-error/30 bg-error-soft p-3 space-y-2">
                        <p className="text-[12px] text-content-secondary leading-relaxed">
                          This device has no goals or cards. Clearing the cloud backup removes the copy on your other devices too. This cannot be undone from here.
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const res = await syncToCloud({ allowEmpty: true });
                              setConfirmWipeCloud(false);
                              setMsg(
                                res.ok
                                  ? { text: '✓ Cloud backup cleared.' }
                                  : { text: `✗ ${res.error || 'Failed to clear cloud backup.'}`, error: true },
                              );
                            }}
                            className="flex-1 h-10 rounded-[12px] bg-error text-on-primary text-[12px] font-semibold"
                          >
                            Yes, clear cloud
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmWipeCloud(false)}
                            className="flex-1 h-10 rounded-[12px] border border-subtle text-[12px] font-medium text-content-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmWipeCloud(true)}
                        className="mt-2 w-full h-10 rounded-[12px] text-[12px] font-medium text-content-secondary hover:text-error hover:bg-error-soft flex items-center justify-center gap-1.5"
                      >
                        <Trash2 size={14} />
                        Clear cloud backup
                      </button>
                    )
                  )}

                  <div className="mt-2 grid grid-cols-3 gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditName(user.user_metadata?.full_name || '');
                        setEditAvatar(user.user_metadata?.avatar_url || '🎓');
                        setEditProfileOpen((p) => !p);
                        setRestoreOpen(false);
                      }}
                      className="h-10 rounded-[12px] text-[12px] font-medium text-content-secondary hover:text-content-primary hover:bg-surface/80 flex items-center justify-center gap-1.5"
                    >
                      <Edit2 size={13} className="text-primary" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmRestore(null);
                        setRestoreOpen((v) => !v);
                        setEditProfileOpen(false);
                      }}
                      className="h-10 rounded-[12px] text-[12px] font-medium text-content-secondary hover:text-content-primary hover:bg-surface/80 flex items-center justify-center gap-1.5"
                    >
                      <History size={13} className="text-secondary" />
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={() => signOut()}
                      className="h-10 rounded-[12px] text-[12px] font-medium text-content-secondary hover:text-error hover:bg-error-soft flex items-center justify-center gap-1.5"
                    >
                      <LogOut size={13} />
                      Sign out
                    </button>
                  </div>
                </div>

                {editProfileOpen && (
                  <div className="relative px-5 pb-4 space-y-3">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">
                        Full name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Aspirant's name"
                        className="w-full bg-surface border border-subtle rounded-xl px-3 py-2.5 text-sm text-content-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">
                        Mark
                      </label>
                      <div className="flex gap-2 items-center overflow-x-auto no-scrollbar py-1">
                        {['🎓', '⚡', '🏆', '🚀', '🦉', '🧠', '🎯', '📚'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditAvatar(emoji)}
                            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition border shrink-0 ${
                              editAvatar === emoji
                                ? 'bg-primary-soft border-primary scale-105'
                                : 'bg-surface border-subtle text-content-muted hover:bg-elevated'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const ok = await updateProfile({ fullName: editName, avatarUrl: editAvatar });
                        if (ok) {
                          setEditProfileOpen(false);
                          setMsg({ text: '✓ Profile updated.' });
                        }
                      }}
                      className="w-full h-11 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold"
                    >
                      Save profile
                    </button>
                  </div>
                )}

                {restoreOpen && (
                  <div className="relative px-5 pb-4 space-y-2">
                    <p className="text-[12px] text-content-secondary leading-relaxed">
                      Latest is what is in the cloud now. The other copies were frozen each time you opened the app (last 3 visits). Restoring replaces goals, tasks, and session stats on this device.
                    </p>
                    {restoreLoading && (
                      <p className="text-[12px] text-content-muted">Loading copies…</p>
                    )}
                    {!restoreLoading && restorePoints && !restorePoints.live && restorePoints.visits.length === 0 && (
                      <p className="text-[12px] text-content-secondary">No cloud backup found yet.</p>
                    )}
                    {!restoreLoading && restorePoints?.live && (
                      <button
                        type="button"
                        onClick={() => setConfirmRestore({ kind: 'live' })}
                        className="w-full text-left p-3 rounded-xl bg-surface border border-subtle hover:border-primary/40 transition"
                      >
                        <div className="text-[12px] font-semibold text-content-primary">Latest cloud</div>
                        <div className="text-[11px] text-content-secondary mt-0.5">
                          Includes this visit · {formatBackupStamp(restorePoints.live.updatedAt)}
                        </div>
                      </button>
                    )}
                    {!restoreLoading &&
                      restorePoints?.visits.map((visit, index) => (
                        <button
                          key={visit.id}
                          type="button"
                          onClick={() =>
                            setConfirmRestore({
                              kind: 'visit',
                              id: visit.id,
                              label: visitSnapshotLabel(index),
                              when: formatBackupStamp(visit.createdAt),
                            })
                          }
                          className="w-full text-left p-3 rounded-xl bg-surface border border-subtle hover:border-primary/40 transition"
                        >
                          <div className="text-[12px] font-semibold text-content-primary">{visitSnapshotLabel(index)}</div>
                          <div className="text-[11px] text-content-secondary mt-0.5">{formatBackupStamp(visit.createdAt)}</div>
                        </button>
                      ))}
                    {confirmRestore && (
                      <div className="rounded-xl bg-error-soft border border-error/20 p-3 space-y-2">
                        <div className="flex items-center gap-2 text-error font-semibold text-[12px]">
                          <AlertTriangle size={14} className="shrink-0" />
                          Replace current data?
                        </div>
                        <p className="text-[11px] text-error/75 font-medium leading-relaxed">
                          {confirmRestore.kind === 'live'
                            ? 'Restore the latest cloud copy. Anything only on this device since the last sync will be lost.'
                            : `Restore “${confirmRestore.label}” from ${confirmRestore.when}. Work after that copy will be lost.`}
                        </p>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const ok =
                                confirmRestore.kind === 'live'
                                  ? await restoreFromCloud()
                                  : await restoreFromVisitSnapshot(confirmRestore.id);
                              setConfirmRestore(null);
                              setRestoreOpen(false);
                              setMsg(
                                ok
                                  ? { text: '✓ Restored from cloud copy.' }
                                  : { text: '✗ Could not restore that copy.', error: true },
                              );
                            }}
                            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-error"
                          >
                            Restore this copy
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmRestore(null)}
                            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-content-secondary bg-surface"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative px-5 pb-4 flex justify-end">
                  {!confirmDeleteAccount ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="text-[11px] font-medium text-content-muted hover:text-error flex items-center gap-1.5 py-1"
                    >
                      <Trash2 size={12} /> Delete account
                    </button>
                  ) : (
                    <div className="w-full rounded-xl bg-error-soft p-3 space-y-2">
                      <div className="flex items-center gap-2 text-error font-semibold text-[11px]">
                        <AlertTriangle size={13} /> Delete account and reset data?
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            setConfirmDeleteAccount(false);
                            await signOut();
                            setMsg({ text: '✓ Signed out & data reset.' });
                          }}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white bg-error"
                        >
                          Yes, delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteAccount(false)}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-content-secondary bg-surface"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute -top-20 right-[-40px] w-52 h-52 rounded-full bg-primary/20 blur-3xl ambient-orb" />
                <div className="pointer-events-none absolute -bottom-24 left-[-48px] w-48 h-48 rounded-full bg-secondary/15 blur-3xl ambient-orb ambient-orb-delay" />
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background:
                      'radial-gradient(120% 80% at 82% -8%, rgba(196, 165, 116, 0.22), transparent 58%)',
                  }}
                />
                <div className="relative p-5">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="size-12 rounded-[14px] bg-primary-soft border border-primary/30 grid place-items-center shrink-0 shadow-elevated">
                      <Cloud size={20} className="text-primary" strokeWidth={2.1} />
                    </div>
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">This device only</p>
                      <h3 className="text-[17px] font-semibold text-content-primary leading-tight mt-0.5">
                        Guest mode
                      </h3>
                    </div>
                  </div>
                  <p className="text-[13px] text-content-secondary leading-relaxed">
                    Your goals and sessions stay on this phone. Sign in to use the same plan on another device.
                  </p>
                  <div className="mt-3.5 flex flex-wrap gap-1.5">
                    {['Goals', 'Today', 'Focus stats'].map((label) => (
                      <span
                        key={label}
                        className="text-[10px] font-semibold tracking-wide text-primary bg-primary-soft border border-primary/20 px-2.5 py-1 rounded-full"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenAuth?.('signin')}
                    className="mt-5 w-full h-11 rounded-[12px] bg-primary text-on-primary text-[13px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98]"
                  >
                    <LogIn size={15} strokeWidth={2.25} />
                    Sign in
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenAuth?.('signup')}
                    className="mt-2 w-full h-10 rounded-[12px] text-[13px] font-medium text-content-secondary hover:text-content-primary hover:bg-surface/80 flex items-center justify-center gap-1.5"
                  >
                    <UserPlus size={14} className="text-primary" />
                    Create an account
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── SECTION 2: APPEARANCE ── */}
        <section>
          <SectionLabel>APPEARANCE</SectionLabel>
          <div className="bg-elevated rounded-2xl border border-subtle p-4 flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
                {theme.darkMode ? <Moon size={16} /> : <Sun size={16} />}
              </div>
              <div>
                <h3 className="text-xs font-semibold text-content-primary">Theme</h3>
                <p className="text-[10.5px] text-content-secondary font-medium">Dark or Light look</p>
              </div>
            </div>

            {/* Segmented Switch Control */}
            <div className="flex bg-base p-1 rounded-xl border border-subtle shrink-0">
              <button
                type="button"
                onClick={() => setTheme({ darkMode: true })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  theme.darkMode
                    ? 'bg-primary text-on-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Moon size={12} /> Dark
              </button>
              <button
                type="button"
                onClick={() => setTheme({ darkMode: false })}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                  !theme.darkMode
                    ? 'bg-primary text-on-primary'
                    : 'text-content-secondary hover:text-content-primary'
                }`}
              >
                <Sun size={12} /> Light
              </button>
            </div>
          </div>

          <div className="bg-elevated rounded-2xl border border-subtle p-4 flex items-center justify-between shadow-lg mt-2">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center text-primary shrink-0">
                <Smartphone size={16} />
              </div>
              <div>
                <h3 className="text-xs font-semibold text-content-primary">Haptic Feedback</h3>
                <p className="text-[10.5px] text-content-secondary font-medium">Vibrate on actions</p>
              </div>
            </div>

            <button
              type="button"
              onClick={toggleHaptics}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
                hapticsEnabled ? 'bg-primary' : 'bg-surface border border-subtle'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  hapticsEnabled ? 'translate-x-2' : '-translate-x-2'
                }`}
              />
            </button>
          </div>
        </section>

        {/* ── SECTION 3: DATA & STORAGE ── */}
        <section>
          <SectionLabel>DATA &amp; STORAGE</SectionLabel>
          <div className="bg-elevated rounded-2xl border border-subtle overflow-hidden shadow-lg divide-y divide-white/5">
            <button
              type="button"
              onClick={() => setTrashOpen(true)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/2 transition"
            >
              <div className="flex items-center gap-3">
                <Trash2 size={16} className="text-primary shrink-0" />
                <div>
                  <h3 className="text-xs font-semibold text-content-primary">Recently Deleted Goals</h3>
                  <p className="text-[10.5px] text-content-secondary font-medium">
                    {recentlyDeletedGoals.length} {recentlyDeletedGoals.length === 1 ? 'item' : 'items'} in trash
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-content-muted" />
            </button>

            {/* Row 2: Export JSON */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Download size={16} className="text-primary shrink-0" />
                <div>
                  <h3 className="text-xs font-semibold text-content-primary">Export Backup (JSON)</h3>
                  <p className="text-[10.5px] text-content-secondary font-medium">Download offline JSON snapshot</p>
                </div>
              </div>
              <button
                onClick={handleExport}
                className="py-1.5 px-3 rounded-xl bg-primary-soft hover:bg-primary-soft text-primary-glow text-xs font-semibold transition active:scale-95"
              >
                Export
              </button>
            </div>

            {/* Row 3: Import JSON */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Upload size={16} className="text-secondary shrink-0" />
                <div>
                  <h3 className="text-xs font-semibold text-content-primary">Import Backup (JSON)</h3>
                  <p className="text-[10.5px] text-content-secondary font-medium">Restore state from file</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setMsg(null);
                  setConfirmImport(true);
                }}
                className="py-1.5 px-3 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-xs font-semibold transition active:scale-95"
              >
                Import
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              handleImport(e.target.files?.[0]);
              if (fileRef.current) fileRef.current.value = '';
            }}
          />

          {confirmImport && (
            <div className="rounded-2xl bg-error-soft border border-error/20 p-3.5 space-y-2.5 animate-fade-in">
              <div className="flex items-center gap-2 text-error font-semibold text-[12px]">
                <AlertTriangle size={14} className="shrink-0" />
                Replace ALL current data?
              </div>
              <p className="text-[11px] text-error/75 font-medium leading-relaxed">
                Your goals and tasks will be overwritten by the backup file. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-error hover:bg-error-soft transition"
                >
                  Yes, Replace All
                </button>
                <button
                  onClick={() => setConfirmImport(false)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-content-secondary bg-surface hover:bg-elevated transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── SECTION 4: INFORMATION & GUIDES ── */}
        <section>
          <SectionLabel>INFORMATION &amp; GUIDES</SectionLabel>
          <div className="bg-elevated rounded-2xl border border-subtle overflow-hidden shadow-lg divide-y divide-white/5">
            <button
              type="button"
              onClick={() => setHowOpen(true)}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/2 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Sparkles size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-content-primary">The three tabs</h3>
                  <p className="text-[10.5px] text-content-secondary font-medium">What Goals, Today, and Plan are for</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-content-muted shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => {
                setGuideStep(0);
                setGuideMore(false);
                setGuideOpen(true);
              }}
              className="w-full p-4 flex items-center justify-between text-left hover:bg-white/2 transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Zap size={16} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <h3 className="text-xs font-semibold text-content-primary">Getting started</h3>
                  <p className="text-[10.5px] text-content-secondary font-medium">Five steps. One at a time.</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-content-muted shrink-0" />
            </button>
          </div>
        </section>
      </div>
      )}
    </div>
    </Overlay>
  );
}
