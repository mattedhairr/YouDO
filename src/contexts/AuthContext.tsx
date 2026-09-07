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
import { createCredentialVerificationClient, supabase } from '../lib/supabase';
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
    options?: { expectedUpdatedAt?: string | null },
  ) => Promise<{ ok: boolean; error?: string }>;
  fetchCloudBackup: () => Promise<string | null>;
  fetchLiveBackupInfo: () => Promise<{ backupData: string; updatedAt: string } | null>;
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

  const verifyCurrentPassword = async (password: string): Promise<AuthActionResult> => {
    const email = user?.email;
    if (!email) return { ok: false, error: 'No email is attached to this account.' };
    const verificationClient = createCredentialVerificationClient();
    const { data, error } = await verificationClient.auth.signInWithPassword({ email, password });
    if (error || !data.session) return { ok: false, error: 'Current password is incorrect.' };
    const { error: cleanupError } = await verificationClient.auth.signOut({ scope: 'local' });
    if (cleanupError) return { ok: false, error: 'Password verified, but the temporary security check could not be closed. Try again.' };
    return { ok: true };
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
      const verified = await verifyCurrentPassword(currentPassword);
      if (!verified.ok) return verified;
      const emailRedirectTo = resolveAuthRedirectUrl(import.meta.env.VITE_AUTH_REDIRECT_URL);
      const { data, error } = await supabase.auth.updateUser({ email: cleanEmail }, { emailRedirectTo });
      if (error) throw error;
      if (data.user) setUser(data.user);
      return {
        ok: true,
        message: data.user?.new_email
          ? 'Email change requested. Check both your current and new inboxes.'
          : 'Account email changed.',
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to change email.' };
    }
  };

  const changePassword = async (currentPassword: string, nextPassword: string): Promise<AuthActionResult> => {
    try {
      if (nextPassword.length < 10) return { ok: false, error: 'Use at least 10 characters.' };
      if (nextPassword === currentPassword) return { ok: false, error: 'Choose a different password.' };
      const verified = await verifyCurrentPassword(currentPassword);
      if (!verified.ok) return verified;
      const { data, error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;
      if (data.user) setUser(data.user);
      return { ok: true, message: 'Password changed.' };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to change password.' };
    }
  };

  const updateCloudBackup = async (
    backupData: unknown,
    options?: { expectedUpdatedAt?: string | null },
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const userId = await currentUserId();
      if (!userId) return { ok: false, error: 'No active user session found. Please sign in again.' };
      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
      return await upsertLiveBackup(userId, jsonStr, options);
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
