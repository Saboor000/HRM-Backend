import { supabase } from "../config/supabase.js";
import { uploadFile } from "../utils/uploadToSupabase.js";

const uploadSingle = async (files, key, folder) => {
  if (!files?.[key]?.[0]) return null;
  return uploadFile(files[key][0], folder);
};

const uploadMultiple = async (files, key, folder) => {
  if (!files?.[key]?.length) return [];
  const urls = [];
  for (const file of files[key]) {
    urls.push(await uploadFile(file, folder));
  }
  return urls;
};

// ✅ Create Employee (HR/Admin)
export const createEmployee = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      firstName,
      lastName,
      dob,
      gender,
      phone,
      address,
      employeeId,
      department,
      joiningDate,
      employmentType,
      emergencyName,
      emergencyPhone,
    } = req.body;

    const targetRole = role || "employee";
    const allowedRoles = ["employee", "hr", "manager"];

    if (!allowedRoles.includes(targetRole)) {
      return res.status(400).json({
        message: "Role must be one of: employee, hr, manager",
      });
    }

    if (req.user?.role === "hr" && targetRole !== "employee") {
      return res.status(403).json({
        message: "HR can only create employee accounts",
      });
    }

    if (!email || !password || !firstName || !lastName || !employeeId) {
      return res.status(400).json({
        message: "email, password, firstName, lastName and employeeId are required",
      });
    }

    const { data: existingUser, error: existingUserError } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingUserError) {
      return res.status(400).json({ message: existingUserError.message });
    }

    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const { data: existingEmployee, error: existingEmployeeError } = await supabase
      .from("employees")
      .select("id")
      .eq("employee_id", employeeId)
      .maybeSingle();

    if (existingEmployeeError) {
      return res.status(400).json({ message: existingEmployeeError.message });
    }

    if (existingEmployee) {
      return res.status(409).json({ message: "Employee ID already exists" });
    }

    const files = req.files;
    const cnic_url = await uploadSingle(files, "cnic", "cnic");
    const degree_url = await uploadSingle(files, "degree", "degree");
    const passport_url = await uploadSingle(files, "passport", "passport");
    const profile_pic_url = await uploadSingle(files, "profilePic", "profile");
    const contract_url = await uploadSingle(files, "contract", "contract");
    const other_docs = await uploadMultiple(files, "otherDocs", "other");

    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: targetRole,
        name: `${firstName} ${lastName}`.trim(),
      },
    });

    if (authError || !authUser?.user?.id) {
      return res.status(400).json({ message: authError?.message || "Unable to create auth user" });
    }

    const { data: userRow, error: userInsertError } = await supabase
      .from("users")
      .insert([
        {
          id: authUser.user.id,
          email,
          name: `${firstName} ${lastName}`.trim(),
          role: targetRole,
        },
      ])
      .select("id, email, role, name")
      .single();

    if (userInsertError) {
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({ message: userInsertError.message });
    }

    const { data, error } = await supabase.from("employees").insert([
      {
        auth_id: authUser.user.id,
        first_name: firstName,
        last_name: lastName,
        dob,
        gender,
        phone,
        address,
        employee_id: employeeId,
        department,
        role: targetRole,
        joining_date: joiningDate,
        employment_type: employmentType,
        emergency_name: emergencyName,
        emergency_phone: emergencyPhone,
        cnic_url,
        degree_url,
        passport_url,
        profile_pic_url,
        contract_url,
        other_docs,
      },
    ]).select().single();

    if (error) {
      await supabase.from("users").delete().eq("id", userRow.id);
      await supabase.auth.admin.deleteUser(authUser.user.id);
      return res.status(400).json({ message: error.message });
    }

    res.status(201).json({
      message: "Employee created successfully",
      employee: data,
      user: userRow,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};



// ✅ Get All Employees (HR/Admin)
export const getAllEmployees = async (req, res) => {
  try {
    const queryParams = req.validatedQuery || req.query;
    const {
      page = 1,
      limit = 10,
      search,
      role,
      department,
      employmentType,
      gender,
      sortBy = "created_at",
      sortOrder = "desc",
    } = queryParams;

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("employees")
      .select("*", { count: "exact" });

    if (role) query = query.eq("role", role);
    if (department) query = query.ilike("department", `%${department}%`);
    if (employmentType) query = query.eq("employment_type", employmentType);
    if (gender) query = query.eq("gender", gender);

    if (search) {
      query = query.or(
        `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    query = query
      .order(sortBy, { ascending: sortOrder === "asc" })
      .range(from, to);

    const { data, error, count } = await query;

    if (error) return res.status(400).json({ message: error.message });

    return res.status(200).json({
      employees: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: count ? Math.ceil(count / limit) : 0,
      },
      filters: {
        search: search || null,
        role: role || null,
        department: department || null,
        employmentType: employmentType || null,
        gender: gender || null,
        sortBy,
        sortOrder,
      },
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ✅ Get Employee by ID (HR/Admin)
export const getEmployeeById = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) return res.status(400).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "Employee not found" });

    if (req.user?.role === "employee" && req.user?.id !== data.auth_id) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return res.status(200).json({ employee: data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


// Update Employee (HR/Admin) 
export const updateEmployee = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      firstName,
      lastName,
      joiningDate,
      employmentType,
      emergencyName,
      emergencyPhone,
      ...rest
    } = req.body;

    const updates = {
      ...rest,
      ...(firstName ? { first_name: firstName } : {}),
      ...(lastName ? { last_name: lastName } : {}),
      ...(joiningDate ? { joining_date: joiningDate } : {}),
      ...(employmentType ? { employment_type: employmentType } : {}),
      ...(emergencyName ? { emergency_name: emergencyName } : {}),
      ...(emergencyPhone ? { emergency_phone: emergencyPhone } : {}),
    };

    const { data, error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return res.status(400).json({ message: error.message });
    if (!data) return res.status(404).json({ message: "Employee not found" });

    return res.status(200).json({ message: "Updated successfully", employee: data });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


// Delete Employee (HR/Admin)
export const deleteEmployee = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: employee, error: findError } = await supabase
      .from("employees")
      .select("id, auth_id")
      .eq("id", id)
      .maybeSingle();

    if (findError) return res.status(400).json({ message: findError.message });
    if (!employee) return res.status(404).json({ message: "Employee not found" });

    const { error: deleteEmployeeError } = await supabase
      .from("employees")
      .delete()
      .eq("id", id);

    if (deleteEmployeeError) {
      return res.status(400).json({ message: deleteEmployeeError.message });
    }

    if (employee.auth_id) {
      await supabase.from("users").delete().eq("id", employee.auth_id);
      await supabase.auth.admin.deleteUser(employee.auth_id);
    }

    return res.status(200).json({ message: "Deleted successfully" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};