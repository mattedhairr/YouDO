import { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  ChevronDown,
  Download,
  Github,
  GitMerge,
  Instagram,
  Layers,
  Linkedin,
  LogIn,
  LogOut,
  Upload,
  User,
  Zap,
  BarChart2,
  Clock,
  Sparkles,
  UserPlus,
  ShieldCheck,
  Trash2,
  Edit2,
  Cloud,
  Moon,
  Sun,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenAuth?: (mode?: 'signin' | 'signup') => void;
}

const APP_FEATURES = [
  {
    icon: Sparkles,
    title: 'Built for Serious Aspirants',
    desc: 'UPSC, JEE, NEET, GATE, and CAT require covering thousands of sub-topics. Traditional todo lists create chaos. YouDO turns massive syllabi into executable blueprints.',
  },
  {
    icon: GitMerge,
    title: '6-Tier Goal Hierarchy',
    desc: 'Structured progression from high-level target down to granular revision leaf: Goal → Phase → Section → Task → Sub-task → Leaf.',
  },
  {
    icon: Zap,
    title: 'Step-Slice Execution & Backlog Sync',
    desc: 'Schedule micro-step slices into Today or Backlog. Starting a Backlog session moves it to Today, and completing tasks automatically updates your main Goal tree.',
  },
  {
    icon: BarChart2,
    title: 'Precision Focus & Efficiency Analytics',
    desc: 'Track Net Focus Time (NFT) vs Total Duration with pause timestamp logs and screen-on Ambient Focus Mode for uninterrupted study desks.',
  },
];

const USER_GUIDE_STEPS = [
  {
    icon: Layers,
    accent: '#7C3AED',
    bg: 'bg-violet-600/12 border-violet-500/20',
    dotBg: 'bg-violet-500/20',
    title: '1. Lay Your Goal Blueprint',
    desc: 'Start in the Goals section. Create your macro target and break it down through all 6 tiers with concrete micro-steps.',
    example: 'Goal: UPSC CSE 2026 → Phase: GS Paper 1 → Section: Modern History → Task: Freedom Movement → Sub-task: Non-Cooperation → Leaf: Read NCERT Ch 5 & PYQs',
  },
  {
    icon: CalendarCheck,
    accent: '#10B981',
    bg: 'bg-emerald-600/12 border-emerald-500/20',
    dotBg: 'bg-emerald-500/20',
    title: '2. Step-Slice Scheduling',
    desc: 'Never study vague "physics" blocks. Select exact micro-tasks or step slices from any goal node and dispatch them directly to Today\'s schedule.',
    example: 'Select "NCERT Chapter 5" micro-steps and push to Today. Only those specific steps will appear on your daily card.',
  },
  {
    icon: Zap,
    accent: '#F59E0B',
    bg: 'bg-amber-600/12 border-amber-500/20',
    dotBg: 'bg-amber-500/20',
    title: '3. Backlog & Today Bidirectional Sync',
    desc: 'Tasks not completed on target dates land in Backlog. Tap "Start Session" on any Backlog task: it moves to Today with a 📋 Backlog badge intact. Progress syncs back to Goal Blueprint automatically!',
    example: 'Starting a Backlog session keeps original date history while letting you execute it today seamlessly.',
  },
  {
    icon: Clock,
    accent: '#F43F5E',
    bg: 'bg-rose-600/12 border-rose-500/20',
    dotBg: 'bg-rose-500/20',
    title: '4. Live Focus Sessions & Ambient Mode',
    desc: 'Launch live focus timers on tasks. Pause/Resume tracks exact pause timestamps. Use Ambient Mode for a clean, distraction-free clock display on your desk.',
    example: 'Displays live ticker, start/end wall-clock time, pause logs e.g. (6:30 PM - 7:10 PM) 40m, and micro-step checklists.',
  },
  {
    icon: BarChart2,
    accent: '#6366F1',
    bg: 'bg-indigo-600/12 border-indigo-500/20',
    dotBg: 'bg-indigo-500/20',
    title: '5. Calendar View & xⁿ Notation',
    desc: 'Overview your monthly study calendar! Dates display in xⁿ notation: x is the date number, n (superscript) is the number of planned tasks for that day (color-coded by completion).',
    example: '12³ means Date 12 with 3 planned tasks. Green superscript indicates 100% completed tasks!',
  },
  {
    icon: CheckCircle2,
    accent: '#14B8A6',
    bg: 'bg-teal-600/12 border-teal-500/20',
    dotBg: 'bg-teal-500/20',
    title: '6. Focus Analytics & Efficiency %',
    desc: 'Tap the single-tap [📊 Stats] chip next to any date header in Calendar, or tap 📊 Stats on any task/goal. View Net Focus Time (NFT), Total Duration, and calculated Daily Efficiency: (Net Focus ÷ Total Duration) × 100.',
    example: 'Single-tap [📊 Stats] chip opens daily analytics instantly. Discounts pause durations to reveal true study efficiency!',
  },
];

