import { createClient } from "@supabase/supabase-js";

const getSupabaseConfig = () => {
  const {
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_ANON_KEY,
  } = process.env;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
    throw new Error("Missing Supabase environment variables");
  }

  return { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY };
};

const options = {
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

// Service role client (admin access)
export const supabase = createLazyClient("service");

// Anonymous client (auth only)
export const supabaseAuth = createLazyClient("anon");