import { supabase } from "../config/supabase.js";
import { uploadFile } from "../utils/uploadToSupabase.js";

const allowedDesignations = ["admin", "employee", "hr", "manager"];
const serviceError = (status, message) => ({ error: { status, message } });
const employeeNotFound = () => serviceError(404, "Employee not found");
const isEmployeeRole = (user) => user?.designation === "employee";
const isRestrictedCreator = (user) =>
  user?.designation === "hr" || user?.designation === "manager";
const fullName = (firstName, lastName) => `${firstName} ${lastName}`.trim();
const ensureRequired = (values) => values.every(Boolean);

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

const getUploadedUrl = async (files, key, folder) =>
  files ? await uploadSingle(files, key, folder) : undefined;

const getUploads = async (files) => ({
  cnic_url: await uploadSingle(files, "cnic", "cnic"),
  degree_url: await uploadSingle(files, "degree", "degree"),
  passport_url: await uploadSingle(files, "passport", "passport"),
  profile_pic_url: await uploadSingle(files, "profilePic", "profile"),
  contract_url: await uploadSingle(files, "contract", "contract"),
  other_docs: await uploadMultiple(files, "otherDocs", "other"),
});

const employeeById = async (id, select = "*") =>
  supabase.from("employees").select(select).eq("id", id).maybeSingle();

const employeeByEmployeeId = async (employeeId) =>
  supabase
    .from("employees")
    .select("id")
    .eq("employee_id", employeeId)
    .maybeSingle();

export const createEmployeeService = async ({ body, user, files }) => {
  const {
    email,
    password,
    designation,
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
  } = body;

  const targetDesignation = designation || "employee";

  if (!allowedDesignations.includes(targetDesignation)) {
    return serviceError(
      400,
      "Designation must be one of: admin, employee, hr, manager",
    );
  }

  // Authorization: Admin can create any designation
  // HR and Manager can only create employees
  if (isRestrictedCreator(user) && targetDesignation !== "employee") {
    return serviceError(
      403,
      "HR and Manager can only create employee accounts",
    );
  }

  if (!ensureRequired([email, password, firstName, lastName, employeeId])) {
    return serviceError(
      400,
      "email, password, firstName, lastName and employeeId are required",
    );
  }

  const { data: existingEmployee, error: existingEmployeeError } =
    await employeeByEmployeeId(employeeId);

  if (existingEmployeeError) {
    return serviceError(400, existingEmployeeError.message);
  }

  if (existingEmployee) {
    return serviceError(409, "Employee ID already exists");
  }

  const uploads = await getUploads(files);

  const { data: authUser, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: fullName(firstName, lastName),
      },
    });

  if (authError || !authUser?.user?.id) {
    const isDuplicateEmail =
      /already been registered|already registered|duplicate/i.test(
        authError?.message || "",
      );
    return {
      error: {
        status: isDuplicateEmail ? 409 : 400,
        message: authError?.message || "Unable to create auth user",
      },
    };
  }

  const { data, error } = await supabase
    .from("employees")
    .insert([
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
        designation: targetDesignation,
        joining_date: joiningDate,
        employment_type: employmentType,
        emergency_name: emergencyName,
        emergency_phone: emergencyPhone,
        ...uploads,
      },
    ])
    .select()
    .single();

  if (error) {
    await supabase.auth.admin.deleteUser(authUser.user.id);
    return serviceError(400, error.message);
  }

  return {
    employee: data,
    user: {
      id: authUser.user.id,
      email: authUser.user.email,
      name: authUser.user.user_metadata?.name || fullName(firstName, lastName),
    },
  };
};

export const getAllEmployeesService = async (queryParams = {}) => {
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

  let query = supabase.from("employees").select("*", { count: "exact" });

  if (role) query = query.eq("designation", role);
  if (department) query = query.ilike("department", `%${department}%`);
  if (employmentType) query = query.eq("employment_type", employmentType);
  if (gender) query = query.eq("gender", gender);

  if (search) {
    query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%,phone.ilike.%${search}%`,
    );
  }

  query = query
    .order(sortBy, { ascending: sortOrder === "asc" })
    .range(from, to);

  const { data, error, count } = await query;

  if (error) {
    return serviceError(400, error.message);
  }

  return {
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
  };
};

export const getEmployeeByIdService = async ({ id, user }) => {
  const { data, error } = await employeeById(id);

  if (error) {
    return serviceError(400, error.message);
  }

  if (!data) return employeeNotFound();

  if (isEmployeeRole(user) && user?.auth_id !== data.auth_id) {
    return serviceError(403, "Forbidden");
  }

  return { employee: data };
};
export const updateEmployeeService = async ({ id, body = {}, files }) => {
  const {
    firstName,
    lastName,
    joiningDate,
    employmentType,
    emergencyName,
    emergencyPhone,
    role,

    dob,
    gender,
    phone,
    address,
    department,
    employeeId,
  } = body;

  const cnic_url = await getUploadedUrl(files, "cnic", "cnic");
  const degree_url = await getUploadedUrl(files, "degree", "degree");
  const passport_url = await getUploadedUrl(files, "passport", "passport");
  const profile_pic_url = await getUploadedUrl(files, "profilePic", "profile");
  const contract_url = await getUploadedUrl(files, "contract", "contract");
  const other_docs = files ? await uploadMultiple(files, "otherDocs", "other") : undefined;

  const updates = {
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    ...(dob ? { dob } : {}),
    ...(gender ? { gender } : {}),
    ...(phone ? { phone } : {}),
    ...(address ? { address } : {}),
    ...(department ? { department } : {}),
    ...(employeeId ? { employee_id: employeeId } : {}),
    ...(role ? { designation: role } : {}),
    ...(joiningDate ? { joining_date: joiningDate } : {}),
    ...(employmentType ? { employment_type: employmentType } : {}),
    ...(emergencyName ? { emergency_name: emergencyName } : {}),
    ...(emergencyPhone ? { emergency_phone: emergencyPhone } : {}),
    ...(cnic_url ? { cnic_url } : {}),
    ...(degree_url ? { degree_url } : {}),
    ...(passport_url ? { passport_url } : {}),
    ...(profile_pic_url ? { profile_pic_url } : {}),
    ...(contract_url ? { contract_url } : {}),
    ...(other_docs?.length ? { other_docs } : {}),
  };

  if (Object.keys(updates).length === 0) {
    return { error: { status: 400, message: "No fields provided to update" } };
  }

  const { data, error } = await supabase
    .from("employees")
    .update(updates)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return { error: { status: 400, message: error.message } };
  if (!data) return { error: { status: 404, message: "Employee not found" } };

  return { employee: data };
};
export const deleteEmployeeService = async ({ id }) => {
  const { data: employee, error: findError } = await employeeById(
    id,
    "id, auth_id",
  );

  if (findError) {
    return serviceError(400, findError.message);
  }

  if (!employee) return employeeNotFound();

  const { error: deleteEmployeeError } = await supabase
    .from("employees")
    .delete()
    .eq("id", id);

  if (deleteEmployeeError) {
    return serviceError(400, deleteEmployeeError.message);
  }

  if (employee.auth_id) {
    await supabase.auth.admin.deleteUser(employee.auth_id);
  }

  return { message: "Deleted successfully" };
};
