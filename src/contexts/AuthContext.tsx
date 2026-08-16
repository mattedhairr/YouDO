import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  fetchLiveBackupMeta,
  fetchVisitSnapshotData,
  freezeLiveBackupForVisit,
  listVisitSnapshots,
  resetVisitSnapshotFreeze,
  type VisitSnapshotMeta,
} from '../lib/cloudBackup';
import { hasClockIncident } from '../lib/deviceClock';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (profile: { fullName?: string; avatarUrl?: string }) => Promise<boolean>;
  updateCloudBackup: (backupData: unknown) => Promise<{ ok: boolean; error?: string }>;
  fetchCloudBackup: () => Promise<string | null>;
  fetchLiveBackupInfo: () => Promise<{ backupData: string; updatedAt: string } | null>;
  listVisitSnapshots: () => Promise<VisitSnapshotMeta[]>;
  fetchVisitSnapshot: (snapshotId: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signOut: async () => {},
  updateProfile: async () => false,
  updateCloudBackup: async () => ({ ok: false, error: 'Not initialized' }),
  fetchCloudBackup: async () => null,
  fetchLiveBackupInfo: async () => null,
  listVisitSnapshots: async () => [],
  fetchVisitSnapshot: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        resetVisitSnapshotFreeze(session?.user?.id);
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    resetVisitSnapshotFreeze();
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async ({ fullName, avatarUrl }: { fullName?: string; avatarUrl?: string }): Promise<boolean> => {
    try {
      const data: Record<string, string> = {};
      if (fullName !== undefined) data.full_name = fullName;
      if (avatarUrl !== undefined) data.avatar_url = avatarUrl;
      const { data: updated, error } = await supabase.auth.updateUser({ data });
      if (error) throw error;
      if (updated.user) setUser(updated.user);
      return true;
    } catch (err) {
      console.error('Failed to update profile:', err);
      return false;
    }
  };

  const updateCloudBackup = async (backupData: unknown): Promise<{ ok: boolean; error?: string }> => {
    try {
      if (hasClockIncident()) {
        return { ok: false, error: 'Cloud write blocked until device date & time is corrected.' };
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return { ok: false, error: 'No active user session found. Please sign in again.' };
      }

      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);

      // Guard against oversized payloads that would silently time out on Supabase.
      const MAX_BACKUP_BYTES = 4 * 1024 * 1024; // 4 MB
      if (jsonStr.length > MAX_BACKUP_BYTES) {
        return {
          ok: false,
          error: `Backup is too large (${(jsonStr.length / 1024 / 1024).toFixed(1)} MB). Clear old session history in Settings → Danger Zone to reduce size.`,
        };
      }

      const userId = session.user.id;
      const freeze = await freezeLiveBackupForVisit(userId);
      if (freeze === 'retry') {
        return { ok: false, error: 'Could not freeze a visit snapshot. Sync will retry.' };
      }
      const now = new Date().toISOString();

      const { data: existing } = await supabase
        .from('user_backups')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        const { error: updateErr } = await supabase
          .from('user_backups')
          .update({ backup_data: jsonStr, updated_at: now })
          .eq('user_id', userId);

        if (updateErr) {
          console.error('updateErr:', updateErr);
          return { ok: false, error: updateErr.message || 'Database update failed' };
        }
      } else {
        const { error: insertErr } = await supabase
          .from('user_backups')
          .insert({ user_id: userId, backup_data: jsonStr, updated_at: now });

        if (insertErr) {
          const { error: fallbackErr } = await supabase
            .from('user_backups')
            .update({ backup_data: jsonStr, updated_at: now })
            .eq('user_id', userId);

          if (fallbackErr) {
            return { ok: false, error: insertErr.message || 'Database insert failed' };
          }
        }
      }

      return { ok: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      console.error('updateCloudBackup failed:', err);
      return { ok: false, error: message };
    }
  };

  const fetchCloudBackup = async (): Promise<string | null> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return null;

      const { data, error } = await supabase
        .from('user_backups')
        .select('backup_data')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (error) {
        console.error('fetchCloudBackup error:', error.message);
        return null;
      }
      return data?.backup_data ?? null;
    } catch (err) {
      console.error('fetchCloudBackup failed:', err);
      return null;
    }
  };

  const fetchLiveBackupInfo = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return fetchLiveBackupMeta(session.user.id);
  };

  const listVisitSnapshotsForUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return [];
    return listVisitSnapshots(session.user.id);
  };

  const fetchVisitSnapshot = async (snapshotId: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    return fetchVisitSnapshotData(session.user.id, snapshotId);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signOut,
        updateProfile,
        updateCloudBackup,
        fetchCloudBackup,
        fetchLiveBackupInfo,
        listVisitSnapshots: listVisitSnapshotsForUser,
        fetchVisitSnapshot,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
