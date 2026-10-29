import 'server-only';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set. Copy .env.example to .env.local and fill it in.`);
  return value;
}

export const env = {
  get supabaseUrl() { return required('NEXT_PUBLIC_SUPABASE_URL'); },
  get supabaseAnonKey() { return required('NEXT_PUBLIC_SUPABASE_ANON_KEY'); },
  get serviceRoleKey() { return required('SUPABASE_SERVICE_ROLE_KEY'); },
  get customerSessionSecret() {
    const secret = required('CUSTOMER_SESSION_SECRET');
    if (secret.length < 32) throw new Error('CUSTOMER_SESSION_SECRET must be at least 32 characters long.');
    return secret;
  },
  // Day boundaries for reports and bill filters follow the restaurant's local time.
  get timeZone() { return process.env.RESTAURANT_TIMEZONE || 'Asia/Kolkata'; },
};
