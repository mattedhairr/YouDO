import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
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
import { finishAccountSignOut, prepareAccountSignOut } from '../lib/workspaceReplacement';
import { matchesRecoveryGrant, nextRecoveryGrant, updatePasswordWithRecoveryToken, type RecoveryGrant } from '../lib/passwordRecovery';
import { isAuthRecoveryUrl } from '../lib/authRedirect';
import { requestAccountDeletion } from '../lib/accountDeletion';
import { updateAccountProfile } from '../lib/accountProfile';

interface AuthActionResult {
  ok: boolean;
  error?: string;
  message?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  recoveryAuthorizedUserId: string | null;
  changeRecoveredPassword: (password: string) => Promise<AuthActionResult>;
  cancelPasswordRecovery: () => void;
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
  recoveryAuthorizedUserId: null,
  changeRecoveredPassword: async () => ({ ok: false, error: 'Not initialized' }),
  cancelPasswordRecovery: () => undefined,
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

// Supabase may finish processing a redirect before React effects subscribe.
// Register during module loading so a genuine recovery callback is not lost.
let earlyRecoveryGrant: RecoveryGrant | null = null;
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    earlyRecoveryGrant = nextRecoveryGrant(earlyRecoveryGrant, event, session, isAuthRecoveryUrl(window.location.search));
  });
}

