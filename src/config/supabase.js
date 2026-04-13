import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase environment variables");
}

const commonAuthOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

// Service-role client: use for admin/database/storage operations on backend.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, commonAuthOptions);

// Anon client: use only for sign-in and user-facing auth flows.
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, commonAuthOptions);
