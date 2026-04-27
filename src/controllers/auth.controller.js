import jwt from "jsonwebtoken";
import { supabase, supabaseAuth } from "../config/supabase.js";

const getRole = (user) => {
  const userRole = user?.app_metadata?.role || user?.user_metadata?.role || "employee";
  // Map all roles to either "admin" or "user"
  return userRole === "admin" ? "admin" : "user";
};
const getName = (user) => user?.user_metadata?.name || null;
const trimOrNull = (value) => (typeof value === "string" && value.trim() ? value.trim() : null);
const badRequest = (res, error) => res.status(400).json({ message: error.message });
const getAuthUserByIdOrResponse = async (res, id, notFoundMessage = "User not found") => {
  const { data, error } = await supabase.auth.admin.getUserById(id);
  if (error) return { response: badRequest(res, error) };
  if (!data?.user) return { response: res.status(404).json({ message: notFoundMessage }) };
  return { data };
};

const mapAuthUser = (user) => ({
  id: user.id,
  email: user.email,
  role: getRole(user),
  name: getName(user),
});

const createToken = (user, role = getRole(user)) =>
  jwt.sign({ auth_id: user.id, email: user.email, role }, process.env.JWT_SECRET, { expiresIn: "7d" });

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

const createAuthUser = async ({ email, password, name, role = "user" }) => {
  if (role === "admin") {
    return {
      error: {
        status: 403,
        message: "Admin role cannot be assigned from API. Use admin seed only",
      },
    };
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: trimOrNull(name),
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

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("id, designation")
      .eq("auth_id", data.user.id)
      .maybeSingle();

    if (employeeError) return badRequest(res, employeeError);
    const jwtRole = employee?.designation === "admin" ? "admin" : "user";
    const token = createToken(data.user, jwtRole);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: data.user.id,
        employee_id: employee?.id || null,
        email: data.user.email,
        role: jwtRole,
        designation: employee?.designation || "employee",
        name: data.user.user_metadata?.name || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

export const getUserDetails = async (req, res, next) => {
  try {
    const { auth_id } = req.user;

    const { data: authUserData, response } = await getAuthUserByIdOrResponse(res, auth_id, "User profile not found");
    if (response) return response;

    const { data: employee, error: employeeError } = await supabase
      .from("employees")
      .select("*")
      .eq("auth_id", auth_id)
      .maybeSingle();

    if (employeeError) return badRequest(res, employeeError);

    return res.status(200).json({
      user: {
        id: authUserData.user.id,
        email: authUserData.user.email,
        role: req.user.role,
        designation: employee?.designation || "employee",
        name: authUserData.user.user_metadata?.name || null,
      },
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

    if (error) return badRequest(res, error);

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
    const { data, response } = await getAuthUserByIdOrResponse(res, id);
    if (response) return response;

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

    const { data: targetAuthData, response: targetResponse } = await getAuthUserByIdOrResponse(res, id);
    if (targetResponse) return targetResponse;
    const targetUser = mapAuthUser(targetAuthData.user);

    if (role === "admin") {
      return res.status(403).json({ message: "Admin role cannot be assigned from API" });
    }

    if (targetUser.role === "admin" && typeof role === "string" && role !== "admin") {
      return res.status(400).json({ message: "Seeded admin role cannot be changed" });
    }

    const authUpdates = {};

    const nextEmail = trimOrNull(email);
    const nextPassword = trimOrNull(password);
    if (nextEmail) authUpdates.email = nextEmail;
    if (nextPassword) authUpdates.password = nextPassword;

    const nextName = trimOrNull(name) || targetUser.name;
    const nextRole = trimOrNull(role) || targetUser.role;

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
      if (authUpdateError) return badRequest(res, authUpdateError);
    }

    const { data: refreshedUserData, response: refreshedResponse } = await getAuthUserByIdOrResponse(res, id);
    if (refreshedResponse) return refreshedResponse;

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

    const { data: targetAuthData, response: targetResponse } = await getAuthUserByIdOrResponse(res, id);
    if (targetResponse) return targetResponse;
    const targetUser = mapAuthUser(targetAuthData.user);

    if (targetUser.role === "admin") {
      return res.status(400).json({ message: "Seeded admin account cannot be deleted" });
    }

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(id);
    if (authDeleteError) return badRequest(res, authDeleteError);

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return next(error);
  }
};
