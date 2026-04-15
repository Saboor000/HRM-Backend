import { supabase } from "../../config/supabase.js";
import { getShiftByIdService } from "./shift.service.js";

const error = (status, message) => Object.assign(new Error(message), { status });

export const employeeByAuth = async (authId, optional = false) => {
  if (!authId) {
    throw error(401, "Unauthorized: missing auth user id in token");
  }

  const { data, error: err } = await supabase
    .from("employees")
    .select("id, auth_id, first_name, last_name")
    .eq("auth_id", authId)
    .maybeSingle();

  if (err) throw error(400, err.message);
  if (!data && !optional) throw error(404, "Employee not found");
  return data;
};

const resolveEmployeeId = async (employeeIdentifier) => {
  if (!employeeIdentifier) {
    throw error(400, "employee_id is required");
  }

  const { data: byId, error: byIdErr } = await supabase
    .from("employees")
    .select("id")
    .eq("id", employeeIdentifier)
    .maybeSingle();

  if (byIdErr) throw error(400, byIdErr.message);
  if (byId?.id) return byId.id;

  const { data: byAuth, error: byAuthErr } = await supabase
    .from("employees")
    .select("id")
    .eq("auth_id", employeeIdentifier)
    .maybeSingle();

  if (byAuthErr) throw error(400, byAuthErr.message);
  if (!byAuth?.id) throw error(404, "Employee not found for provided employee_id");

  return byAuth.id;
};

export const assignShiftService = async (payload, userId) => {
  try {
    const employee = await employeeByAuth(userId);
    const targetEmployeeId = await resolveEmployeeId(payload.employee_id);

    await getShiftByIdService(payload.shift_id);

    const { error: checkErr } = await supabase
      .from("employee_shift_assignments")
      .select("id")
      .eq("employee_id", targetEmployeeId)
      .eq("is_active", true)
      .maybeSingle();

    if (checkErr && checkErr.code !== "PGRST116") {
      throw error(400, checkErr.message);
    }

    const { data, error: err } = await supabase
      .from("employee_shift_assignments")
      .insert({
        employee_id: targetEmployeeId,
        shift_id: payload.shift_id,
        assigned_from: payload.assigned_from,
        assigned_to: payload.assigned_to || null,
        is_active: payload.is_active !== false,
        updated_by: employee.id,
      })
      .select(`
        *,
        employee:employee_id(id, first_name, last_name, designation, auth_id),
        shift:shift_id(id, name, start_time, end_time, duration_hours, is_active)
      `)
      .single();

    if (err) throw error(400, err.message);
    const { employee_id, shift_id, ...assignment } = data;
    return assignment;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getAssignmentsService = async (query = {}) => {
  try {
    const { page = 1, limit = 10, employee_id, shift_id, is_active } = query;

    const from = (page - 1) * limit;

    let q = supabase
      .from("employee_shift_assignments")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        shift:shift_id(id, name, start_time, end_time, duration_hours)
      `,
        { count: "exact" }
      )
      .order("assigned_from", { ascending: false });

    if (employee_id) {
      q = q.eq("employee_id", employee_id);
    }

    if (shift_id) {
      q = q.eq("shift_id", shift_id);
    }

    if (is_active !== undefined) {
      q = q.eq("is_active", is_active);
    }

    const { data, error: err, count } = await q.range(from, from + limit - 1);

    if (err) throw error(400, err.message);

    const items = (data || []).map(({ employee_id: _employeeId, shift_id: _shiftId, ...assignment }) => assignment);

    return {
      data: items,
      pagination: {
        page,
        limit,
        total: count || 0,
        pages: Math.ceil((count || 0) / limit),
      },
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getAssignmentByIdService = async (id) => {
  try {
    const { data, error: err } = await supabase
      .from("employee_shift_assignments")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        shift:shift_id(id, name, start_time, end_time, duration_hours)
      `
      )
      .eq("id", id)
      .single();

    if (err && err.code === "PGRST116") {
      throw error(404, "Assignment not found");
    }
    if (err) throw error(400, err.message);

    const { employee_id, shift_id, ...assignment } = data;
    return assignment;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const updateAssignmentService = async (id, payload, userId) => {
  try {
    await getAssignmentByIdService(id);

    const employee = await employeeByAuth(userId);

    const updateData = {};
    if (payload.shift_id !== undefined) {
      await getShiftByIdService(payload.shift_id);
      updateData.shift_id = payload.shift_id;
    }
    if (payload.assigned_to !== undefined) {
      updateData.assigned_to = payload.assigned_to;
    }
    if (payload.is_active !== undefined) {
      updateData.is_active = payload.is_active;
    }
    updateData.updated_by = employee.id;
    updateData.updated_at = new Date().toISOString();

    const { data, error: err } = await supabase
      .from("employee_shift_assignments")
      .update(updateData)
      .eq("id", id)
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        shift:shift_id(id, name, start_time, end_time, duration_hours)
      `
      )
      .single();

    if (err) throw error(400, err.message);
    const { employee_id, shift_id, ...assignment } = data;
    return assignment;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getEmployeeCurrentShiftService = async (employeeId, date) => {
  try {
    const { data, error: err } = await supabase
      .from("employee_shift_assignments")
      .select(
        `
        *,
        shift:shifts(id, name, start_time, end_time, duration_hours, is_active)
      `
      )
      .eq("employee_id", employeeId)
      .eq("is_active", true)
      .lte("assigned_from", date)
      .or(`assigned_to.is.null,assigned_to.gte.${date}`)
      .maybeSingle();

    if (err) throw error(400, err.message);

    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
