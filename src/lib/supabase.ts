import { createClient } from '@supabase/supabase-js';

import { supabaseAnonKey, supabaseUrl } from './supabaseConfig';

export { supabaseAnonKey, supabaseUrl };

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 20,
    },
  },
});

/** Password checks must not replace the app's current session or persist another client locally. */
export function createCredentialVerificationClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
