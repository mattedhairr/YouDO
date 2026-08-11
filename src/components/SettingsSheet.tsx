import { useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, Download, Github, GitMerge, Instagram, Layers, Linkedin, Sparkles, Square, Upload, User, LogOut, LogIn, X, Zap } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import { useStore } from '../store';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onApply: (t: Theme) => void;
  onOpenAuth?: () => void;
}

export default function SettingsSheet({ open, theme, onClose, onApply, onOpenAuth }: Props) {
  const { exportBackup, importBackup } = useStore();
  const { user, signOut } = useAuth();
  const [glassUI, setGlassUI] = useState(theme.glassUI);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const apply = () => {
    onApply({ darkMode: true, glassUI });
    onClose();
  };

  const handleExport = () => {
    exportBackup();
    setMsg({ text: 'Backup file exported successfully!' });
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    setConfirmImport(false);
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importBackup(reader.result as string);
      if (ok) {
        setMsg({ text: 'Backup restored successfully! All goals and tasks are back.' });
      } else {
        setMsg({ text: 'Failed to restore: Invalid or corrupted backup file.', error: true });
      }
    };
    reader.readAsText(file);
  };

  const requestImport = () => {
    setMsg(null);
    setConfirmImport(true);
  };

  const cancelImport = () => {
    setConfirmImport(false);
  };

  const proceedImport = () => {
    fileRef.current?.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-[#14111F] border border-white/10 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl space-y-6 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-white/5">
          <div>
            <h2 className="text-lg font-extrabold text-slate-100">Settings & Guide</h2>
            <p className="text-[11px] font-semibold text-slate-400">Account, theme, backups & workflow</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 1. User Account Section */}
        <div className="space-y-2">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400">Account & Cloud</label>
          <div className="bg-[#1D1930] border border-white/5 rounded-2xl p-3.5 flex items-center justify-between">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-600/20 border border-violet-500/30 flex items-center justify-center text-violet-400 font-bold">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-100 truncate max-w-[180px]">{user.email}</p>
                  <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Cloud Synced</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-400">
                  <User size={18} />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Guest User (Offline Mode)</p>
                  <p className="text-[10px] text-slate-400">Sign in to sync across devices</p>
                </div>
              </div>
            )}

            {user ? (
              <button
                onClick={() => signOut()}
                className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1 transition"
                title="Sign Out"
              >
                <LogOut size={14} />
              </button>
            ) : (
              <button
                onClick={() => { onClose(); if (onOpenAuth) onOpenAuth(); }}
                className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-500 active:scale-95 text-white text-xs font-bold shadow-md shadow-violet-600/25 flex items-center gap-1.5 transition"
              >
                <LogIn size={14} /> Sign In
              </button>
            )}
          </div>
        </div>

        {/* 2. Appearance & Visual Effects */}
        <div className="space-y-3">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400">Visual Styling</label>

          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-400">Interface Style</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGlassUI(true)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${
                  glassUI
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300 shadow-xs'
                    : 'bg-[#1D1930] border-white/5 text-slate-400'
                }`}
              >
                <Sparkles size={15} className="text-amber-400" /> Frosted Glass
              </button>
              <button
                onClick={() => setGlassUI(false)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${
                  !glassUI
                    ? 'bg-violet-600/20 border-violet-500 text-violet-300 shadow-xs'
                    : 'bg-[#1D1930] border-white/5 text-slate-400'
                }`}
              >
                <Square size={15} /> Solid Minimal
              </button>
            </div>
          </div>
        </div>

        {/* 3. Data Safety Notice */}
        <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-400 font-extrabold text-[12px]">
            <AlertTriangle size={18} className="shrink-0 text-amber-400" />
            <span>CRITICAL DATA SAFETY NOTICE</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-amber-200/90 font-medium">
            YouDO operates locally on your device for maximum privacy and offline availability. Always export a JSON backup before clearing browser data or changing devices!
          </p>
        </div>

        {/* 4. Data Management (Backup Export / Import) */}
        <div className="space-y-3">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-violet-400">Data Management</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-100 bg-[#1D1930] hover:bg-violet-600/20 border border-white/10 hover:border-violet-500/40 transition-all"
            >
              <Download size={15} className="text-violet-400" /> Export Backup (JSON)
            </button>
            <button
              onClick={requestImport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-100 bg-[#1D1930] hover:bg-emerald-600/20 border border-white/10 hover:border-emerald-500/40 transition-all"
            >
              <Upload size={15} className="text-emerald-400" /> Import Backup (JSON)
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { handleImport(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ''; }} />

          {/* Import confirmation warning banner */}
          {confirmImport && (
            <div className="rounded-2xl bg-rose-500/10 border border-rose-500/30 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-300 font-extrabold text-[12px]">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Replace ALL current data?</span>
              </div>
              <p className="text-[11px] text-rose-300/80 font-medium leading-relaxed">
                Your current goals and tasks will be overwritten by the backup file. This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={proceedImport}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-rose-600 hover:bg-rose-500 transition-colors"
                >
                  Yes, Replace All
                </button>
                <button
                  onClick={cancelImport}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-slate-300 bg-white/5 hover:bg-white/10 transition-colors"
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
        </div>

        {/* 5. System Guide */}
        <div className="space-y-3 pt-2 border-t border-white/5">
          <button
            type="button"
            onClick={() => setGuideExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-[#1D1930] hover:bg-[#27233D] border border-white/5 transition-all text-left group"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen size={16} className="text-violet-400 shrink-0" />
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-100">
                  Aspirant Execution System
                </h3>
                <p className="text-[10.5px] font-semibold text-slate-400 mt-0.5">
                  Syllabus breakdown & 6-tier hierarchy guide
                </p>
              </div>
            </div>
            {guideExpanded ? (
              <ChevronDown size={18} className="text-slate-400 group-hover:text-slate-200 shrink-0 transition-transform" />
            ) : (
              <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-200 shrink-0 transition-transform" />
            )}
          </button>

          {guideExpanded && (
            <div className="space-y-3.5 text-[11.5px] leading-relaxed text-slate-300 fade-in pt-1">
              <div className="card p-3.5 space-y-1.5 border border-white/10">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-xs">
                  <Zap size={14} className="text-violet-400" />
                  <span>Aspirant Core Architecture</span>
                </div>
                <p>
                  YouDO is designed specifically for competitive exam preparation (UPSC, JEE, NEET, GATE, CAT). It transforms complex syllabi into structured Goal Blueprints synced with daily focus sessions.
                </p>
              </div>

              <div className="card p-3.5 space-y-2 border border-white/10">
                <div className="flex items-center gap-2 text-slate-100 font-bold text-xs">
                  <Layers size={14} className="text-violet-400" />
                  <span>6-Tier Hierarchy Breakdown</span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#1D1930] font-mono text-[10.5px] text-slate-200 space-y-0.5">
                  <div>Goal &rarr; Phase &rarr; Section &rarr; Task &rarr; Sub-task &rarr; Leaf Task</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Developer Info */}
        <div className="rounded-2xl bg-[#1D1930] border border-white/5 p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-extrabold uppercase tracking-widest text-slate-400">Developer</span>
            <span className="font-bold text-slate-200">Jatin Parmar (@mattedhairr)</span>
          </div>

          <div className="flex items-center gap-2 pt-1.5 border-t border-white/5">
            <a href="https://github.com/mattedhairr" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:text-violet-400 transition">
              <Github size={12} /> GitHub
            </a>
            <a href="https://www.linkedin.com/in/jatin-parmar-9b1b962ba" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:text-violet-400 transition">
              <Linkedin size={12} /> LinkedIn
            </a>
            <a href="https://instagram.com/mattedhairr" target="_blank" rel="noopener noreferrer" className="flex-1 py-1.5 px-2 rounded-xl bg-white/5 text-[10.5px] font-bold text-slate-300 flex items-center justify-center gap-1.5 hover:text-pink-400 transition">
              <Instagram size={12} /> Instagram
            </a>
          </div>
        </div>

        {/* Apply & Save */}
        <button
          onClick={apply}
          className="w-full py-3 rounded-2xl text-xs font-extrabold text-white bg-violet-600 hover:bg-violet-500 shadow-lg shadow-violet-600/25 transition-all active:scale-[0.99]"
        >
          Save & Close Settings
        </button>
      </div>
    </div>
  );
}
