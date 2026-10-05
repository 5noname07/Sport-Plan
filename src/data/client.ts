import { createClient } from '@supabase/supabase-js';
const env = import.meta as unknown as { env: Record<string, string | undefined> };
const url = env.env.VITE_SUPABASE_URL;
const key = env.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key && !url.includes('your-project') && !key.includes('your-public'));
export const supabase = configured ? createClient(url!, key!) : null;
