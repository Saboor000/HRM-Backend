import { supabase } from "../../config/supabase.js";
import { employeeByAuth } from "./assignment.service.js";

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

export const createOvertimeRequestService = async (userId, payload) => {
  try {
    const employee = await employeeByAuth(userId);
    const [startH, startM] = payload.start_time.split(":").map(Number);
    const [endH, endM] = payload.end_time.split(":").map(Number);

    const startTotalMinutes = startH * 60 + startM;
    const endTotalMinutes = endH * 60 + endM;
    const calculatedMinutes = endTotalMinutes - startTotalMinutes;
    const calculatedHours = calculatedMinutes / 60;

    if (Math.abs(calculatedHours - payload.hours) > 0.1) {
      throw error(
        400,
        `Hours mismatch. Time difference: ${calculatedHours.toFixed(2)} hours`
      );
    }

    const { data, error: err } = await supabase
      .from("overtime_requests")
      .insert({
        employee_id: employee.id,
        date: payload.date,
        start_time: payload.start_time,
        end_time: payload.end_time,
        hours: payload.hours,
        reason: payload.reason || null,
        status: "pending",
        requested_at: new Date().toISOString(),
      })
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
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

export const approveOvertimeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const overtimeReq = await getOvertimeRequestByIdService(id);

    ensurePendingStatus(overtimeReq, "approve");

    const { data, error: err } = await supabase
      .from("overtime_requests")
      .update({
        status: "approved",
        approved_by: approver.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name)
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

export const rejectOvertimeRequestService = async (id, userId) => {
  try {
    const approver = await employeeByAuth(userId);

    const overtimeReq = await getOvertimeRequestByIdService(id);

    ensurePendingStatus(overtimeReq, "reject");

    const { data, error: err } = await supabase
      .from("overtime_requests")
      .update({
        status: "rejected",
        approved_by: approver.id,
        approved_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name)
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

export const getOvertimeRequestsService = async (filters, page, limit) => {
  try {
    let query = supabase
      .from("overtime_requests")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
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

export const getOvertimeRequestByIdService = async (id) => {
  try {
    const { data, error: err } = await supabase
      .from("overtime_requests")
      .select(
        `
        *,
        employee:employee_id(id, first_name, last_name, designation, department)
      `
      )
      .eq("id", id)
      .single();

    if (err && err.code === "PGRST116") {
      throw error(404, "Overtime request not found");
    }
    if (err) throw error(400, err.message);

    return data;
  } catch (e) {
    if (e.status) throw e;
    throw error(400, e.message);
  }
};
