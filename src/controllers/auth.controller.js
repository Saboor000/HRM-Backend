import jwt from "jsonwebtoken";
import { supabase, supabaseAuth } from "../config/supabase.js";

const getRole = (user) => user?.app_metadata?.role || user?.user_metadata?.role || "employee";
const getName = (user) => user?.user_metadata?.name || null;

const mapAuthUser = (user) => ({
  id: user.id,
  email: user.email,
  role: getRole(user),
  name: getName(user),
});

const createToken = (user) => {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: getRole(user),
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const normalizeName = (name) => {
  return typeof name === "string" && name.trim() ? name.trim() : null;
};

const listAllAuthUsers = async () => {
  const users = [];
  let page = 1;
  const perPage = 500;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });

    if (error) {
      return { error };
    }

    users.push(...(data?.users || []));

    if (!data?.nextPage) {
      break;
    }

    page = data.nextPage;
  }

  return { users };
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
    app_metadata: {
      role,
    },
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

  return {
    user: mapAuthUser(authData.user),
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

    const token = createToken(data.user);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: mapAuthUser(data.user),
    });
  } catch (error) {
    return next(error);
  }
};

export const getUserDetails = async (req, res, next) => {
  try {
    const { id } = req.user;

    const { data: authUserData, error: authUserError } = await supabase.auth.admin.getUserById(id);

    if (authUserError) {
      return res.status(400).json({ message: authUserError.message });
    }

    if (!authUserData?.user) {
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
      user: mapAuthUser(authUserData.user),
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
    const { users, error } = await listAllAuthUsers();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    const mappedUsers = users.map(mapAuthUser).sort((a, b) => a.email.localeCompare(b.email));

    return res.status(200).json({
      message: "Users fetched successfully",
      users: mappedUsers,
    });
  } catch (error) {
    return next(error);
  }
};

export const getUserByIdByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase.auth.admin.getUserById(id);

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!data?.user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "User fetched successfully",
      user: mapAuthUser(data.user),
    });
  } catch (error) {
    return next(error);
  }
};

export const updateUserByAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { email, password, name, role } = req.body;

    const { data: targetAuthData, error: targetUserError } = await supabase.auth.admin.getUserById(id);

    if (targetUserError) {
      return res.status(400).json({ message: targetUserError.message });
    }

    const targetUser = targetAuthData?.user ? mapAuthUser(targetAuthData.user) : null;

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

    if (typeof email === "string" && email.trim()) {
      authUpdates.email = email.trim();
    }

    if (typeof password === "string" && password.trim()) {
      authUpdates.password = password.trim();
    }

    const nextName = typeof name === "string" && name.trim() ? name.trim() : targetUser.name;
    const nextRole = typeof role === "string" && role.trim() ? role.trim() : targetUser.role;

    if (nextName !== targetUser.name || nextRole !== targetUser.role) {
      authUpdates.app_metadata = {
        ...(targetAuthData.user.app_metadata || {}),
        role: nextRole,
      };
      authUpdates.user_metadata = {
        ...(targetAuthData.user.user_metadata || {}),
        name: nextName,
        role: nextRole,
      };
    }

    if (Object.keys(authUpdates).length > 0) {
      const { error: authUpdateError } = await supabase.auth.admin.updateUserById(id, authUpdates);
      if (authUpdateError) {
        return res.status(400).json({ message: authUpdateError.message });
      }
    }

    const { data: refreshedUserData, error: refreshedUserError } = await supabase.auth.admin.getUserById(id);

    if (refreshedUserError) {
      return res.status(400).json({ message: refreshedUserError.message });
    }

    return res.status(200).json({
      message: "User updated successfully",
      user: mapAuthUser(refreshedUserData.user),
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

    const { data: targetAuthData, error: targetUserError } = await supabase.auth.admin.getUserById(id);

    if (targetUserError) {
      return res.status(400).json({ message: targetUserError.message });
    }

    const targetUser = targetAuthData?.user ? mapAuthUser(targetAuthData.user) : null;

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

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return next(error);
  }
};
