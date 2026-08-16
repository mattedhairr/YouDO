import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import {
  fetchBackupData,
  fetchLiveBackupMeta,
  fetchVisitSnapshotData,
  listVisitSnapshots,
  resetVisitSnapshotFreeze,
  upsertLiveBackup,
  type VisitSnapshotMeta,
} from '../lib/cloudBackup';
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

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

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
      const userId = await currentUserId();
      if (!userId) return { ok: false, error: 'No active user session found. Please sign in again.' };
      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
      return await upsertLiveBackup(userId, jsonStr);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown network error';
      console.error('updateCloudBackup failed:', err);
      return { ok: false, error: message };
    }
  };

  const fetchCloudBackup = async (): Promise<string | null> => {
    try {
      const userId = await currentUserId();
      if (!userId) return null;
      return await fetchBackupData(userId);
    } catch (err) {
      console.error('fetchCloudBackup failed:', err);
      return null;
    }
  };

  const fetchLiveBackupInfo = async () => {
    const userId = await currentUserId();
    if (!userId) return null;
    return fetchLiveBackupMeta(userId);
  };

  const listVisitSnapshotsForUser = async () => {
    const userId = await currentUserId();
    if (!userId) return [];
    return listVisitSnapshots(userId);
  };

  const fetchVisitSnapshot = async (snapshotId: string) => {
    const userId = await currentUserId();
    if (!userId) return null;
    return fetchVisitSnapshotData(userId, snapshotId);
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
