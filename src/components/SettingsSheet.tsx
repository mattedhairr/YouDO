import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  Download,
  Edit2,
  History,
  LogIn,
  LogOut,
  Moon,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  User,
  UserPlus,
  Zap,
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

const USER_GUIDE_STEPS = [
  {
    icon: Zap,
    title: '1. Goals vs. Standalone Tasks',
    desc: 'Goal Blueprint nodes represent structured multi-step plans (Goal > Phase > Section > Task > Leaf). Daily Tasks are active single-day items on your Today/Backlog board. Single-tap [+ Daily Task] on any Goal node to link it!',
  },
  {
    icon: Sparkles,
    title: '2. Multi-Step Goal Slicing',
    desc: 'When planning a Goal node with multiple micro-steps, tap "⚡ Push Step Slices to Today" to pick exact steps to focus on today. You can push Step 1 & 2 today, and save Step 3 & 4 for tomorrow!',
  },
  {
    icon: Edit2,
    title: '3. Single-Tap Edit & Context-Menu Actions',
    desc: 'Tap any task card to expand its action menu (Start Focus Session, Edit, Duplicate, Move to Backlog, Delete). Tap any Goal node title or step list to edit directly.',
  },
  {
    icon: Trash2,
    title: '4. Soft-Delete & Trash Recovery',
    desc: 'Deleting a Goal node moves it to Recently Deleted Goals in Settings. You can restore deleted goals and their associated tasks anytime with zero data loss!',
  },
  {
    icon: Download,
    title: '5. Data Safety & Cloud Sync',
    desc: 'Sign in to automatically sync your goals, tasks, and session stats across devices. Offline local storage is always active with auto-recovery on startup.',
  },
];

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
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [editName, setEditName] = useState(user?.user_metadata?.full_name || '');
  const [editAvatar, setEditAvatar] = useState(user?.user_metadata?.avatar_url || '🎓');
  const [archOpen, setArchOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
      className="h-full w-full max-w-md mx-auto bg-base page-slide-in flex flex-col overflow-hidden border-x border-subtle"
    >
      {/* ── 1. Clean Top Bar ── */}
      <div
        className="flex items-center gap-3 px-4 border-b border-subtle shrink-0 bg-elevated"
        style={{ paddingTop: 'max(1rem, env(safe-area-inset-top))', paddingBottom: '0.875rem' }}
      >
        <button
          onClick={onClose}
          className="p-2 -ml-1.5 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface transition-colors active:scale-95 flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-[16px] font-semibold text-content-primary leading-tight">Settings</h1>
      </div>

      {/* ── 2. Scrollable Body ── */}
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
              <div className="divide-y divide-white/5">
                {/* User Header */}
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-primary-soft border border-primary/20 flex items-center justify-center text-xl shrink-0">
                      {user.user_metadata?.avatar_url || '🎓'}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-xs font-semibold text-content-primary truncate">
                        {user.user_metadata?.full_name || 'Aspirant'}
                      </h3>
                      <p className="text-[11px] text-content-secondary font-medium truncate">{user.email}</p>
                      <span className="text-[9.5px] font-bold text-secondary bg-secondary/10 px-2 py-0.5 rounded-md border border-secondary/20 inline-block mt-0.5">
                        ● Cloud Synced
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        setEditName(user.user_metadata?.full_name || '');
                        setEditAvatar(user.user_metadata?.avatar_url || '🎓');
                        setEditProfileOpen((p) => !p);
                      }}
                      className="p-2 rounded-xl bg-surface hover:bg-elevated text-content-primary transition text-xs font-bold"
                      title="Edit Profile"
                    >
                      <Edit2 size={14} className="text-primary" />
                    </button>
                    <button
                      onClick={() => signOut()}
                      className="p-2 rounded-xl bg-error-soft hover:bg-error/20 text-error transition text-xs font-bold"
                      title="Sign Out"
                    >
                      <LogOut size={14} />
                    </button>
                  </div>
                </div>

                {/* Edit Profile Form */}
                {editProfileOpen && (
                  <div className="p-4 bg-base space-y-3 animate-fade-in">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">
                        Full Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Aspirant's Name"
                        className="w-full bg-elevated border border-subtle rounded-xl px-3 py-2 text-xs text-content-primary focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-widest text-content-muted mb-1">
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
                                ? 'bg-primary-soft border-primary text-white scale-105'
                                : 'bg-surface border-subtle text-content-muted hover:bg-elevated'
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
                      className="w-full py-2 rounded-xl bg-primary hover:bg-primary-glow text-white text-xs font-bold transition"
                    >
                      Save Changes
                    </button>
                  </div>
                )}

                {/* Cloud Sync Actions */}
                <div className="p-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={async () => {
                      const res = await syncToCloud();
                      setMsg(
                        res.ok
                          ? { text: '✓ Cloud Backup Synced!' }
                          : { text: `✗ ${res.error || 'Failed to sync.'}`, error: true },
                      );
                    }}
                    className="py-2 px-3 rounded-xl bg-primary-soft hover:bg-primary-soft text-primary-glow text-[11px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <Upload size={13} /> Sync Cloud Now
                  </button>
                  <button
                    onClick={() => {
                      setConfirmRestore(null);
                      setRestoreOpen((v) => !v);
                    }}
                    className="py-2 px-3 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary text-[11px] font-semibold flex items-center justify-center gap-1.5 transition active:scale-95"
                  >
                    <History size={13} /> Restore Cloud
                  </button>
                </div>

                {restoreOpen && (
                  <div className="px-3 pb-3 space-y-2 animate-fade-in">
                    <p className="text-[10.5px] text-content-secondary font-medium leading-relaxed px-0.5">
                      Latest is what is in the cloud now. The other copies were frozen each time you opened the app (last 3 visits). Restoring replaces goals, tasks, and session stats on this device.
                    </p>
                    {restoreLoading && (
                      <p className="text-[11px] text-content-muted font-medium px-1">Loading copies…</p>
                    )}
                    {!restoreLoading && restorePoints && !restorePoints.live && restorePoints.visits.length === 0 && (
                      <p className="text-[11px] text-content-secondary font-medium px-1">No cloud backup found yet.</p>
                    )}
                    {!restoreLoading && restorePoints?.live && (
                      <button
                        type="button"
                        onClick={() => setConfirmRestore({ kind: 'live' })}
                        className="w-full text-left p-3 rounded-xl bg-base border border-subtle hover:border-primary/40 transition"
                      >
                        <div className="text-[11px] font-semibold text-content-primary">Latest cloud</div>
                        <div className="text-[10px] text-content-secondary mt-0.5">
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
                          className="w-full text-left p-3 rounded-xl bg-base border border-subtle hover:border-primary/40 transition"
                        >
                          <div className="text-[11px] font-semibold text-content-primary">{visitSnapshotLabel(index)}</div>
                          <div className="text-[10px] text-content-secondary mt-0.5">{formatBackupStamp(visit.createdAt)}</div>
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
                            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-white bg-error hover:bg-error-soft transition"
                          >
                            Restore this copy
                          </button>
                          <button
                            onClick={() => setConfirmRestore(null)}
                            className="flex-1 py-2 rounded-xl text-[11px] font-bold text-content-secondary bg-surface hover:bg-elevated transition"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Account Danger Action */}
                <div className="p-3 flex justify-end">
                  {!confirmDeleteAccount ? (
                    <button
                      onClick={() => setConfirmDeleteAccount(true)}
                      className="text-[11px] font-bold text-error/80 hover:text-error flex items-center gap-1.5 transition py-1 px-2 rounded-lg hover:bg-error-soft"
                    >
                      <Trash2 size={13} /> Delete Account &amp; Data
                    </button>
                  ) : (
                    <div className="w-full rounded-xl bg-error-soft p-3 space-y-2 fade-in">
                      <div className="flex items-center gap-2 text-error font-semibold text-[11px]">
                        <AlertTriangle size={13} /> Delete Account &amp; Reset Data?
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            setConfirmDeleteAccount(false);
                            await signOut();
                            setMsg({ text: '✓ Signed out & data reset.' });
                          }}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-white bg-error hover:bg-error-soft transition"
                        >
                          Yes, Delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteAccount(false)}
                          className="flex-1 py-1.5 rounded-lg text-[11px] font-bold text-content-secondary bg-surface hover:bg-elevated transition"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Guest State */
              <div className="p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-surface flex items-center justify-center text-content-muted shrink-0 mt-0.5">
                    <User size={18} />
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-content-primary">Guest mode</h3>
                    <p className="text-[11px] text-content-secondary font-medium leading-snug mt-0.5">
                      Sign in to sync your goals and focus analytics seamlessly across devices.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => onOpenAuth?.('signin')}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-primary text-on-primary text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <LogIn size={14} /> Sign In
                  </button>
                  <button
                    onClick={() => onOpenAuth?.('signup')}
                    className="flex-1 py-2.5 px-3 rounded-xl bg-surface hover:bg-elevated active:scale-95 text-content-primary text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    <UserPlus size={14} className="text-primary" /> Create Account
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
        </section>

        {/* ── SECTION 3: DATA & STORAGE ── */}
        <section>
          <SectionLabel>DATA &amp; STORAGE</SectionLabel>
          <div className="bg-elevated rounded-2xl border border-subtle overflow-hidden shadow-lg divide-y divide-white/5">
            {/* Row 1: Trash Bin Drawer */}
            <div>
              <button
                type="button"
                onClick={() => setTrashOpen((p) => !p)}
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
                <ChevronDown
                  size={16}
                  className={`text-content-muted transition-transform duration-200 ${
                    trashOpen ? 'rotate-180 text-primary' : ''
                  }`}
                />
              </button>

              {trashOpen && (
                <div className="px-4 pb-4 pt-1 bg-base space-y-2 animate-fade-in">
                  {recentlyDeletedGoals.length === 0 ? (
                    <p className="text-[11px] text-content-secondary font-medium italic py-1">
                      No deleted goals in trash. Deleting goals moves them here for quick recovery!
                    </p>
                  ) : (
                    <>
                      <div className="flex justify-end pb-1">
                        <button
                          onClick={clearTrash}
                          className="text-[10.5px] font-bold text-error hover:underline"
                        >
                          Empty Trash
                        </button>
                      </div>
                      <div className="space-y-2 max-h-48 overflow-y-auto overscroll-contain no-scrollbar">
                        {recentlyDeletedGoals.map((rec) => (
                          <div
                            key={rec.id}
                            className="p-2.5 rounded-xl bg-elevated border border-subtle flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold text-content-primary truncate">
                                {rec.node.title}
                              </div>
                              <div className="text-[10px] text-content-secondary">
                                Deleted{' '}
                                {new Date(rec.deletedAt).toLocaleTimeString(undefined, {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </div>
                            </div>
                            <button
                              onClick={() => restoreDeletedGoal(rec.id)}
                              className="px-2.5 py-1 rounded-lg bg-primary-soft hover:bg-primary-soft text-primary-glow text-[11px] font-bold shrink-0 transition active:scale-95"
                            >
                              Restore
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

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
            {/* Row 1: About Architecture */}
            <div>
              <button
                type="button"
                onClick={() => setArchOpen((p) => !p)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/2 transition"
              >
                <div className="flex items-center gap-3">
                  <Sparkles size={16} className="text-primary shrink-0" />
                  <div>
                    <h3 className="text-xs font-semibold text-content-primary">About YouDO Architecture</h3>
                    <p className="text-[10.5px] text-content-secondary font-medium">Design rationale &amp; key features</p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-content-muted transition-transform duration-200 ${
                    archOpen ? 'rotate-180 text-primary' : ''
                  }`}
                />
              </button>

              {archOpen && (
                <div className="p-4 bg-base space-y-3 text-xs text-content-secondary leading-relaxed animate-fade-in">
                  <p>
                    <strong className="text-content-primary">YouDO</strong> is built around the principle of{' '}
                    <strong className="text-primary">Execution Friction Minimization</strong>.
                  </p>
                  <ul className="space-y-1.5 list-disc list-inside text-[11.5px]">
                    <li>Goal Blueprints keep your master vision organized in an infinite nested tree.</li>
                    <li>Daily Cards isolate today’s work so you never feel overwhelmed.</li>
                    <li>Step Slicing lets you assign specific micro-steps to today without cluttering goals.</li>
                    <li>Focus Sessions track active study time with session analytics.</li>
                  </ul>
                </div>
              )}
            </div>

            {/* Row 2: Aspirant Execution Guide */}
            <div>
              <button
                type="button"
                onClick={() => setGuideOpen((p) => !p)}
                className="w-full p-4 flex items-center justify-between text-left hover:bg-white/2 transition"
              >
                <div className="flex items-center gap-3">
                  <Zap size={16} className="text-accent shrink-0" />
                  <div>
                    <h3 className="text-xs font-semibold text-content-primary">Aspirant Execution Guide</h3>
                    <p className="text-[10.5px] text-content-secondary font-medium">Step-by-step onboarding walkthrough</p>
                  </div>
                </div>
                <ChevronDown
                  size={16}
                  className={`text-content-muted transition-transform duration-200 ${
                    guideOpen ? 'rotate-180 text-accent' : ''
                  }`}
                />
              </button>

              {guideOpen && (
                <div className="p-4 bg-base space-y-3 animate-fade-in">
                  <div className="space-y-2">
                    {USER_GUIDE_STEPS.map((step, idx) => {
                      const IconComp = step.icon;
                      return (
                        <div key={idx} className="p-3 rounded-xl bg-elevated border border-subtle space-y-1">
                          <div className="flex items-center gap-2 text-xs font-semibold text-content-primary">
                            <IconComp size={14} className="text-primary shrink-0" />
                            {step.title}
                          </div>
                          <p className="text-[11px] text-content-secondary font-medium leading-relaxed">
                            {step.desc}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
    </Overlay>
  );
}
