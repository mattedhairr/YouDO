import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (profile: { fullName?: string; avatarUrl?: string }) => Promise<boolean>;
  updateCloudBackup: (backupData: any) => Promise<{ ok: boolean; error?: string }>;
  fetchCloudBackup: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signOut: async () => {},
  updateProfile: async () => false,
  updateCloudBackup: async () => ({ ok: false, error: 'Not initialized' }),
  fetchCloudBackup: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    }).catch(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const updateProfile = async ({ fullName, avatarUrl }: { fullName?: string; avatarUrl?: string }): Promise<boolean> => {
    try {
      const data: Record<string, any> = {};
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

  /**
   * Saves backup to Supabase Database table (user_backups).
   * Uses robust select -> update OR insert logic (never relies on ON CONFLICT constraints).
   */
  const updateCloudBackup = async (backupData: any): Promise<{ ok: boolean; error?: string }> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        return { ok: false, error: 'No active user session found. Please sign in again.' };
      }

      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);
      const userId = session.user.id;
      const now = new Date().toISOString();

      // Check if user backup row already exists
      const { data: existing } = await supabase
        .from('user_backups')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Update existing row
        const { error: updateErr } = await supabase
          .from('user_backups')
          .update({ backup_data: jsonStr, updated_at: now })
          .eq('user_id', userId);

        if (updateErr) {
          console.error('updateErr:', updateErr);
          return { ok: false, error: updateErr.message || 'Database update failed' };
        }
      } else {
        // Insert new row
        const { error: insertErr } = await supabase
          .from('user_backups')
          .insert({ user_id: userId, backup_data: jsonStr, updated_at: now });

        if (insertErr) {
          console.error('insertErr:', insertErr);
          // If duplicate key error, fallback to update
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
    } catch (err: any) {
      console.error('updateCloudBackup failed:', err);
      return { ok: false, error: err?.message || 'Unknown network error' };
    }
  };

  /**
   * Fetches the stored backup JSON from Supabase Database for the current user.
   */
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
        console.error('fetchCloudBackup error:', JSON.stringify(error));
        return null;
      }
      return data?.backup_data ?? null;
    } catch (err) {
      console.error('fetchCloudBackup failed:', err);
      return null;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, signOut, updateProfile, updateCloudBackup, fetchCloudBackup }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
