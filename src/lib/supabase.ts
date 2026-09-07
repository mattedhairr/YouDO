import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? 'https://iyrnywfaxakvjkmddmqv.supabase.co';
export const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml5cm55d2ZheGFrdmprbWRkbXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NzMxNzQsImV4cCI6MjEwMjA0OTE3NH0._2BjdSDFSo9AX6vUJqvPuQsMOq1jbJ4j3R0MQvyqzjw';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/** Password checks must not replace the app's current session or persist another client locally. */
export function createCredentialVerificationClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
