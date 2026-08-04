import { useRef, useState } from 'react';
import { AlertTriangle, BookOpen, Clock, Download, HardDrive, Layers, Moon, ShieldCheck, Sun, Upload, X, Zap } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import { useStore } from '../store';

interface Props {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onApply: (t: Theme) => void;
}

export default function SettingsSheet({ open, theme, onClose, onApply }: Props) {
  const { exportBackup, importBackup, downloadAutoSnapshot } = useStore();
  const [darkMode, setDarkMode] = useState(theme.darkMode);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const apply = () => {
    onApply({ darkMode });
    onClose();
  };

  const handleExport = () => {
    exportBackup();
    setMsg({ text: 'Backup file exported successfully!' });
  };

  const handleImport = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const ok = importBackup(reader.result as string);
      if (ok) {
        setMsg({ text: 'Backup restored successfully! All goals and tasks are back.' });
      } else {
        setMsg({ text: 'Failed to restore: Invalid JSON backup file.', error: true });
      }
    };
    reader.readAsText(file);
  };

  const handleAutoSnapshotDownload = () => {
    const ok = downloadAutoSnapshot();
    if (ok) {
      setMsg({ text: 'Latest automated snapshot downloaded!' });
    } else {
      setMsg({ text: 'No automated snapshot found yet.', error: true });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl p-5 pb-8 max-h-[90vh] overflow-y-auto no-scrollbar shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Settings & Concept Guide</h2>
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-400">Manage appearance, backups & execution workflow</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* 1. Appearance (Dark / Light Mode) */}
        <div>
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">1. Appearance</label>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            <button
              onClick={() => setDarkMode(false)}
              className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold border transition-all ${!darkMode ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
            >
              <Sun size={16} /> Light Mode
            </button>
            <button
              onClick={() => setDarkMode(true)}
              className={`flex items-center justify-center gap-2 py-3 rounded-2xl text-xs font-bold border transition-all ${darkMode ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400 text-blue-600 dark:text-blue-300 shadow-xs' : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'}`}
            >
              <Moon size={16} /> Dark Glass
            </button>
          </div>
        </div>

        {/* 2. Prominent Data Safety Warning Box */}
        <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300/80 dark:border-amber-700/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300 font-extrabold text-[12px]">
            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-400" />
            <span>CRITICAL DATA NOTICE</span>
          </div>
          <p className="text-[11.5px] leading-relaxed text-amber-900/90 dark:text-amber-200/90 font-medium">
            YouDO is a 100% local, offline-first application. There are no cloud servers or user accounts. Do NOT uninstall the app, clear browser data, or reset app site data without exporting a JSON backup file first, or all your progress will be permanently lost!
          </p>
        </div>

        {/* 3. Backup & Restore Manager */}
        <div className="space-y-3">
          <label className="text-[10px] font-extrabold uppercase tracking-widest text-blue-600 dark:text-blue-400">2. Backup & Snapshot Manager</label>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-300 border border-slate-200 dark:border-slate-700 transition-all"
            >
              <Download size={15} className="text-blue-500" /> Export JSON
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-xs font-bold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/40 hover:border-blue-300 border border-slate-200 dark:border-slate-700 transition-all"
            >
              <Upload size={15} className="text-emerald-500" /> Import JSON
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => handleImport(e.target.files?.[0])} />

          <button
            onClick={handleAutoSnapshotDownload}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-2xl text-[11.5px] font-bold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700/60 transition-colors"
          >
            <Clock size={14} className="text-indigo-400" /> Download Latest Auto-Snapshot (Hourly)
          </button>

          {msg && (
            <p className={`text-[11.5px] font-bold text-center ${msg.error ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              {msg.text}
            </p>
          )}
        </div>

        {/* 4. App Tutorial & Concept Guide Section */}
        <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-blue-500" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-slate-900 dark:text-slate-100">App Concept & Tutorial Guide</h3>
          </div>

          <div className="space-y-3.5 text-[11.5px] leading-relaxed text-slate-600 dark:text-slate-300">
            {/* Concept & USP */}
            <div className="card p-3.5 space-y-1.5 border border-white/10">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                <Zap size={14} className="text-blue-500" />
                <span>Why YouDO Differs from Flat Todo Apps</span>
              </div>
              <p>
                Flat todo apps quickly overflow into endless, daunting lists. YouDO uses <strong>deep hierarchical execution trees</strong> (Goal &rarr; Phase &rarr; Section &rarr; Task &rarr; Steps) to break overwhelming ambitions into actionable step-sliced daily execution.
              </p>
            </div>

            {/* Goals & Breakdown */}
            <div className="card p-3.5 space-y-1.5 border border-white/10">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                <Layers size={14} className="text-indigo-500" />
                <span>Structuring Multi-Phase Projects</span>
              </div>
              <p>
                Example: Goal <em>"Marathon Preparation"</em> &rarr; Phase 1 <em>"Base Conditioning"</em> &rarr; Section 1 <em>"Weekly Runs"</em> &rarr; Step-slice <em>"Long Run 10km"</em> into actionable sub-steps. You can schedule individual step slices for specific days without cluttering your master blueprint.
              </p>
            </div>

            {/* Direct Child Tracking */}
            <div className="card p-3.5 space-y-1.5 border border-white/10">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                <ShieldCheck size={14} className="text-emerald-500" />
                <span>Direct Child Progress Isolation</span>
              </div>
              <p>
                To maintain razor-sharp focus, parent nodes only track immediate direct children (e.g. a Goal shows <code>0/3 phases done</code>, and inside a Phase shows <code>0/5 tasks done</code>). When all sub-tasks in a phase reach 100%, that phase automatically marks complete for the goal.
              </p>
            </div>

            {/* Offline-First */}
            <div className="card p-3.5 space-y-1.5 border border-white/10">
              <div className="flex items-center gap-2 text-slate-900 dark:text-slate-100 font-bold text-xs">
                <HardDrive size={14} className="text-purple-500" />
                <span>100% Offline-First & Private</span>
              </div>
              <p>
                Your goals and daily logs are stored <strong>strictly on your local device</strong> via HTML5 LocalStorage and Workbox Service Worker precaching. YouDO launches instantly without internet access.
              </p>
            </div>
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
