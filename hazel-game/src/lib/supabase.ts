import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase config. Copy hazel-game/.env.example to hazel-game/.env ' +
      'and set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY ' +
      '(Supabase dashboard → Project Settings → API).',
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
