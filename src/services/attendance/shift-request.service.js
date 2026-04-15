import { supabase } from "../../config/supabase.js";
import { employeeByAuth } from "./assignment.service.js";
import { getShiftByIdService } from "./shift.service.js";

const error = (status, message) => Object.assign(new Error(message), { status });
const toPagination = (page, limit, count) => ({
  page,
  limit,
  total: count || 0,
  pages: Math.ceil((count || 0) / limit),
});
const applyExactFilters = (query, filters, keys) =>
  keys.reduce((acc, key) => (filters[key] ? acc.eq(key, filters[key]) : acc), query);
const ensurePendingStatus = (entity, action) => {
  if (entity.status !== "pending") {
    throw error(400, `Cannot ${action} a ${entity.status} request`);
  }
};

const normalizeDateOnly = (value, fieldName = "date") => {
  if (!value) {
    throw error(422, `${fieldName} is required`);
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw error(422, `Invalid ${fieldName}`);
    }
    return value.toISOString().split("T")[0];
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw error(422, `Invalid ${fieldName}`);
    }

    return parsed.toISOString().split("T")[0];
  }

  throw error(422, `Invalid ${fieldName}`);
};

export const createShiftChangeRequestService = async (userId, payload) => {
  try {
    const employee = await employeeByAuth(userId);
    const normalizedRequestDate = normalizeDateOnly(payload.request_date, "request_date");

    await getShiftByIdService(payload.current_shift_id);
    await getShiftByIdService(payload.requested_shift_id);

    const { data: existing, error: existErr } = await supabase
      .from("shift_change_requests")
      .select("id")
      .eq("employee_id", employee.id)
      .eq("request_date", normalizedRequestDate)
      .eq("status", "pending")
      .maybeSingle();

    if (existErr) throw error(400, existErr.message);
    if (existing) {
      throw error(400, "Pending request already exists for this date");
    }

    const { data, error: err } = await supabase
      .from("shift_change_requests")
      .insert({
        employee_id: employee.id,
        current_shift_id: payload.current_shift_id,
        requested_shift_id: payload.requested_shift_id,
        request_date: normalizedRequestDate,
        reason: payload.reason || null,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        current_shift:current_shift_id(id, name, start_time, end_time),
        requested_shift:requested_shift_id(id, name, start_time, end_time)
      `
      )
      .single();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const approveShiftChangeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const request = await getShiftChangeRequestByIdService(id);

    ensurePendingStatus(request, "approve");

    const { data, error: err } = await supabase
      .from("shift_change_requests")
      .update({
        status: "approved",
        approved_by: approver.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        current_shift:current_shift_id(id, name, start_time, end_time),
        requested_shift:requested_shift_id(id, name, start_time, end_time)
      `
      )
      .single();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const rejectShiftChangeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const request = await getShiftChangeRequestByIdService(id);

    ensurePendingStatus(request, "reject");

    const { data, error: err } = await supabase
      .from("shift_change_requests")
      .update({
        status: "rejected",
        approved_by: approver.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        current_shift:current_shift_id(id, name, start_time, end_time),
        requested_shift:requested_shift_id(id, name, start_time, end_time)
      `
      )
      .single();

    if (err) throw error(400, err.message);
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getShiftChangeRequestsService = async (filters, page, limit) => {
  try {
    let query = supabase
      .from("shift_change_requests")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        current_shift:current_shift_id(id, name, start_time, end_time),
        requested_shift:requested_shift_id(id, name, start_time, end_time)
      `,
        { count: "exact" }
      );

    query = applyExactFilters(query, filters, ["employee_id", "status"]);

    const { data, error: err, count } = await query
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (err) throw error(400, err.message);

    return {
      data,
      pagination: toPagination(page, limit, count),
    };
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};

export const getShiftChangeRequestByIdService = async (id) => {
  try {
    const { data, error: err } = await supabase
      .from("shift_change_requests")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name),
        current_shift:current_shift_id(id, name, start_time, end_time),
        requested_shift:requested_shift_id(id, name, start_time, end_time)
      `
      )
      .eq("id", id)
      .single();

    if (err && err.code === "PGRST116") {
      throw error(404, "Shift change request not found");
    }
    if (err) throw error(400, err.message);

    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
