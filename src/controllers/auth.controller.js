import jwt from "jsonwebtoken";
import { supabase, supabaseAuth } from "../config/supabase.js";

const createToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.user_metadata?.role || user.role || "employee",
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const normalizeName = (name) => {
  return typeof name === "string" && name.trim() ? name.trim() : null;
};

const createProfileRecord = async ({ id, email, name, role }) => {
  const { data, error } = await supabase
    .from("users")
    .insert([
      {
        id,
        email,
        name,
        role,
      },
    ])
    .select("id, email, role, name")
    .single();

  if (error) {
    return { error };
  }

  return { data };
};

const createAuthUser = async ({ email, password, name, role = "employee" }) => {
  if (role === "admin") {
    return {
      error: {
        status: 403,
        message: "Admin role cannot be assigned from API. Use admin seed only",
      },
    };
  }

  const normalizedName = normalizeName(name);

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: normalizedName,
      role,
    },
  });

  if (authError || !authData?.user?.id) {
    return {
      error: {
        status: 400,
        message: authError?.message || "Unable to create auth user",
      },
    };
  }

  const { data: profileData, error: profileError } = await createProfileRecord({
    id: authData.user.id,
    email,
    name: normalizedName,
    role,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    return { error: { status: 400, message: profileError.message } };
  }

  return {
    user: profileData,
  };
};

export const signin = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.user) {
      return res.status(401).json({ message: error?.message || "Invalid credentials" });
    }

    const { data: profile } = await supabase
      .from("users")
      .select("id, email, role, name")
      .eq("id", data.user.id)
      .maybeSingle();

    const token = createToken({
      id: data.user.id,
      email: data.user.email,
      role: profile?.role || data.user.user_metadata?.role || "employee",
      user_metadata: {
        role: profile?.role || data.user.user_metadata?.role || "employee",
        name: profile?.name || data.user.user_metadata?.name || null,
      },
    });

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: data.user.id,
        email: data.user.email,
        role: profile?.role || data.user.user_metadata?.role || "employee",
        name: profile?.name || data.user.user_metadata?.name || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getUserDetails = async (req, res, next) => {
  try {
    const { id } = req.user;

    const { data: user, error: userError } = await supabase
      .from("users")
      .select("id, email, role, name")
      .eq("id", id)
      .maybeSingle();

    if (userError) {
      return res.status(400).json({ message: userError.message });
    }

    if (!user) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("auth_id", id)
      .maybeSingle();

    if (employeeError) {
      return res.status(400).json({ message: employeeError.message });
    }

    return res.status(200).json({
      user,
      employee: employee || null,
    });
  } catch (error) {
    return next(error);
  }
};

export const createUserByAdmin = async (req, res, next) => {
  try {
    const { email, password, name, role = "employee" } = req.body;

    const result = await createAuthUser({ email, password, name, role });

    if (result.error) {
      return res.status(result.error.status).json({ message: result.error.message });
    }

    return res.status(201).json({
      message: "User added successfully by admin",
      user: result.user,
    });
  } catch (error) {
    return next(error);
  }
};

export const getUsersByAdmin = async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, name")
      .order("email", { ascending: true });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({
      message: "Users fetched successfully",
      users: data || [],
    });
  } catch (error) {
    return next(error);
  }
};

export const getUserByIdByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("users")
      .select("id, email, role, name")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "User fetched successfully",
      user: data,
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUserByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password, name, role } = req.body;

    const { data: targetUser, error: targetUserError } = await supabase
      .from("users")
      .select("id, email, role, name")
      .eq("id", id)
      .maybeSingle();

    if (targetUserError) {
      return res.status(400).json({ message: targetUserError.message });
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (role === "admin") {
      return res.status(403).json({ message: "Admin role cannot be assigned from API" });
    }

    if (targetUser.role === "admin" && typeof role === "string" && role !== "admin") {
      return res.status(400).json({ message: "Seeded admin role cannot be changed" });
    }

    const authUpdates = {};
    const profileUpdates = {};

    if (typeof email === "string" && email.trim()) {
      authUpdates.email = email.trim();
      profileUpdates.email = email.trim();
    }

    if (typeof password === "string" && password.trim()) {
      authUpdates.password = password.trim();
    }

    const nextName = typeof name === "string" && name.trim() ? name.trim() : targetUser.name;
    const nextRole = typeof role === "string" && role.trim() ? role.trim() : targetUser.role;

    if (nextName !== targetUser.name || nextRole !== targetUser.role) {
      authUpdates.user_metadata = {
        name: nextName,
        role: nextRole,
      };
    }

    if (nextName !== targetUser.name) {
      profileUpdates.name = nextName;
    }

    if (nextRole !== targetUser.role) {
      profileUpdates.role = nextRole;
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(id, authUpdates);
      if (authUpdateError) {
        return res.status(400).json({ message: authUpdateError.message });
      }
    }

    const { data, error } = await supabase
      .from("users")
      .update(profileUpdates)
      .eq("id", id)
      .select("id, email, role, name")
      .maybeSingle();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(200).json({
      message: "User updated successfully",
      user: data,
    });
  } catch (error) {
    return next(error);
  }
};

export const deleteUserByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (req.user?.id === id) {
      return res.status(400).json({ message: "Admin cannot delete their own account" });
    }

    const { data: targetUser, error: targetUserError } = await supabase
      .from("users")
      .select("id, role")
      .eq("id", id)
      .maybeSingle();

    if (targetUserError) {
      return res.status(400).json({ message: targetUserError.message });
    }

    if (!targetUser) {
      return res.status(404).json({ message: "User not found" });
    }

    if (targetUser.role === "admin") {
      return res.status(400).json({ message: "Seeded admin account cannot be deleted" });
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
    if (authDeleteError) {
      return res.status(400).json({ message: authDeleteError.message });
    }

    const { data, error } = await supabase
      .from("users")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return next(error);
  }
};
