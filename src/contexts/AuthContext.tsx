import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  updateProfile: (profile: { fullName?: string; avatarUrl?: string }) => Promise<boolean>;
  updateCloudBackup: (backupData: any) => Promise<boolean>;
  fetchCloudBackup: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: false,
  signOut: async () => {},
  updateProfile: async () => false,
  updateCloudBackup: async () => false,
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
   * Saves backup to Supabase Database table (no size limits, no auth metadata issues).
   * Uses upsert so there's always exactly ONE row per user.
   */
  const updateCloudBackup = async (backupData: any): Promise<boolean> => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        console.error('updateCloudBackup: No active session');
        return false;
      }

      const jsonStr = typeof backupData === 'string' ? backupData : JSON.stringify(backupData);

      const { error } = await supabase
        .from('user_backups')
        .upsert(
          {
            user_id: session.user.id,
            backup_data: jsonStr,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('updateCloudBackup error:', JSON.stringify(error));
        throw error;
      }
      return true;
    } catch (err) {
      console.error('updateCloudBackup failed:', err);
      return false;
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
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // no rows = no backup yet
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
