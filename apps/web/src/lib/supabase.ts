import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { env } from './env';

// Browser client: anon key only. The service role key must never be imported here.
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

export function authRedirect(path: string): string {
  return new URL(path, window.location.origin).toString();
}
