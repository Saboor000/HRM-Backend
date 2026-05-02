import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  SUPABASE_ANON_KEY,
} = process.env;

// Fail fast at startup (correct approach for production)
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

// Service role client (admin access)
export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  options
);

// Anonymous client (auth only)
export const supabaseAuth = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  options
);