async function currentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [recoveryAuthorizedUserId, setRecoveryAuthorizedUserId] = useState<string | null>(null);
  const recoveryGrant = useRef<RecoveryGrant | null>(null);
  const recoveryRequestPending = useRef(false);
  const currentAuthUserId = useRef<string | null>(null);
  const lastSeenAccountId = useRef<string | null>(null);
  const accountSwitchVersion = useRef(0);

  useEffect(() => {
    let authEventSeen = false;
    recoveryGrant.current = earlyRecoveryGrant;
    setRecoveryAuthorizedUserId(earlyRecoveryGrant?.userId ?? null);
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!authEventSeen) {
        currentAuthUserId.current = session?.user?.id ?? null;
        lastSeenAccountId.current = session?.user?.id ?? null;
        setUser(session?.user ?? null);
      }
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      authEventSeen = true;
      const nextId = session?.user?.id ?? null;
      if (nextId && lastSeenAccountId.current && nextId !== lastSeenAccountId.current) accountSwitchVersion.current += 1;
      if (nextId) lastSeenAccountId.current = nextId;
      recoveryGrant.current = earlyRecoveryGrant ?? nextRecoveryGrant(recoveryGrant.current, event, session, isAuthRecoveryUrl(window.location.search));
      setRecoveryAuthorizedUserId(recoveryGrant.current?.userId ?? null);
      currentAuthUserId.current = nextId;
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        resetVisitSnapshotFreeze(session?.user?.id);
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const cancelPasswordRecovery = () => {
    earlyRecoveryGrant = null;
    recoveryGrant.current = null;
    setRecoveryAuthorizedUserId(null);
  };

  const changeRecoveredPassword = async (password: string): Promise<AuthActionResult> => {
    if (password.length < 10) return { ok: false, error: 'Use at least 10 characters.' };
    if (recoveryRequestPending.current) return { ok: false, error: 'Password recovery is already in progress.' };
    const grant = recoveryGrant.current;
    if (!grant || currentAuthUserId.current !== grant.userId || !isAuthRecoveryUrl(window.location.search)) {
      return { ok: false, error: 'This reset link is invalid or has expired. Request a new one.' };
    }
    recoveryRequestPending.current = true;
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || recoveryGrant.current !== grant || !matchesRecoveryGrant(grant, session) || currentAuthUserId.current !== grant.userId) {
        return { ok: false, error: 'The account changed or this reset link expired. Request a new one.' };
      }
      await updatePasswordWithRecoveryToken(grant.accessToken, password);
      if (recoveryGrant.current !== grant || currentAuthUserId.current !== grant.userId) {
        return { ok: false, error: 'Password changed for the recovery account, but this device switched accounts. Sign in again.' };
      }
      cancelPasswordRecovery();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Unable to change password.' };
    } finally {
      recoveryRequestPending.current = false;
    }
  };

  const signOut = async (options?: { clearWorkspace?: boolean }): Promise<AuthActionResult> => {
    try {
      const accountId = user?.id ?? null;
      const switchVersion = accountSwitchVersion.current;
      const before = options?.clearWorkspace ? prepareAccountSignOut(accountId ?? '') : null;
      if (before) {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || session?.user.id !== accountId || currentAuthUserId.current !== accountId || accountSwitchVersion.current !== switchVersion) {
          throw new Error('Account changed. The device workspace was not cleared.');
        }
      }
      resetVisitSnapshotFreeze();
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) throw error;
      if (accountSwitchVersion.current !== switchVersion) throw new Error('Account changed during sign-out. The device workspace was kept for safety.');
      setUser(null);
      if (before) {
        try { finishAccountSignOut(before); }
        catch (failure) {
          return { ok: false, error: `Signed out, but the device workspace was kept for safety. ${failure instanceof Error ? failure.message : 'Open YouDO again before switching accounts.'}` };
        }
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unable to sign out.' };
    }
  };

  const deleteAccount = async (): Promise<AuthActionResult> => {
    let serverDeleted = false;
    try {
      if (!user) throw new Error('Sign in before deleting an account.');
      const accountId = user.id;
      const switchVersion = accountSwitchVersion.current;
      const before = prepareAccountSignOut(accountId);
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session || session.user.id !== accountId || currentAuthUserId.current !== accountId || accountSwitchVersion.current !== switchVersion) {
        throw new Error('The account changed. Nothing was deleted. Reopen account settings.');
      }
      await requestAccountDeletion(accountId, session.access_token);
      serverDeleted = true;
      const { data: { session: latest } } = await supabase.auth.getSession();
      if ((latest && latest.user.id !== accountId) || (currentAuthUserId.current && currentAuthUserId.current !== accountId) || accountSwitchVersion.current !== switchVersion) {
        throw new Error('The confirmed account was deleted, but this device switched accounts. Its workspace was kept for safety.');
      }
      resetVisitSnapshotFreeze();
      if (latest) {
        const signedOut = await supabase.auth.signOut({ scope: 'local' });
        if (signedOut.error) throw new Error('The deleted account could not be signed out on this device. Reopen YouDO before switching accounts.');
      }
      if (accountSwitchVersion.current !== switchVersion) throw new Error('Account changed during deletion cleanup. The device workspace was kept for safety.');
      finishAccountSignOut(before);
      setUser(null);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: `${serverDeleted ? 'The account was deleted, but this device copy was kept for safety. ' : ''}${err instanceof Error ? err.message : 'Unable to delete the account.'}`,
      };
    }
  };

  const updateProfile = async ({ fullName, avatarUrl }: { fullName?: string; avatarUrl?: string }): Promise<boolean> => {
    try {
      if (!user) throw new Error('Sign in before changing your profile.');
      const accountId = user.id;
      const data: Record<string, string> = {};
      if (fullName !== undefined) data.full_name = fullName;
      if (avatarUrl !== undefined) data.avatar_url = avatarUrl;
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error || !session || session.user.id !== accountId || currentAuthUserId.current !== accountId) {
        throw new Error('Account changed. Profile edit cancelled.');
      }
      const updated = await updateAccountProfile(accountId, session.access_token, data);
      const { data: { session: latest } } = await supabase.auth.getSession();
      if (latest?.user.id === accountId && latest.access_token === session.access_token) {
        await supabase.auth.refreshSession().catch(() => undefined);
      }
      setUser(current => current?.id === accountId ? updated : current);
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
        recoveryAuthorizedUserId,
        changeRecoveredPassword,
        cancelPasswordRecovery,
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
