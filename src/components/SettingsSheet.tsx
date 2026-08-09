import { useRef, useState } from 'react';
import { AlertTriangle, BookOpen, CalendarCheck, CheckCircle2, ChevronDown, ChevronRight, Download, Github, GitMerge, Instagram, Layers, Linkedin, Moon, Sparkles, Square, Sun, Upload, X, Zap } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import { useStore } from '../store';

interface Props {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onApply: (t: Theme) => void;
}

export default function SettingsSheet({ open, theme, onClose, onApply }: Props) {
  const { exportBackup, importBackup } = useStore();
  const [darkMode, setDarkMode] = useState(theme.darkMode);
  const [glassUI, setGlassUI] = useState(theme.glassUI);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmImport, setConfirmImport] = useState(false);
  const [guideExpanded, setGuideExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const apply = () => {
    onApply({ darkMode, glassUI });
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
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Settings & System Guide</h2>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-400">Manage appearance, backups & execution workflow</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 1. Appearance (Theme & Glass UI Options) */}
        <div className="space-y-3">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">1. Appearance & Theme</label>

          {/* Light / Dark Mode Toggle */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Color Palette</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDarkMode(false)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${!darkMode ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
              >
                <Sun size={15} /> Light Mode
              </button>
              <button
                onClick={() => setDarkMode(true)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${darkMode ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
              >
                <Moon size={15} /> Dark Mode
              </button>
            </div>
          </div>

          {/* Glass UI vs Solid Mode Toggle */}
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Visual Effect</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setGlassUI(true)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${glassUI ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
              >
                <Sparkles size={15} className="text-amber-500" /> Frosted Glass
              </button>
              <button
                onClick={() => setGlassUI(false)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-2xl text-xs font-bold border transition-all ${!glassUI ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
              >
                <Square size={15} /> Solid Minimal
              </button>
            </div>
          </div>
        </div>

        {/* 2. Prominent Data Safety Warning Box */}
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-700/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-extrabold text-[12px]">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span>CRITICAL DATA SAFETY NOTICE</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-amber-900/90 dark:text-amber-200/90 font-medium">
            YouDO operates 100% locally on your device for absolute privacy and offline execution. There are no cloud servers or external accounts. DO NOT uninstall the app, reset site permissions, or clear browser storage without exporting a backup JSON file first, or your progress will be permanently lost!
          </p>
        </div>

        {/* 3. Clean Data Management (Export / Import Backup Controls Only) */}
        <div className="space-y-3">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">2. Data Management</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-300 border border-slate-200 dark:border-slate-700 transition-all"
            >
              <Download size={15} className="text-blue-500" /> Export Backup (JSON)
            </button>
            <button
              onClick={requestImport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-300 border border-slate-200 dark:border-slate-700 transition-all"
            >
              <Upload size={15} className="text-emerald-500" /> Import Backup (JSON)
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { handleImport(e.target.files?.[0]); if (fileRef.current) fileRef.current.value = ''; }} />

          {/* Import confirmation warning banner */}
          {confirmImport && (
            <div className="rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300/80 dark:border-rose-700/60 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2 text-rose-700 dark:text-rose-300 font-extrabold text-[12px]">
                <AlertTriangle size={16} className="shrink-0" />
                <span>This will permanently replace ALL current data</span>
              </div>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-300/80 font-medium leading-relaxed">
                Your current goals, phases, and tasks will be overwritten by the backup file. This action cannot be undone. Export a backup first if you want to preserve your current progress.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={proceedImport}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-rose-500 hover:bg-rose-600 transition-colors"
                >
                  Yes, Replace All Data
                </button>
                <button
                  onClick={cancelImport}
                  className="flex-1 py-2 rounded-xl text-[11px] font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {msg && (
            <p className={`text-[11.5px] font-bold text-center ${msg.error ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {msg.text}
            </p>
          )}
        </div>

        {/* 4. The YouDO Execution System Guide (Collapsible Accordion) */}
        <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setGuideExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700/60 transition-all text-left group"
          >
            <div className="flex items-center gap-2.5">
              <BookOpen size={16} className="text-blue-500 shrink-0" />
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-900 dark:text-slate-100">
                  Aspirant Execution System
                </h3>
                <p className="text-[10.5px] font-semibold text-slate-400 dark:text-slate-400 mt-0.5">
                  Syllabus breakdown, study workflow & USP
                </p>
              </div>
            </div>
            {guideExpanded ? (
              <ChevronDown size={18} className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0 transition-transform duration-200" />
            ) : (
              <ChevronRight size={18} className="text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-200 shrink-0 transition-transform duration-200" />
            )}
          </button>

          {guideExpanded && (
            <div className="space-y-3.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300 fade-in pt-1">
              {/* Core Concept */}
              <div className="card p-3.5 space-y-1.5 border border-white/10">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                  <Zap size={14} className="text-blue-500" />
                  <span>Aspirant Core Architecture</span>
                </div>
                <p>
                  YouDO is built specifically as the ultimate execution companion for students and competitive exam aspirants (UPSC, JEE, NEET, GATE, CAT). Flat to-do lists fail because massive exam syllabi get overwhelming. YouDO solves this by transforming entire exam syllabi into structured Goal Blueprints synced with daily micro-targets.
                </p>
              </div>

              {/* 1. Deep Blueprint Hierarchy */}
              <div className="card p-3.5 space-y-2 border border-white/10">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                  <Layers size={14} className="text-indigo-500" />
                  <span>1. Syllabus Hierarchy Breakdown</span>
                </div>
                <p>
                  Structure your exam preparation into granular, non-intimidating tiers (Goal &rarr; Phase &rarr; Subject Section &rarr; Topic Task &rarr; Revision Sub-tasks).
                </p>
                <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/80 font-mono text-[10.5px] text-slate-800 dark:text-slate-200 leading-relaxed">
                  <div>Goal: "UPSC / JEE / NEET Exam 2026"</div>
                  <div className="pl-3 text-blue-600 dark:text-blue-400">↳ Phase 1: Core Physics & Chemistry</div>
                  <div className="pl-6 text-indigo-600 dark:text-indigo-400">↳ Section: Mechanics Module</div>
                  <div className="pl-9 text-purple-600 dark:text-purple-400">↳ Task: Rotational Motion</div>
                  <div className="pl-12 text-emerald-600 dark:text-emerald-400">↳ Sub-tasks: Video Lecture, NCERT Reading, PYQ Practice, Revision</div>
                </div>
              </div>

              {/* 2. Multi-Tap Micro-Progress */}
              <div className="card p-3.5 space-y-2 border border-white/10">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span>2. Multi-Tap Micro-Progress (Step-Slices)</span>
                </div>
                <p>
                  Study topics aren't binary. Track step-by-step topic mastery with progressive multi-tap completion.
                </p>
                <div className="p-2.5 rounded-xl bg-slate-100/70 dark:bg-slate-800/80 font-mono text-[10.5px] text-slate-800 dark:text-slate-200 space-y-0.5">
                  <div className="font-bold text-slate-900 dark:text-slate-100">For topic "Rotational Dynamics" (3 steps):</div>
                  <div>• Tap 1: Video Lecture Watched</div>
                  <div>• Tap 2: PYQs Practiced</div>
                  <div>• Tap 3: Formula Revision Complete</div>
                </div>
              </div>

              {/* 3. Synced Daily Dispatch */}
              <div className="card p-3.5 space-y-1.5 border border-white/10">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                  <GitMerge size={14} className="text-purple-500" />
                  <span>3. Synced Daily Dispatch</span>
                </div>
                <p>
                  Drill down into your master Syllabus Blueprint, select any pending chapter topic, and dispatch it directly to "Today's Execution". Progress made on your daily study schedule automatically updates your master syllabus tree in real-time.
                </p>
              </div>

              {/* 4. Focused Direct-Child Counting */}
              <div className="card p-3.5 space-y-1.5 border border-white/10">
                <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                  <CalendarCheck size={14} className="text-amber-500" />
                  <span>4. Focused Direct-Child Counting</span>
                </div>
                <p>
                  Parent nodes display only immediate sub-tier progress (e.g., a Goal displays "0/4 Subjects", while a Subject displays "0/5 Chapters"). This eliminates syllabus anxiety and keeps your focus strictly on today's target.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 5. Developer Info */}
        <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 dark:text-slate-400">
              Developer
            </span>
            <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
              Jatin Parmar (@mattedhairr)
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
            <a
              href="https://github.com/mattedhairr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:text-blue-500 transition-colors"
            >
              <Github size={12} /> GitHub
            </a>
            <a
              href="https://www.linkedin.com/in/jatin-parmar-9b1b962ba"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:text-blue-500 transition-colors"
            >
              <Linkedin size={12} /> LinkedIn
            </a>
            <a
              href="https://instagram.com/mattedhairr"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-1.5 px-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10.5px] font-bold text-slate-600 dark:text-slate-300 flex items-center justify-center gap-1.5 hover:text-pink-500 transition-colors"
            >
              <Instagram size={12} /> Instagram
            </a>
          </div>
        </div>

        {/* Apply & Save */}
        <button
          onClick={apply}
          className="w-full py-3 rounded-2xl text-xs font-extrabold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/25 transition-all active:scale-[0.99]"
        >
          Save & Close Settings
        </button>
      </div>
    </div>
  );
}
