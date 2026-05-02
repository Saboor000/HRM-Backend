// import { createClient } from "@supabase/supabase-js";
// import dotenv from "dotenv";

// dotenv.config();

// const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY } = process.env;

// if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
//   throw new Error("Missing Supabase environment variables");
// }

// const commonAuthOptions = {
//   auth: {
//     persistSession: false,
//     autoRefreshToken: false,
//     detectSessionInUrl: false,
//   },
// };

// // Service-role client: use for admin/database/storage operations on backend.
// export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, commonAuthOptions);

// // Anon client: use only for sign-in and user-facing auth flows.
// export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, commonAuthOptions);

import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config(); // ensure env is loaded FIRST

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY) {
  console.error(":x: Missing Supabase environment variables");
  console.error({
    SUPABASE_URL,
    SUPABASE_SERVICE_KEY,
    SUPABASE_ANON_KEY,
  });

  // DO NOT throw error (prevents PM2 restart loop)
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
  SUPABASE_URL || "",
  SUPABASE_SERVICE_KEY || "",
  options
);

// Anonymous client (auth only)
export const supabaseAuth = createClient(
  SUPABASE_URL || "",
  SUPABASE_ANON_KEY || "",
  options
);