export default function SettingsSheet({ open, onClose, onOpenAuth }: Props) {
  const { exportBackup, importBackup, syncToCloud, restoreFromCloud, recentlyDeletedGoals, restoreDeletedGoal, clearTrash } = useStore();
  const { user, signOut, updateProfile } = useAuth();
  const [theme, setTheme] = useTheme();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState(user?.user_metadata?.full_name || '');
  const [editAvatar, setEditAvatar] = useState(user?.user_metadata?.avatar_url || '🎓');
  const [archOpen, setArchOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSlide, setGuideSlide] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleExport = async () => {
    const savedPath = await exportBackup();
    setMsg({ text: savedPath });
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

  const currentSlide = USER_GUIDE_STEPS[guideSlide];
  const SlideIcon = currentSlide.icon;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0D0B14] page-slide-in flex flex-col overflow-hidden w-full h-full"
      style={{ maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto', left: 0, right: 0 }}
    >
      {/* ── Full-Screen Header ── */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/8 shrink-0 bg-[#14111F]"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}
      >
        <button
          onClick={onClose}
          className="p-2 -ml-1.5 rounded-xl text-[#A09CB8] hover:text-[#EEE9FC] hover:bg-white/5 transition-colors active:scale-95 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[15px] font-extrabold text-[#EEE9FC] leading-tight">Settings</h1>
          <p className="text-[10px] font-semibold text-[#5F5980] mt-0.5">Account · Data Safety · Guide</p>
        </div>
      </div>

      {/* ── Full-Screen Body ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-5 pb-12 space-y-6">
        {/* ── 1. Account & Cloud ── */}
        <section className="space-y-2.5">
          <SectionLabel>Account &amp; Cloud Sync</SectionLabel>
          <div className="bg-[#14111F] border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg">
            {user ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-2xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-xl shrink-0 shadow-inner">
                      {user.user_metadata?.avatar_url || '🎓'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-extrabold text-[#EEE9FC] truncate max-w-[170px]">
                        {user.user_metadata?.full_name || 'Aspirant'}
                      </h3>
                      <p className="text-[10.5px] text-[#A09CB8] font-medium truncate max-w-[170px]">{user.email}</p>
                      <span className="text-[9.5px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20 inline-block mt-0.5">
                        ● Cloud Synced &amp; Active
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setEditName(user.user_metadata?.full_name || '');
                        setEditAvatar(user.user_metadata?.avatar_url || '🎓');
                        setEditProfileOpen((p) => !p);
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-white/8 hover:bg-white/12 text-[#EEE9FC] border border-white/10 text-[11px] font-bold transition flex items-center gap-1"
                    >
                      <Edit2 size={12} className="text-violet-400" /> Edit Profile
                    </button>
                    <button
                      onClick={() => signOut()}
                      className="px-2.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition text-[11px] font-bold flex items-center gap-1 justify-center"
                    >
                      <LogOut size={12} /> Sign Out
                    </button>
                  </div>
                </div>

                {/* Edit Profile Form Accordion */}
                {editProfileOpen && (
                  <div className="p-3.5 rounded-2xl bg-[#0D0B14] border border-white/10 space-y-3 fade-in">
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5F5980] mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Jatin Parmar"
                        className="w-full bg-[#14111F] border border-white/10 rounded-xl px-3 py-2 text-xs text-[#EEE9FC] focus:outline-none focus:border-violet-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-extrabold uppercase tracking-widest text-[#5F5980] mb-1">
                        Avatar Icon Preset
                      </label>
                      <div className="flex gap-2 items-center overflow-x-auto no-scrollbar py-1">
                        {['🎓', '⚡', '🏆', '🚀', '🦉', '🧠', '🎯', '📚'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => setEditAvatar(emoji)}
                            className={`w-9 h-9 rounded-xl text-lg flex items-center justify-center transition border ${
                              editAvatar === emoji
                                ? 'bg-violet-600/30 border-violet-500 text-white scale-105'
                                : 'bg-white/5 border-white/5 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        const ok = await updateProfile({ fullName: editName, avatarUrl: editAvatar });
                        if (ok) {
                          setEditProfileOpen(false);
                          setMsg({ text: '✓ Profile updated successfully!' });
                        }
                      }}
                      className="w-full py-2 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-md shadow-violet-600/25 transition"
                    >
                      Save Profile Changes
                    </button>
                  </div>
                )}

                {/* Cloud Sync Manual Controls */}
                <div className="pt-2 border-t border-white/5 grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      const res = await syncToCloud();
                      setMsg(
                        res.ok
                          ? { text: '✓ Cloud Backup Synced successfully!' }
                          : { text: `✗ ${res.error || 'Failed to sync to cloud.'}`, error: true },
                      );
                    }}
                    className="py-2 px-2.5 rounded-xl bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Upload size={13} /> Sync to Cloud Now
                  </button>
                  <button
                    onClick={async () => {
                      const ok = await restoreFromCloud();
                      setMsg(
                        ok
                          ? { text: '✓ Goals & tasks restored from Cloud Backup!' }
                          : { text: '✗ No Cloud Backup found.', error: true },
                      );
                    }}
                    className="py-2 px-2.5 rounded-xl bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-300 text-[11px] font-extrabold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Download size={13} /> Restore from Cloud
                  </button>
                </div>

                {/* Delete Account button */}
                {!confirmDeleteAccount ? (
                  <div className="pt-2 border-t border-white/5 flex justify-end">
                    <button
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="text-[11px] font-bold text-rose-400/80 hover:text-rose-300 flex items-center gap-1.5 transition py-1 px-2 rounded-lg hover:bg-rose-500/10"
                    >
                      <Trash2 size={13} /> Delete Account &amp; Data
                    </button>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-rose-500/10 border border-rose-500/28 p-3.5 space-y-2.5 fade-in">
                    <div className="flex items-center gap-2 text-rose-300 font-extrabold text-[12px]">
                      <AlertTriangle size={14} className="shrink-0" />
                      Delete Account &amp; Reset Data?
                    </div>
                    <p className="text-[11px] text-rose-300/75 font-medium leading-relaxed">
                      This will sign you out and delete all local account session state. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          setConfirmDeleteAccount(false);
                          await signOut();
                          setMsg({ text: '✓ Account signed out and data reset.' });
                        }}
                        className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
                      >
                        Yes, Delete &amp; Reset
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAccount(false)}
                        className="flex-1 py-2 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#5F5980] shrink-0 mt-0.5">
                    <User size={18} />
                  </div>
                  <div>
                    <p className="text-xs font-extrabold text-[#EEE9FC]">Guest Mode (Offline)</p>
                    <p className="text-[11px] text-[#A09CB8] font-medium leading-relaxed mt-0.5">
                      Sign in or create a free account to back up your goals &amp; focus history across all your devices.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={() => onOpenAuth?.('signin')}
                    className="py-2.5 px-3 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-extrabold shadow-md shadow-violet-600/25 flex items-center justify-center gap-1.5 transition"
                  >
                    <LogIn size={14} /> Sign In
                  </button>
                  <button
                    onClick={() => onOpenAuth?.('signup')}
                    className="py-2.5 px-3 rounded-xl bg-white/8 hover:bg-white/12 border border-white/10 active:scale-95 text-[#EEE9FC] text-xs font-extrabold flex items-center justify-center gap-1.5 transition"
                  >
                    <UserPlus size={14} className="text-violet-400" /> Create Account
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ── Appearance & Theme ── */}
        <section className="space-y-3">
          <SectionLabel>Appearance &amp; Theme</SectionLabel>
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600/15 border border-violet-500/30 flex items-center justify-center text-violet-400">
                  {theme.darkMode ? <Moon size={16} /> : <Sun size={16} />}
                </div>
                <div>
                  <div className="text-xs font-bold text-[#EEE9FC]">Interface Theme</div>
                  <div className="text-[11px] text-[#A09CB8]">Choose your preferred theme</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => setTheme({ darkMode: true })}
                className={`py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border transition ${
                  theme.darkMode
                    ? 'bg-violet-600/20 border-violet-500/50 text-violet-300 shadow-md shadow-violet-600/15'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <Moon size={14} /> 🌙 OLED Dark
              </button>

              <button
                type="button"
                onClick={() => setTheme({ darkMode: false })}
                className={`py-2.5 px-3 rounded-2xl text-xs font-bold flex items-center justify-center gap-2 border transition ${
                  !theme.darkMode
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/15'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:bg-white/10'
                }`}
              >
                <Sun size={14} /> ☀️ Dusky Light
              </button>
            </div>
          </div>
        </section>

        {/* ── 2. Data Management ── */}
        <section className="space-y-3">
          <SectionLabel>Data Safety &amp; Backup</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-[#EEE9FC] bg-[#14111F] hover:bg-violet-600/12 border border-white/8 hover:border-violet-500/30 transition-all active:scale-[0.98]"
            >
              <Download size={15} className="text-violet-400" /> Export JSON
            </button>
            <button
              onClick={() => {
                setMsg(null);
                setConfirmImport(true);
              }}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-[#EEE9FC] bg-[#14111F] hover:bg-emerald-600/12 border border-white/8 hover:border-emerald-500/30 transition-all active:scale-[0.98]"
            >
              <Upload size={15} className="text-emerald-400" /> Import JSON
            </button>
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
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/28 p-3.5 space-y-2.5 fade-in">
              <div className="flex items-center gap-2 text-rose-300 font-extrabold text-[12px]">
                <AlertTriangle size={14} className="shrink-0" />
                Replace ALL current data?
              </div>
              <p className="text-[11px] text-rose-300/75 font-medium leading-relaxed">
                Your goals and tasks will be overwritten by the backup. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
                >
                  Yes, Replace All
                </button>
                <button
                  onClick={() => setConfirmImport(false)}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p className={`text-[11.5px] font-bold text-center ${msg.error ? 'text-rose-400' : 'text-emerald-400'}`}>
              {msg.text}
            </p>
          )}

          {/* Recently Deleted Trash Bin */}
          <div className="bg-[#14111F] border border-white/10 rounded-2xl p-4 space-y-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-extrabold text-[#EEE9FC]">
                <Trash2 size={14} className="text-violet-400" />
                Recently Deleted Goals ({recentlyDeletedGoals.length})
              </div>
              {recentlyDeletedGoals.length > 0 && (
                <button
                  onClick={clearTrash}
                  className="text-[10px] font-bold text-rose-400 hover:underline"
                >
                  Empty Trash
                </button>
              )}
            </div>

            {recentlyDeletedGoals.length === 0 ? (
              <p className="text-[11px] text-[#A09CB8] font-medium">No deleted goals in trash. Deleting goals moves them here so you can restore them anytime!</p>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto no-scrollbar pt-1">
                {recentlyDeletedGoals.map((rec) => (
                  <div key={rec.id} className="p-2.5 rounded-xl bg-[#0D0B14] border border-white/5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate">{rec.node.title}</div>
                      <div className="text-[10px] text-slate-400">
                        {rec.node.children?.length ? `${rec.node.children.length} sub-nodes • ` : ''}
                        Deleted {new Date(rec.deletedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                    <button
                      onClick={() => restoreDeletedGoal(rec.id)}
                      className="px-2.5 py-1 rounded-lg bg-violet-600/20 hover:bg-violet-600/30 text-violet-300 text-[11px] font-bold shrink-0 border border-violet-500/30 transition active:scale-95"
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ── 3. App Architecture & Core Features (Expandable Accordion) ── */}
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setArchOpen((p) => !p)}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#14111F] hover:bg-[#1D1930] border border-white/8 transition-all text-left active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                <Sparkles size={18} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#EEE9FC]">About YouDO Architecture</h3>
                <p className="text-[10.5px] font-semibold text-[#5F5980] mt-0.5">
                  Core design rationale &amp; key features
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-[#5F5980] shrink-0 transition-transform duration-300 ${archOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {archOpen && (
            <div className="fade-in space-y-2 pt-1">
              {APP_FEATURES.map((feat, idx) => {
                const Icon = feat.icon;
                return (
                  <div key={idx} className="bg-[#14111F] border border-white/8 rounded-2xl p-3.5 space-y-1">
                    <div className="flex items-center gap-2 text-violet-400 font-extrabold text-xs">
                      <Icon size={14} className="shrink-0" />
                      <span>{feat.title}</span>
                    </div>
                    <p className="text-[11px] text-[#A09CB8] font-medium leading-relaxed">{feat.desc}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 4. Interactive User Guide ── */}
        <section className="space-y-3 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => {
              setGuideOpen((p) => !p);
              setGuideSlide(0);
            }}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#14111F] hover:bg-[#1D1930] border border-white/8 transition-all text-left active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#EEE9FC]">Aspirant Execution Guide</h3>
                <p className="text-[10.5px] font-semibold text-[#5F5980] mt-0.5">
                  Step-by-step user onboarding &amp; workflow guide
                </p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-[#5F5980] shrink-0 transition-transform duration-300 ${guideOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {guideOpen && (
            <div className="fade-in space-y-3">
              {/* Active slide card */}
              <div className={`rounded-2xl border p-4 space-y-3 transition-all ${currentSlide.bg}`}>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentSlide.dotBg}`}
                    style={{ color: currentSlide.accent }}
                  >
                    <SlideIcon size={20} />
                  </div>
                  <div>
                    <p
                      className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5"
                      style={{ color: currentSlide.accent }}
                    >
                      Guide Step {guideSlide + 1} of {USER_GUIDE_STEPS.length}
                    </p>
                    <h4 className="text-sm font-extrabold text-[#EEE9FC] leading-tight">{currentSlide.title}</h4>
                  </div>
                </div>
                <p className="text-[12px] leading-relaxed text-[#A09CB8] font-medium">{currentSlide.desc}</p>
                {currentSlide.example && (
                  <div className="p-3 rounded-xl bg-black/40 font-mono text-[10.5px] text-[#EEE9FC] border border-white/5 tracking-tight leading-relaxed">
                    <span className="text-amber-400 font-bold font-sans uppercase tracking-widest text-[9px] block mb-1">
                      Concrete Example:
                    </span>
                    {currentSlide.example}
                  </div>
                )}
              </div>

              {/* Guide Navigation Controls */}
              <div className="flex items-center justify-between px-0.5">
                <button
                  onClick={() => setGuideSlide((s) => Math.max(0, s - 1))}
                  disabled={guideSlide === 0}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 disabled:opacity-25 transition-all active:scale-95"
                >
                  ← Prev
                </button>

                <div className="flex gap-1.5 items-center">
                  {USER_GUIDE_STEPS.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setGuideSlide(i)}
                      className="rounded-full transition-all duration-300"
                      style={{
                        width: i === guideSlide ? '16px' : '6px',
                        height: '6px',
                        background: i === guideSlide ? currentSlide.accent : 'rgba(255,255,255,0.15)',
                      }}
                    />
                  ))}
                </div>

                <button
                  onClick={() => setGuideSlide((s) => Math.min(USER_GUIDE_STEPS.length - 1, s + 1))}
                  disabled={guideSlide === USER_GUIDE_STEPS.length - 1}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 disabled:opacity-25 transition-all active:scale-95"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── 5. Developer Credits ── */}
        <section>
          <div className="rounded-2xl bg-[#14111F] border border-white/8 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-extrabold uppercase tracking-widest text-[#5F5980]">Developer</span>
              <span className="font-bold text-[#A09CB8]">Jatin Parmar (@mattedhairr)</span>
            </div>
            <div className="flex items-center gap-2 pt-1 border-t border-white/5">
              <a
                href="https://github.com/mattedhairr"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-[#A09CB8] flex items-center justify-center gap-1.5 hover:text-violet-400 hover:bg-white/8 transition"
              >
                <Github size={12} /> GitHub
              </a>
              <a
                href="https://www.linkedin.com/in/jatin-parmar-9b1b962ba"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-[#A09CB8] flex items-center justify-center gap-1.5 hover:text-violet-400 hover:bg-white/8 transition"
              >
                <Linkedin size={12} /> LinkedIn
              </a>
              <a
                href="https://instagram.com/mattedhairr"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-[#A09CB8] flex items-center justify-center gap-1.5 hover:text-pink-400 hover:bg-white/8 transition"
              >
                <Instagram size={12} /> Instagram
              </a>
            </div>
          </div>
        </section>

        <p className="text-center text-[10px] text-[#5F5980] font-semibold pb-2">
          YouDO v2.0 · Built for Aspirants
        </p>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-extrabold uppercase tracking-widest text-violet-400">
      {children}
    </span>
  );
}
