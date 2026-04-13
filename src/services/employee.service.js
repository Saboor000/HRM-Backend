import { supabase } from "../config/supabase.js";
import { uploadFile } from "../utils/uploadToSupabase.js";

const allowedRoles = ["employee", "hr", "manager"];

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

export const createEmployeeService = async ({ body, user, files }) => {
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
	} = body;

	const targetRole = role || "employee";

	if (!allowedRoles.includes(targetRole)) {
		return { error: { status: 400, message: "Role must be one of: employee, hr, manager" } };
	}

	if (user?.role === "hr" && targetRole !== "employee") {
		return { error: { status: 403, message: "HR can only create employee accounts" } };
	}

	if (!email || !password || !firstName || !lastName || !employeeId) {
		return {
			error: {
				status: 400,
				message: "email, password, firstName, lastName and employeeId are required",
			},
		};
	}

	const { data: existingUser, error: existingUserError } = await supabase
		.from("users")
		.select("id")
		.eq("email", email)
		.maybeSingle();

	if (existingUserError) {
		return { error: { status: 400, message: existingUserError.message } };
	}

	if (existingUser) {
		return { error: { status: 409, message: "User already exists" } };
	}

	const { data: existingEmployee, error: existingEmployeeError } = await supabase
		.from("employees")
		.select("id")
		.eq("employee_id", employeeId)
		.maybeSingle();

	if (existingEmployeeError) {
		return { error: { status: 400, message: existingEmployeeError.message } };
	}

	if (existingEmployee) {
		return { error: { status: 409, message: "Employee ID already exists" } };
	}

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
		return { error: { status: 400, message: authError?.message || "Unable to create auth user" } };
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
		return { error: { status: 400, message: userInsertError.message } };
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
		])
		.select()
		.single();

	if (error) {
		await supabase.from("users").delete().eq("id", userRow.id);
		await supabase.auth.admin.deleteUser(authUser.user.id);
		return { error: { status: 400, message: error.message } };
	}

	return {
		employee: data,
		user: userRow,
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

	if (role) query = query.eq("role", role);
	if (department) query = query.ilike("department", `%${department}%`);
	if (employmentType) query = query.eq("employment_type", employmentType);
	if (gender) query = query.eq("gender", gender);

	if (search) {
		query = query.or(
			`first_name.ilike.%${search}%,last_name.ilike.%${search}%,employee_id.ilike.%${search}%,department.ilike.%${search}%,phone.ilike.%${search}%`
		);
	}

	query = query.order(sortBy, { ascending: sortOrder === "asc" }).range(from, to);

	const { data, error, count } = await query;

	if (error) {
		return { error: { status: 400, message: error.message } };
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
	const { data, error } = await supabase
		.from("employees")
		.select("*")
		.eq("id", id)
		.maybeSingle();

	if (error) {
		return { error: { status: 400, message: error.message } };
	}

	if (!data) {
		return { error: { status: 404, message: "Employee not found" } };
	}

	if (user?.role === "employee" && user?.id !== data.auth_id) {
		return { error: { status: 403, message: "Forbidden" } };
	}

	return { employee: data };
};

export const updateEmployeeService = async ({ id, body }) => {
	const {
		firstName,
		lastName,
		joiningDate,
		employmentType,
		emergencyName,
		emergencyPhone,
		...rest
	} = body;

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

	if (error) {
		return { error: { status: 400, message: error.message } };
	}

	if (!data) {
		return { error: { status: 404, message: "Employee not found" } };
	}

	return { employee: data };
};

export const deleteEmployeeService = async ({ id }) => {
	const { data: employee, error: findError } = await supabase
		.from("employees")
		.select("id, auth_id")
		.eq("id", id)
		.maybeSingle();

	if (findError) {
		return { error: { status: 400, message: findError.message } };
	}

	if (!employee) {
		return { error: { status: 404, message: "Employee not found" } };
	}

	const { error: deleteEmployeeError } = await supabase.from("employees").delete().eq("id", id);

	if (deleteEmployeeError) {
		return { error: { status: 400, message: deleteEmployeeError.message } };
	}

	if (employee.auth_id) {
		await supabase.from("users").delete().eq("id", employee.auth_id);
		await supabase.auth.admin.deleteUser(employee.auth_id);
	}

	return { message: "Deleted successfully" };
};
