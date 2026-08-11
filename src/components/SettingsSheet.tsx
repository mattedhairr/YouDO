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
} from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenAuth?: () => void;
}

const GUIDE_SLIDES = [
  {
    icon: Layers,
    accent: '#7C3AED',
    bg: 'bg-violet-600/12 border-violet-500/20',
    dotBg: 'bg-violet-500/20',
    title: 'Aspirant Core Architecture',
    desc: 'YouDO is built for competitive exam prep — UPSC, JEE, NEET, GATE, CAT. It converts complex syllabi into structured Goal Blueprints synced with daily focus sessions.',
    mono: null,
  },
  {
    icon: GitMerge,
    accent: '#F59E0B',
    bg: 'bg-amber-600/12 border-amber-500/20',
    dotBg: 'bg-amber-500/20',
    title: '6-Tier Goal Hierarchy',
    desc: 'Every syllabus breaks into 6 tiers so you always know exactly what to study next — from macro goal down to a single revision leaf.',
    mono: 'Goal → Phase → Section → Task → Sub-task → Leaf',
  },
  {
    icon: CalendarCheck,
    accent: '#10B981',
    bg: 'bg-emerald-600/12 border-emerald-500/20',
    dotBg: 'bg-emerald-500/20',
    title: 'Step-Slice Scheduling',
    desc: 'Dispatch specific sub-steps from any Goal node directly to Today\'s list. Each task focuses on a precise chapter slice — no vague "study physics" blocks.',
    mono: null,
  },
  {
    icon: Zap,
    accent: '#F43F5E',
    bg: 'bg-rose-600/12 border-rose-500/20',
    dotBg: 'bg-rose-500/20',
    title: 'Focus Session System',
    desc: 'Start a timed focus session on any task. Track pauses, resume later, log your effort. When you stop, mark completed micro-steps to write progress back to the Blueprint.',
    mono: null,
  },
  {
    icon: CheckCircle2,
    accent: '#6366F1',
    bg: 'bg-indigo-600/12 border-indigo-500/20',
    dotBg: 'bg-indigo-500/20',
    title: 'Bidirectional Sync',
    desc: 'Completing a Step-Slice on Today\'s list automatically advances your GoalNode progress. Overall syllabus completion auto-calculates in real time — zero manual updates.',
    mono: null,
  },
];

