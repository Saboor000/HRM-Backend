import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config(); // ← must run before reading process.env

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

const createLazyClient = (clientType) => {
  let client;

  return new Proxy({}, {
    get: (_, property) => {
      if (!client) {
        const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } = getSupabaseConfig();
        const key = clientType === "service" ? SUPABASE_SERVICE_KEY : SUPABASE_ANON_KEY;
        client = createClient(SUPABASE_URL, key, options);
      }

      const value = client[property];
      return typeof value === "function" ? value.bind(client) : value;
    },
  });
};

// Service-role client: use for admin/database/storage operations on backend.
export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, commonAuthOptions);

// Anon client: use only for sign-in and user-facing auth flows.
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, commonAuthOptions);
