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
import { changeVerifiedCredentials } from '../lib/accountCredentials';
import { resolveAuthRedirectUrl } from '../lib/authRedirect';
import { clearWorkspaceStorage, clearYouDoStorage } from '../lib/storageKeys';

interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: (options?: { clearWorkspace?: boolean }) => Promise<AuthActionResult>;
  deleteAccount: () => Promise<AuthActionResult>;
  updateProfile: (profile: { fullName?: string; avatarUrl?: string }) => Promise<boolean>;
  changeEmail: (currentPassword: string, nextEmail: string) => Promise<AuthActionResult>;
  changePassword: (currentPassword: string, nextPassword: string) => Promise<AuthActionResult>;
  updateCloudBackup: (
    backupData: unknown,
    options: { expectedRevision: number; expectedUserId?: string; requireSafetyCopy?: boolean },
  ) => Promise<{ ok: boolean; error?: string }>;
  fetchCloudBackup: () => Promise<string | null>;
  fetchLiveBackupInfo: (expectedUserId?: string) => Promise<{ backupData: string; updatedAt: string; revision: number } | null>;
  listVisitSnapshots: () => Promise<VisitSnapshotMeta[]>;
  fetchVisitSnapshot: (snapshotId: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signOut: async () => ({ ok: false, error: 'Not initialized' }),
  deleteAccount: async () => ({ ok: false, error: 'Not initialized' }),
  updateProfile: async () => false,
  changeEmail: async () => ({ ok: false, error: 'Not initialized' }),
  changePassword: async () => ({ ok: false, error: 'Not initialized' }),
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

  const signOut = async (options?: { clearWorkspace?: boolean }): Promise<AuthActionResult> => {
    try {
      resetVisitSnapshotFreeze();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      setUser(null);
      if (options?.clearWorkspace) clearWorkspaceStorage();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to sign out.' };
    }
  };

  const deleteAccount = async (): Promise<AuthActionResult> => {
    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmation: 'DELETE' },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Account deletion was not confirmed by the server.');

      resetVisitSnapshotFreeze();
      await supabase.auth.signOut().catch(() => undefined);
      clearYouDoStorage();
      setUser(null);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : 'Unable to delete the account.',
      };
    }
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

  const changeEmail = async (currentPassword: string, nextEmail: string): Promise<AuthActionResult> => {
    try {
      const cleanEmail = nextEmail.trim().toLowerCase();
      if (!cleanEmail || !/^\S+@\S+\.\S+$/.test(cleanEmail)) {
        return { ok: false, error: 'Enter a valid new email address.' };
      }
      if (cleanEmail === user?.email?.toLowerCase()) {
        return { ok: false, error: 'That is already your account email.' };
      }
      if (!user) return { ok: false, error: 'Sign in before changing your email.' };
      const emailRedirectTo = resolveAuthRedirectUrl(import.meta.env.VITE_AUTH_REDIRECT_URL);
      const result = await changeVerifiedCredentials(user, currentPassword, { email: cleanEmail }, { emailRedirectTo });
      if (!result.ok) return result;
      const updated = result.user;
      if (updated) setUser(current => current?.id === updated.id ? updated : current);
      return {
        ok: true,
        message: (updated?.new_email
          ? 'Email change requested. Check both your current and new inboxes.'
          : 'Account email changed.') + (result.cleanupWarning ? ' The temporary security session could not be closed; review your account sessions when connected.' : ''),
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to change email.' };
    }
  };

  const changePassword = async (currentPassword: string, nextPassword: string): Promise<AuthActionResult> => {
    try {
      if (nextPassword.length < 10) return { ok: false, error: 'Use at least 10 characters.' };
      if (nextPassword === currentPassword) return { ok: false, error: 'Choose a different password.' };
      if (!user) return { ok: false, error: 'Sign in before changing your password.' };
      const result = await changeVerifiedCredentials(user, currentPassword, { password: nextPassword });
      if (!result.ok) return result;
      const updated = result.user;
      if (updated) setUser(current => current?.id === updated.id ? updated : current);
      return { ok: true, message: 'Password changed. Use your new password when asked to sign in again.' + (result.cleanupWarning ? ' The temporary security session could not be closed; review your account sessions when connected.' : '') };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to change password.' };
    }
  };

  const updateCloudBackup = async (
    backupData: unknown,
    options: { expectedRevision: number; expectedUserId?: string; requireSafetyCopy?: boolean },
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const userId = await currentUserId();
      if (!userId) return { ok: false, error: 'No active user session found. Please sign in again.' };
      if (userId !== (options.expectedUserId ?? user?.id)) return { ok: false, error: 'Account changed. This workspace was not uploaded.' };
      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
      return await upsertLiveBackup(userId, jsonStr, { expectedRevision: options.expectedRevision, requireSafetyCopy: options.requireSafetyCopy });
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

  const fetchLiveBackupInfo = async (expectedUserId?: string) => {
    const userId = await currentUserId();
    if (expectedUserId && userId !== expectedUserId) throw new Error('Account changed. Cloud inspection stopped.');
    if (!userId) return null;
    const result = await fetchLiveBackupMeta(userId);
    if (await currentUserId() !== userId) throw new Error('Account changed. Cloud inspection stopped.');
    return result;
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
        deleteAccount,
        updateProfile,
        changeEmail,
        changePassword,
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
