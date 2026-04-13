import dotenv from "dotenv";
import { supabase } from "../config/supabase.js";

dotenv.config();

const run = async () => {
  try {
    const email = process.env.ADMIN_SEED_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;
    const name = process.env.ADMIN_SEED_NAME || "System Admin";

    if (!email || !password) {
      console.error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required in .env");
      process.exit(1);
    }

    const { data: existingAdmin, error: existingAdminError } = await supabase
      .from("users")
      .select("id, email")
      .eq("role", "admin")
      .maybeSingle();

    if (existingAdminError) {
      console.error(existingAdminError.message);
      process.exit(1);
    }

    if (existingAdmin) {
      console.log(`Admin already exists: ${existingAdmin.email}`);
      process.exit(0);
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: "admin",
        name: typeof name === "string" && name.trim() ? name.trim() : "System Admin",
      },
    });

    if (authError || !authData?.user?.id) {
      console.error(authError?.message || "Unable to create auth user");
      process.exit(1);
    }

    const { data: createdAdmin, error: createError } = await supabase
      .from("users")
      .insert([
        {
          id: authData.user.id,
          email,
          name: typeof name === "string" && name.trim() ? name.trim() : "System Admin",
          role: "admin",
        },
      ])
      .select("id, email, role, name")
      .single();

    if (createError) {
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error(createError.message);
      process.exit(1);
    }

    console.log("Admin seed completed successfully");
    console.log(createdAdmin);
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

run();
