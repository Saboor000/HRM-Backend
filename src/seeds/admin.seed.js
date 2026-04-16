import dotenv from "dotenv";
import { supabase } from "../config/supabase.js";

dotenv.config();

const buildAdminEmployeeId = (authId) => {
  return `ADMIN-${authId.slice(0, 8).toUpperCase()}`;
};

const splitName = (name) => {
  const parts = typeof name === "string" ? name.trim().split(/\s+/).filter(Boolean) : [];

  if (parts.length === 0) {
    return { firstName: "System", lastName: "Admin" };
  }

  if (parts.length === 1) {
    return { firstName: parts[0], lastName: "Admin" };
  }

  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
};

const ensureAdminEmployeeProfile = async (authUser, name) => {
  const { data: existingEmployee, error: existingEmployeeError } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_id", authUser.id)
    .maybeSingle();

  if (existingEmployeeError) {
    console.error(existingEmployeeError.message);
    process.exit(1);
  }

  if (existingEmployee) {
    return existingEmployee;
  }

  const { firstName, lastName } = splitName(name);

  const { data: createdEmployee, error: createEmployeeError } = await supabase
    .from("employees")
    .insert([
      {
        auth_id: authUser.id,
        first_name: firstName,
        last_name: lastName,
        employee_id: buildAdminEmployeeId(authUser.id),
        designation: "admin",
      },
    ])
    .select("id")
    .single();

  if (createEmployeeError) {
    console.error(createEmployeeError.message);
    process.exit(1);
  }

  return createdEmployee;
};

const backfillLeaveApproverColumns = async (employeeId) => {
  const { error: approveBackfillError } = await supabase
    .from("leaves")
    .update({ approved_by: employeeId })
    .eq("status", "approved")
    .is("approved_by", null);

  if (approveBackfillError) {
    console.error(approveBackfillError.message);
    process.exit(1);
  }

  const { error: rejectBackfillError } = await supabase
    .from("leaves")
    .update({ rejected_by: employeeId })
    .eq("status", "rejected")
    .is("rejected_by", null);

  if (rejectBackfillError) {
    console.error(rejectBackfillError.message);
    process.exit(1);
  }
};

const run = async () => {
  try {
    const email = process.env.ADMIN_SEED_EMAIL;
    const password = process.env.ADMIN_SEED_PASSWORD;
    const name = process.env.ADMIN_SEED_NAME || "System Admin";

    if (!email || !password) {
      console.error("ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD are required in .env");
      process.exit(1);
    }

    const { data: listedUsers, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error(listError.message);
      process.exit(1);
    }

    const existingAdmin = (listedUsers?.users || []).find(
      (user) => user?.app_metadata?.role === "admin" || user?.user_metadata?.role === "admin"
    );

    if (existingAdmin) {
      console.log(`Admin already exists: ${existingAdmin.email}`);
      const employee = await ensureAdminEmployeeProfile(
        existingAdmin,
        existingAdmin.user_metadata?.name || name
      );
      await backfillLeaveApproverColumns(employee.id);
      console.log("Admin employee profile is in sync");
      process.exit(0);
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: "admin",
      },
      user_metadata: {
        role: "admin",
        name: typeof name === "string" && name.trim() ? name.trim() : "System Admin",
      },
    });

    if (authError || !authData?.user?.id) {
      console.error(authError?.message || "Unable to create auth user");
      process.exit(1);
    }

    const employee = await ensureAdminEmployeeProfile(authData.user, name);
    await backfillLeaveApproverColumns(employee.id);

    console.log("Admin seed completed successfully");
    console.log({
      id: authData.user.id,
      email: authData.user.email,
      role: authData.user.app_metadata?.role || authData.user.user_metadata?.role,
      name: authData.user.user_metadata?.name || null,
    });
    process.exit(0);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
};

run();
