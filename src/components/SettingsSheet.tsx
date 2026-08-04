import { useRef, useState } from 'react';
import { Download, Moon, Sun, Upload, X } from 'lucide-react';
import type { Theme } from '../hooks/useTheme';
import { useStore } from '../store';

interface Props {
  open: boolean;
  theme: Theme;
  onClose: () => void;
  onApply: (t: Theme) => void;
}

export default function SettingsSheet({ open, theme, onClose, onApply }: Props) {
  const { tasks, goals, restoreData } = useStore();
  const [darkMode, setDarkMode] = useState(theme.darkMode);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const apply = () => {
    onApply({ darkMode });
    setMsg(null);
  };

  const backup = () => {
    const data = JSON.stringify({ tasks, goals, version: 3, exportedAt: new Date().toISOString() });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tudo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMsg('Backup saved to your device.');
  };

  const restore = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (!parsed.tasks || !parsed.goals) throw new Error('Invalid file');
        restoreData({ tasks: parsed.tasks, goals: parsed.goals });
        setMsg('Restore complete! All your tasks and goals are back.');
      } catch {
        setMsg('That file does not look like a valid TuDo backup.');
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="sheet-up relative w-full max-w-md bg-white dark:bg-slate-800 rounded-t-3xl p-5 pb-8 max-h-[88vh] overflow-y-auto no-scrollbar shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">Settings</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700">
            <X size={18} />
          </button>
        </div>

        {/* Dark mode toggle */}
        <div className="mb-6">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Appearance</label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => setDarkMode(false)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-all ${!darkMode ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-500 text-blue-600 dark:text-blue-300' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}
            >
              <Sun size={16} /> Light
            </button>
            <button
              onClick={() => setDarkMode(true)}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium border transition-all ${darkMode ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-500 text-blue-600 dark:text-blue-300' : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400'}`}
            >
              <Moon size={16} /> Dark
            </button>
          </div>
        </div>

        {/* Backup & Restore */}
        <div className="mb-6">
          <label className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">Backup & Restore</label>
          <p className="mt-1 text-[12px] text-slate-400 dark:text-slate-500 leading-snug">
            Save a backup file to your device. If you ever reinstall, use Restore to bring everything back.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={backup}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
            >
              <Download size={15} /> Backup
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
            >
              <Upload size={15} /> Restore
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => restore(e.target.files?.[0])} />
          {msg && <p className="mt-2.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">{msg}</p>}
        </div>

        <button
          onClick={apply}
          className="w-full py-3 rounded-2xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
