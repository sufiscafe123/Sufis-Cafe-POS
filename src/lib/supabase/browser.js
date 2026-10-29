import { createBrowserClient } from '@supabase/ssr';

let client = null;

// Browser Supabase client (public anon key only). The app uses it for the staff login
// session and for Realtime subscriptions; all data goes through the /api routes.
export function getSupabaseBrowser() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return client;
}