export default function SettingsSheet({ open, onClose, onOpenAuth }: Props) {
  const { exportBackup, importBackup } = useStore();
  const { user, signOut } = useAuth();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideSlide, setGuideSlide] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const handleExport = () => {
    exportBackup();
    setMsg({ text: '✓ Backup exported successfully!' });
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    setConfirmImport(false);
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importBackup(reader.result as string);
      setMsg(
        ok
          ? { text: '✓ Backup restored! Goals and tasks are back.' }
          : { text: '✗ Invalid or corrupted backup file.', error: true },
      );
    };
    reader.readAsText(file);
  };

  const currentSlide = GUIDE_SLIDES[guideSlide];
  const SlideIcon = currentSlide.icon;

  return (
    <div className="fixed inset-0 z-50 bg-[#0D0B14] page-slide-in flex flex-col overflow-hidden" style={{ maxWidth: '28rem', marginLeft: 'auto', marginRight: 'auto', left: 0, right: 0 }}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-4 border-b border-white/5 shrink-0"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}
      >
        <button
          onClick={onClose}
          className="p-2 -ml-1.5 rounded-xl text-[#A09CB8] hover:text-[#EEE9FC] hover:bg-white/5 transition-colors active:scale-95"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-[15px] font-extrabold text-[#EEE9FC] leading-tight">Settings</h1>
          <p className="text-[10px] font-semibold text-[#5F5980] mt-0.5">Account · Data · Guide</p>
        </div>
      </div>

      {/* ── Scrollable Body ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pt-5 pb-10 space-y-6">

        {/* ── 1. Account & Cloud ── */}
        <section className="space-y-2.5">
          <SectionLabel>Account &amp; Cloud</SectionLabel>
          <div className="bg-[#14111F] border border-white/8 rounded-2xl p-4 flex items-center justify-between gap-3">
            {user ? (
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                  <User size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#EEE9FC] truncate max-w-[170px]">{user.email}</p>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
                    ● Cloud Synced
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-[#5F5980] shrink-0">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#EEE9FC]">Guest (Offline Mode)</p>
                  <p className="text-[10px] text-[#5F5980]">Sign in to sync across devices</p>
                </div>
              </div>
            )}

            {user ? (
              <button
                onClick={() => signOut()}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition shrink-0 active:scale-95"
                title="Sign Out"
              >
                <LogOut size={15} />
              </button>
            ) : (
              <button
                onClick={() => { onClose(); onOpenAuth?.(); }}
                className="px-3.5 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-violet-600/25 flex items-center gap-1.5 transition shrink-0"
              >
                <LogIn size={14} /> Sign In
              </button>
            )}
          </div>
        </section>

        {/* ── 2. Data Safety Notice ── */}
        <div className="rounded-2xl bg-amber-500/8 border border-amber-500/22 p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-extrabold text-amber-300 uppercase tracking-wider mb-1.5">
              Critical Data Notice
            </p>
            <p className="text-[11px] leading-relaxed text-amber-200/75 font-medium">
              YouDO stores data locally for privacy &amp; offline access. Always export a JSON backup before clearing browser data or switching devices!
            </p>
          </div>
        </div>

        {/* ── 3. Data Management ── */}
        <section className="space-y-3">
          <SectionLabel>Data Management</SectionLabel>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-[#EEE9FC] bg-[#14111F] hover:bg-violet-600/12 border border-white/8 hover:border-violet-500/30 transition-all active:scale-[0.98]"
            >
              <Download size={15} className="text-violet-400" /> Export JSON
            </button>
            <button
              onClick={() => { setMsg(null); setConfirmImport(true); }}
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
        </section>

        {/* ── 4. Aspirant Execution Guide ── */}
        <section className="space-y-3 pt-2 border-t border-white/5">
          {/* Toggle button */}
          <button
            type="button"
            onClick={() => { setGuideOpen((p) => !p); setGuideSlide(0); }}
            className="w-full flex items-center justify-between p-4 rounded-2xl bg-[#14111F] hover:bg-[#1D1930] border border-white/8 transition-all text-left active:scale-[0.99]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 shrink-0">
                <BookOpen size={18} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-[#EEE9FC]">Aspirant Execution System</h3>
                <p className="text-[10.5px] font-semibold text-[#5F5980] mt-0.5">Syllabus breakdown · 6-tier guide</p>
              </div>
            </div>
            <ChevronDown
              size={18}
              className={`text-[#5F5980] shrink-0 transition-transform duration-300 ${guideOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {/* Slide Cards */}
          {guideOpen && (
            <div className="fade-in space-y-3">
              {/* Active slide */}
              <div className={`rounded-2xl border p-4 space-y-3 transition-all ${currentSlide.bg}`}>
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${currentSlide.dotBg}`}
                    style={{ color: currentSlide.accent }}
                  >
                    <SlideIcon size={20} />
                  </div>
                  <div>
                    <p className="text-[10px] font-extrabold uppercase tracking-widest mb-0.5"
                       style={{ color: currentSlide.accent }}>
                      Step {guideSlide + 1} of {GUIDE_SLIDES.length}
                    </p>
                    <h4 className="text-sm font-extrabold text-[#EEE9FC] leading-tight">{currentSlide.title}</h4>
                  </div>
                </div>
                <p className="text-[12px] leading-relaxed text-[#A09CB8] font-medium">{currentSlide.desc}</p>
                {currentSlide.mono && (
                  <div className="p-2.5 rounded-xl bg-black/30 font-mono text-[10.5px] text-[#EEE9FC] border border-white/5 tracking-tight">
                    {currentSlide.mono}
                  </div>
                )}
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between px-0.5">
                <button
                  onClick={() => setGuideSlide((s) => Math.max(0, s - 1))}
                  disabled={guideSlide === 0}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 disabled:opacity-25 transition-all active:scale-95"
                >
                  ← Prev
                </button>

                <div className="flex gap-1.5 items-center">
                  {GUIDE_SLIDES.map((_, i) => (
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
                  onClick={() => setGuideSlide((s) => Math.min(GUIDE_SLIDES.length - 1, s + 1))}
                  disabled={guideSlide === GUIDE_SLIDES.length - 1}
                  className="px-3.5 py-1.5 rounded-xl text-[11px] font-bold text-[#A09CB8] bg-white/5 hover:bg-white/10 disabled:opacity-25 transition-all active:scale-95"
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ── 5. Developer ── */}
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

/* ── Small section label ── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="block text-[10px] font-extrabold uppercase tracking-widest text-violet-400">
      {children}
    </span>
  );
}
